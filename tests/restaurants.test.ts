import { afterEach, describe, expect, it } from "vitest";

import {
  EMPTY_RESTAURANT_FORM,
  formToRestaurant,
  restaurantPickerHint,
  restaurantToForm,
  type Restaurant,
  type RestaurantForm,
} from "@features/restaurants/restaurants.ts";

const FULL_FORM: RestaurantForm = {
  id: "funkhaus-zola",
  name: "Zola",
  merchantId: "funkhaus",
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
        id: "  funkhaus-zola  ",
        name: "  Zola  ",
        merchantId: "  funkhaus  ",
      }),
    ).toEqual({
      id: "funkhaus-zola",
      merchantId: "funkhaus",
      profile: {
        name: "Zola",
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
        merchantId: "solo-m",
        addressLine1: "   ",
        addressLine2: "",
        phone: "  030/1  ",
        taxId: "",
      }),
    ).toEqual({ id: "solo", merchantId: "solo-m", profile: { name: "Solo Bar", phone: "030/1" } });
  });

  it("returns null when id is blank", () => {
    expect(formToRestaurant({ ...FULL_FORM, id: "" })).toBeNull();
    expect(formToRestaurant({ ...FULL_FORM, id: "   " })).toBeNull();
  });

  it("returns null when name is blank, regardless of other fields", () => {
    expect(formToRestaurant(EMPTY_RESTAURANT_FORM)).toBeNull();
    expect(formToRestaurant({ ...FULL_FORM, name: "   " })).toBeNull();
  });

  it("returns null when merchantId is blank", () => {
    expect(formToRestaurant({ ...FULL_FORM, merchantId: "" })).toBeNull();
    expect(formToRestaurant({ ...FULL_FORM, merchantId: "   " })).toBeNull();
  });
});

describe("restaurantToForm", () => {
  it("returns the empty form for null / undefined", () => {
    expect(restaurantToForm(null)).toEqual(EMPTY_RESTAURANT_FORM);
    expect(restaurantToForm(undefined)).toEqual(EMPTY_RESTAURANT_FORM);
  });

  it("blank-fills absent optional fields so inputs stay controlled", () => {
    expect(
      restaurantToForm({
        id: "solo",
        merchantId: "solo-m",
        profile: { name: "Solo Bar", phone: "030/1" },
      }),
    ).toEqual({
      id: "solo",
      name: "Solo Bar",
      merchantId: "solo-m",
      addressLine1: "",
      addressLine2: "",
      phone: "030/1",
      taxId: "",
    });
  });

  it("round-trips a wire restaurant through form and back", () => {
    const wire: Restaurant = {
      id: "solo",
      merchantId: "solo-m",
      profile: { name: "Solo Bar", taxId: "DE1" },
    };
    expect(formToRestaurant(restaurantToForm(wire))).toEqual(wire);
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
