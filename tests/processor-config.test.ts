import { describe, expect, it } from "vitest";
import { generateKeyPairSync } from "node:crypto";

import {
  decryptCredentialEnvelope,
  encryptCredentialEnvelope,
} from "@shared/utils/wire/credential-envelope.ts";
import {
  buildProcessorBundle,
  validateProcessorForm,
  type ProcessorConfigForm,
  type ProcessorTerminalForm,
} from "@features/payment-processors/payment-processor-model.ts";
import { publishProcessorConfig } from "@features/payment-processors/contracts/processor-config-storage.ts";
import { calculateBulletinCid, calculateBulletinCidObject } from "@features/items/contracts/cid.ts";

// A real SEC1 P-256 private-key PEM so the vendored parser accepts it.
const PEM = generateKeyPairSync("ec", { namedCurve: "prime256v1" })
  .privateKey.export({ type: "sec1", format: "pem" })
  .toString();

const PAYOUT = `0x${"11".repeat(32)}`;
const TOPIC_A = "a".repeat(64);
const TOPIC_B = "b".repeat(64);

function terminal(over: Partial<ProcessorTerminalForm> = {}): ProcessorTerminalForm {
  return { terminalId: "bar-1", label: "Bar", payoutAddress: PAYOUT, topicId: TOPIC_A, pemFile: PEM, ...over };
}

function validForm(over: Partial<ProcessorConfigForm> = {}): ProcessorConfigForm {
  return {
    groupId: "funkhaus-zola",
    merchantName: "Zola",
    merchantId: "funkhaus",
    passkey: "a-long-group-passkey",
    terminals: [terminal()],
    ...over,
  };
}

function bytesToHex(bytes: Uint8Array): `0x${string}` {
  let hex = "0x";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return hex as `0x${string}`;
}

describe("credential-envelope (admin vendored copy)", () => {
  it("round-trips decrypt(encrypt(x)) === x with the documented field shape", async () => {
    const plaintext = new TextEncoder().encode(JSON.stringify({ hello: "world", n: 42 }));
    const envelope = await encryptCredentialEnvelope(plaintext, "pw");
    expect(envelope.format).toBe("w3s-credential-envelope");
    expect(envelope.version).toBe(1);
    expect(envelope.kdf).toBe("PBKDF2-SHA256");
    expect(envelope.cipher).toBe("AES-256-GCM");
    for (const field of ["salt", "iv", "ciphertext"] as const) {
      expect(typeof envelope[field]).toBe("string");
      expect(envelope[field].length).toBeGreaterThan(0);
    }
    const back = await decryptCredentialEnvelope(envelope, "pw");
    expect(new TextDecoder().decode(back)).toBe(JSON.stringify({ hello: "world", n: 42 }));
  });

  it("rejects a wrong passkey (fail-closed)", async () => {
    const envelope = await encryptCredentialEnvelope(new TextEncoder().encode("secret"), "right");
    await expect(decryptCredentialEnvelope(envelope, "wrong")).rejects.toThrow();
  });
});

describe("validateProcessorForm", () => {
  it("accepts a well-formed config", () => {
    expect(validateProcessorForm(validForm())).toBeNull();
  });

  it("rejects an empty merchant id", () => {
    expect(validateProcessorForm(validForm({ merchantId: "  " }))).toMatch(/merchant id/i);
  });

  it("rejects an empty passkey", () => {
    expect(validateProcessorForm(validForm({ passkey: "" }))).toMatch(/passkey/i);
  });

  it("rejects a non-hex topicId", () => {
    expect(validateProcessorForm(validForm({ terminals: [terminal({ topicId: "nothex" })] }))).toMatch(/topicId/i);
  });

  it("rejects duplicate topicIds across terminals", () => {
    expect(
      validateProcessorForm(
        validForm({
          terminals: [terminal({ terminalId: "t1" }), terminal({ terminalId: "t2", topicId: TOPIC_A })],
        }),
      ),
    ).toMatch(/unique/i);
  });

  it("rejects an invalid payout address", () => {
    expect(validateProcessorForm(validForm({ terminals: [terminal({ payoutAddress: "not-an-address" })] }))).toMatch(
      /payout/i,
    );
  });

  it("rejects an unparseable PEM", () => {
    expect(validateProcessorForm(validForm({ terminals: [terminal({ pemFile: "not a pem" })] }))).toMatch(/PEM/i);
  });
});

describe("buildProcessorBundle", () => {
  it("maps each terminal into a v1.local + v2 entry and omits empty labels", () => {
    const bundle = buildProcessorBundle(
      validForm({
        terminals: [terminal({ terminalId: "bar-1", label: "Bar" }), terminal({ terminalId: "kitchen", label: "", topicId: TOPIC_B })],
      }),
    );
    expect(bundle.profile).toEqual({ merchantName: "Zola", merchantId: "funkhaus" });
    expect(bundle.v1).toEqual({
      type: "rfc6-payments",
      local: {
        terminals: [
          { terminalId: "bar-1", payoutAddress: PAYOUT, label: "Bar" },
          { terminalId: "kitchen", payoutAddress: PAYOUT },
        ],
      },
    });
    expect(bundle.v2.terminals[0]).toEqual({
      topicId: TOPIC_A,
      terminalId: "bar-1",
      payoutAddress: PAYOUT,
      pemFile: PEM,
      label: "Bar",
    });
    expect(bundle.v2.terminals[1]).toEqual({
      topicId: TOPIC_B,
      terminalId: "kitchen",
      payoutAddress: PAYOUT,
      pemFile: PEM,
    });
  });
});

describe("publishProcessorConfig", () => {
  it("encrypts + CIDs the exact uploaded bytes and round-trips to the bundle", async () => {
    const bundle = buildProcessorBundle(validForm());
    let uploaded: Uint8Array | null = null;
    const preimage = {
      submit: async (bytes: Uint8Array): Promise<`0x${string}`> => {
        uploaded = bytes;
        return bytesToHex(calculateBulletinCidObject(bytes).multihash.digest);
      },
    };

    const result = await publishProcessorConfig({ bundle, passkey: "pw", preimage, inHost: () => true });

    expect(uploaded).not.toBeNull();
    const bytes = uploaded as unknown as Uint8Array;
    expect(result.size).toBe(bytes.length);
    expect(result.cid).toBe(calculateBulletinCid(bytes));

    const envelope = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
    const plaintext = await decryptCredentialEnvelope(envelope, "pw");
    expect(JSON.parse(new TextDecoder().decode(plaintext))).toEqual(bundle);
  });

  it("aborts outside a host before any upload", async () => {
    let called = false;
    const preimage = {
      submit: async (): Promise<`0x${string}`> => {
        called = true;
        return "0x";
      },
    };
    await expect(
      publishProcessorConfig({ bundle: buildProcessorBundle(validForm()), passkey: "pw", preimage, inHost: () => false }),
    ).rejects.toThrow(/host/i);
    expect(called).toBe(false);
  });
});
