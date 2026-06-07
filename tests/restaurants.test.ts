/**
 * Restaurant draft store contract.
 *
 * The store is the producer-side source of truth for what gets embedded
 * in the QR. The branching that can actually break:
 *   - form → wire: trims, drops blank optionals, and refuses (returns
 *     null) when id or name is blank.
 *   - wire → form: blank-fills absent optionals so inputs stay controlled.
 *   - persisted payload decode is defensive (corrupt KV never throws).
 *   - legacy-format migration: pre-rename `merchant-profiles/v1`
 *     payloads can still be folded into the new {@link Restaurant} map
 *     using their merchantId as the new restaurant id.
 *   - picker hint cache: stages a per-merchantKey hint that
 *     `consume()` claims exactly once and rejects for any other key.
 */

import { afterEach, describe, expect, it } from "vitest";

import {
  EMPTY_RESTAURANT_FORM,
  decodeLegacyMerchantProfilesPayload,
  decodeRestaurantsPayload,
  encodeRestaurantsPayload,
  formToRestaurant,
  restaurantPickerHint,
  restaurantToForm,
  type Restaurant,
  type RestaurantForm,
} from "@features/restaurants/restaurants.ts";
import type { MerchantProfile } from "@shared/lib/config-qr";

const FULL_FORM: RestaurantForm = {
  id: "funkhaus",
  name: "Funkhaus Berlin Events GmbH",
  addressLine1: "Nalepastra\u00dfe 18",
  addressLine2: "12459 Berlin",
  phone: "030/12085416",
  taxId: "DE263789123",
};

describe("formToRestaurant", () => {
  it("trims fields and keeps every populated value", () => {
    expect(
      formToRestaurant({
        ...FULL_FORM,
        id: "  funkhaus  ",
        name: "  Funkhaus Berlin Events GmbH  ",
      }),
    ).toEqual({
      id: "funkhaus",
      profile: {
        name: "Funkhaus Berlin Events GmbH",
        addressLine1: "Nalepastra\u00dfe 18",
        addressLine2: "12459 Berlin",
        phone: "030/12085416",
        taxId: "DE263789123",
      },
    });
  });

  it("drops blank / whitespace-only optional fields", () => {
    expect(
      formToRestaurant({
        id: "solo",
        name: "Solo Bar",
        addressLine1: "   ",
        addressLine2: "",
        phone: "  030/1  ",
        taxId: "",
      }),
    ).toEqual({ id: "solo", profile: { name: "Solo Bar", phone: "030/1" } });
  });

  it("returns null when id is blank", () => {
    expect(formToRestaurant({ ...FULL_FORM, id: "" })).toBeNull();
    expect(formToRestaurant({ ...FULL_FORM, id: "   " })).toBeNull();
  });

  it("returns null when name is blank, regardless of other fields", () => {
    expect(formToRestaurant(EMPTY_RESTAURANT_FORM)).toBeNull();
    expect(formToRestaurant({ ...FULL_FORM, name: "   " })).toBeNull();
  });
});

describe("restaurantToForm", () => {
  it("returns the empty form for null / undefined", () => {
    expect(restaurantToForm(null)).toEqual(EMPTY_RESTAURANT_FORM);
    expect(restaurantToForm(undefined)).toEqual(EMPTY_RESTAURANT_FORM);
  });

  it("blank-fills absent optional fields so inputs stay controlled", () => {
    expect(
      restaurantToForm({ id: "solo", profile: { name: "Solo Bar", phone: "030/1" } }),
    ).toEqual({
      id: "solo",
      name: "Solo Bar",
      addressLine1: "",
      addressLine2: "",
      phone: "030/1",
      taxId: "",
    });
  });

  it("round-trips a wire restaurant through form and back", () => {
    const wire: Restaurant = { id: "solo", profile: { name: "Solo Bar", taxId: "DE1" } };
    expect(formToRestaurant(restaurantToForm(wire))).toEqual(wire);
  });
});

