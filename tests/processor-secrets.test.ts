import { describe, expect, it } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import { hexToBytes } from "@noble/hashes/utils.js";

import {
  generateP256PrivateKeyPem,
  generateTerminalSecret,
  generateTopicId,
} from "@features/payment-processors/secret-generation.ts";
import { buildRemoteConfigExport } from "@features/payment-processors/remote-config-export.ts";
import {
  loadPublishedProcessorConfig,
  PublishedConfigLoadError,
} from "@features/payment-processors/contracts/processor-config-load.ts";
import {
  buildProcessorBundle,
  bundleToForm,
  validateProcessorForm,
  type ProcessorConfigForm,
} from "@features/payment-processors/payment-processor-model.ts";
import { base64UrlEncode } from "@shared/lib/t3rminal-config-qr.ts";
import {
  extractP256CompressedPublicKey,
  parseP256PrivateKeyPem,
} from "@shared/utils/wire/pem.ts";
import { encryptCredentialEnvelope } from "@shared/utils/wire/credential-envelope.ts";

const PAYOUT = `0x${"11".repeat(32)}`;
const BASE64URL_32B_RE = /^[A-Za-z0-9_-]{43}$/; // 32 bytes → 43 chars, no padding
const BASE64URL_33B_RE = /^[A-Za-z0-9_-]{44}$/; // 33 bytes → 44 chars, no padding

function base64UrlDecode(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4);
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

async function formWithGeneratedSecret(over: Partial<ProcessorConfigForm> = {}): Promise<ProcessorConfigForm> {
  const secret = await generateTerminalSecret();
  return {
    groupId: "funkhaus-zola",
    merchantName: "Zola (test)",
    merchantId: "funkhaus",
    passkey: "a-long-group-passkey",
    terminals: [
      {
        terminalId: "1342061307",
        label: "Bar 1",
        payoutAddress: PAYOUT,
        topicId: secret.topicId,
        pemFile: secret.pemFile,
      },
    ],
    ...over,
  };
}

describe("generateTerminalSecret", () => {
  it("produces a 64-hex topic and a PKCS#8 PEM that parses to a 32-byte P-256 scalar", async () => {
    const secret = await generateTerminalSecret();
    expect(secret.topicId).toMatch(/^[0-9a-f]{64}$/);
    expect(secret.pemFile).toContain("-----BEGIN PRIVATE KEY-----");
    expect(parseP256PrivateKeyPem(secret.pemFile).length).toBe(32);
  });

  it("never repeats topics or keys (CSPRNG-backed)", async () => {
    const a = await generateTerminalSecret();
    const b = await generateTerminalSecret();
    expect(a.topicId).not.toBe(b.topicId);
    expect(a.pemFile).not.toBe(b.pemFile);
    expect(generateTopicId()).not.toBe(generateTopicId());
  });

  it("passes the full publish-form validator", async () => {
    expect(validateProcessorForm(await formWithGeneratedSecret())).toBeNull();
  });
});

describe("extractP256CompressedPublicKey", () => {
  // Independent reference: node:crypto's JWK gives the public point (x, y)
  // base64url-encoded; SEC1 compression = (y odd ? 0x03 : 0x02) || x.
  function nodeKeyWithExpectedCompressed(pemType: "sec1" | "pkcs8") {
    const pair = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
    const pem = pair.privateKey.export({ type: pemType, format: "pem" }).toString();
    const jwk = pair.publicKey.export({ format: "jwk" }) as { x: string; y: string };
    const x = base64UrlDecode(jwk.x);
    const y = base64UrlDecode(jwk.y);
    const expected = new Uint8Array(33);
    expected[0] = (y[31]! & 1) === 1 ? 0x03 : 0x02;
    expected.set(x, 1);
    return { pem, expected };
  }

  it("matches node:crypto's public point for PKCS#8 PEMs", () => {
    const { pem, expected } = nodeKeyWithExpectedCompressed("pkcs8");
    expect(extractP256CompressedPublicKey(pem)).toEqual(expected);
  });

  it("matches node:crypto's public point for SEC1 PEMs", () => {
    const { pem, expected } = nodeKeyWithExpectedCompressed("sec1");
    expect(extractP256CompressedPublicKey(pem)).toEqual(expected);
  });

  it("works on our WebCrypto-generated PEMs and carries a valid SEC1 prefix", async () => {
    const secret = await generateTerminalSecret();
    const compressed = extractP256CompressedPublicKey(secret.pemFile);
    expect(compressed.length).toBe(33);
    expect([0x02, 0x03]).toContain(compressed[0]);
  });
});

describe("key rotation (regenerate PEM)", () => {
  it("a regenerated PEM changes the exported public key but keeps the topic identity", async () => {
    const form = await formWithGeneratedSecret();
    const before = buildRemoteConfigExport(form)["1342061307"]!;

    const rotatedPem = await generateP256PrivateKeyPem();
    expect(rotatedPem).not.toBe(form.terminals[0]!.pemFile);

    const rotatedForm = {
      ...form,
      terminals: [{ ...form.terminals[0]!, pemFile: rotatedPem }],
    };
    // The rotated form still passes the publish validator (parseable P-256 key).
    expect(validateProcessorForm(rotatedForm)).toBeNull();

    const after = buildRemoteConfigExport(rotatedForm)["1342061307"]!;
    expect(after.topic).toBe(before.topic); // identity unchanged
    expect(after.key).not.toBe(before.key); // credential rotated
  });
});