describe("encode / decodeRestaurantsPayload", () => {
  it("round-trips a keyed map of restaurants", () => {
    const restaurants = new Map<string, Restaurant>([
      [
        "funkhaus",
        { id: "funkhaus", profile: { name: "Funkhaus Berlin Events GmbH", addressLine1: "Nalepastra\u00dfe 18" } },
      ],
      ["sisyphos", { id: "sisyphos", profile: { name: "Sisyphos" } }],
    ]);
    const decoded = decodeRestaurantsPayload(encodeRestaurantsPayload(restaurants));
    expect(decoded).toEqual(restaurants);
  });

  it("returns an empty map for corrupt or wrong-version payloads", () => {
    expect(decodeRestaurantsPayload(null).size).toBe(0);
    expect(decodeRestaurantsPayload("nope").size).toBe(0);
    expect(decodeRestaurantsPayload({ version: 2, restaurants: {} }).size).toBe(0);
    expect(decodeRestaurantsPayload({ version: 1 }).size).toBe(0);
  });

  it("drops individual entries that are missing a name", () => {
    const decoded = decodeRestaurantsPayload({
      version: 1,
      restaurants: {
        ok: { name: "Funkhaus" },
        broken: { addressLine1: "no name here" },
        alsoBroken: { name: "" },
        "": { name: "blank-id-also-rejected" },
      },
    });
    expect([...decoded.keys()]).toEqual(["ok"]);
    expect(decoded.get("ok")).toEqual({ id: "ok", profile: { name: "Funkhaus" } });
  });

  it("ignores non-string optional fields when decoding", () => {
    const decoded = decodeRestaurantsPayload({
      version: 1,
      restaurants: { ok: { name: "Funkhaus", phone: 49, taxId: "DE1" } },
    });
    expect(decoded.get("ok")).toEqual({
      id: "ok",
      profile: { name: "Funkhaus", taxId: "DE1" },
    });
  });
});

describe("decodeLegacyMerchantProfilesPayload", () => {
  it("folds pre-rename merchant-profiles/v1 payloads into Restaurant map keyed by merchantId", () => {
    const legacy = {
      version: 1,
      profiles: {
        funkhaus: { name: "Funkhaus Berlin Events GmbH", addressLine1: "Nalepastra\u00dfe 18" },
        sisyphos: { name: "Sisyphos" },
      },
    } satisfies { version: 1; profiles: Record<string, MerchantProfile> };
    const decoded = decodeLegacyMerchantProfilesPayload(legacy);
    expect(decoded.get("funkhaus")).toEqual({
      id: "funkhaus",
      profile: { name: "Funkhaus Berlin Events GmbH", addressLine1: "Nalepastra\u00dfe 18" },
    });
    expect(decoded.get("sisyphos")).toEqual({ id: "sisyphos", profile: { name: "Sisyphos" } });
  });

  it("returns an empty map for missing / malformed legacy payloads", () => {
    expect(decodeLegacyMerchantProfilesPayload(null).size).toBe(0);
    expect(decodeLegacyMerchantProfilesPayload({ version: 2, profiles: {} }).size).toBe(0);
    expect(decodeLegacyMerchantProfilesPayload({ version: 1 }).size).toBe(0);
  });
});

describe("restaurantPickerHint", () => {
  afterEach(() => restaurantPickerHint.clear());

  it("returns the staged id once, then null", () => {
    restaurantPickerHint.set("merchant-key-1", "funkhaus-bar");
    expect(restaurantPickerHint.consume("merchant-key-1")).toBe("funkhaus-bar");
    expect(restaurantPickerHint.consume("merchant-key-1")).toBeNull();
  });

  it("refuses to leak across terminals — a stale hint for one merchantKey isn't claimable by another", () => {
    restaurantPickerHint.set("merchant-key-1", "funkhaus-bar");
    expect(restaurantPickerHint.consume("merchant-key-2")).toBeNull();
    // The hint is still claimable by the originating key — `consume`
    // only clears the cache when it actually returns a value.
    expect(restaurantPickerHint.consume("merchant-key-1")).toBe("funkhaus-bar");
  });

  it("clear() drops a staged hint without surfacing it", () => {
    restaurantPickerHint.set("merchant-key-1", "funkhaus-bar");
    restaurantPickerHint.clear();
    expect(restaurantPickerHint.consume("merchant-key-1")).toBeNull();
  });
});