describe("buildRemoteConfigExport", () => {
  // The literal expected-output strings from the payer app's remote-config format.
  const EXAMPLE_TOPIC = "0s75mtOxaBp5tz5PgGx3tj18Bgd5Bd16_bHfOeA3Rr8";
  const EXAMPLE_KEY = "A75-4xbe4IGO0oZjOUZBWG8AuBonq2Cgu-VSNwwR2964";

  it("golden: the example strings are base64url (no pad) of 32B topic / 33B compressed pubkey, and round-trip our encoder", () => {
    const topicBytes = base64UrlDecode(EXAMPLE_TOPIC);
    const keyBytes = base64UrlDecode(EXAMPLE_KEY);
    expect(topicBytes.length).toBe(32);
    expect(keyBytes.length).toBe(33);
    expect([0x02, 0x03]).toContain(keyBytes[0]); // SEC1 compressed-point prefix
    // Alphabet/padding parity: our encoder reproduces the examples byte-exactly.
    expect(base64UrlEncode(topicBytes)).toBe(EXAMPLE_TOPIC);
    expect(base64UrlEncode(keyBytes)).toBe(EXAMPLE_KEY);
  });

  it("keys by terminalId; topic = base64url(topic bytes), key = base64url(compressed PUBLIC key), name = label", async () => {
    const form = await formWithGeneratedSecret();
    const terminal = form.terminals[0]!;
    const entry = buildRemoteConfigExport(form)["1342061307"]!;

    expect(entry.topic).toMatch(BASE64URL_32B_RE);
    expect(entry.key).toMatch(BASE64URL_33B_RE);
    expect(entry.topic).toBe(base64UrlEncode(hexToBytes(terminal.topicId)));
    expect(entry.key).toBe(base64UrlEncode(extractP256CompressedPublicKey(terminal.pemFile)));
    expect(entry.name).toBe("Bar 1");
  });

  it("never exports the private scalar", async () => {
    const form = await formWithGeneratedSecret();
    const terminal = form.terminals[0]!;
    const entry = buildRemoteConfigExport(form)["1342061307"]!;
    const scalar = parseP256PrivateKeyPem(terminal.pemFile);
    expect(entry.key).not.toBe(base64UrlEncode(scalar));
    expect(base64UrlDecode(entry.key)).not.toEqual(scalar);
  });

  it("falls back to the merchant name when the terminal label is empty", async () => {
    const base = await formWithGeneratedSecret();
    const form = { ...base, terminals: [{ ...base.terminals[0]!, label: "  " }] };
    expect(buildRemoteConfigExport(form)["1342061307"]!.name).toBe("Zola (test)");
  });
});

describe("loadPublishedProcessorConfig", () => {
  async function publishedEnvelope(form: ProcessorConfigForm, passkey: string): Promise<string> {
    const bundle = buildProcessorBundle(form);
    const envelope = await encryptCredentialEnvelope(
      new TextEncoder().encode(JSON.stringify(bundle)),
      passkey,
    );
    return JSON.stringify(envelope);
  }

  function fetchReturning(body: string, status = 200): typeof fetch {
    return (async () => new Response(body, { status })) as typeof fetch;
  }

  it("fetches, decrypts, and round-trips back to an editable form", async () => {
    const form = await formWithGeneratedSecret();
    const body = await publishedEnvelope(form, "pw");

    const bundle = await loadPublishedProcessorConfig({
      groupId: "funkhaus-zola",
      cid: "bafk-test",
      passkey: "pw",
      fetchImpl: fetchReturning(body),
    });
    expect(bundle).toEqual(buildProcessorBundle(form));

    const restored = bundleToForm(bundle, "pw");
    expect(restored.groupId).toBe(form.groupId);
    expect(restored.merchantName).toBe(form.merchantName);
    expect(restored.merchantId).toBe(form.merchantId);
    expect(restored.terminals).toEqual(form.terminals);
    expect(validateProcessorForm(restored)).toBeNull();
  });

  it("fails closed on a wrong passkey", async () => {
    const body = await publishedEnvelope(await formWithGeneratedSecret(), "right");
    await expect(
      loadPublishedProcessorConfig({
        groupId: "funkhaus-zola",
        cid: "bafk-test",
        passkey: "wrong",
        fetchImpl: fetchReturning(body),
      }),
    ).rejects.toThrow(/passkey/i);
  });

  it("rejects a bundle that belongs to a different group", async () => {
    const body = await publishedEnvelope(await formWithGeneratedSecret(), "pw");
    await expect(
      loadPublishedProcessorConfig({
        groupId: "someone-else",
        cid: "bafk-test",
        passkey: "pw",
        fetchImpl: fetchReturning(body),
      }),
    ).rejects.toBeInstanceOf(PublishedConfigLoadError);
  });

  it("rejects gateway errors", async () => {
    await expect(
      loadPublishedProcessorConfig({
        groupId: "g",
        cid: "bafk-test",
        passkey: "pw",
        fetchImpl: fetchReturning("not found", 404),
      }),
    ).rejects.toThrow(/HTTP 404/);
  });

  it("reads via the host transport and never touches HTTPS", async () => {
    const form = await formWithGeneratedSecret();
    const bytes = new TextEncoder().encode(await publishedEnvelope(form, "pw"));
    const fetchImpl = (() => {
      throw new Error("HTTPS must not be used in a host");
    }) as unknown as typeof fetch;
    const bundle = await loadPublishedProcessorConfig({
      groupId: "funkhaus-zola",
      cid: "bafk-test",
      passkey: "pw",
      fetchImpl,
      fetchPreimage: async () => ({ kind: "ok", bytes }),
    });
    expect(bundle).toEqual(buildProcessorBundle(form));
  });

  it("throws when the host preimage is unavailable", async () => {
    await expect(
      loadPublishedProcessorConfig({
        groupId: "funkhaus-zola",
        cid: "bafk-test",
        passkey: "pw",
        fetchPreimage: async () => ({ kind: "unavailable", reason: "timed out" }),
      }),
    ).rejects.toThrow(/timed out/);
  });
});
