import { describe, expect, it } from "vitest";
import {
  buildChangeSummary,
  buildPricingPayload,
  type PricingEdits,
  type PricingRows,
  penceToPounds,
  poundsToPence,
} from "@/lib/admin/pricing-changes";

const ROWS: PricingRows = {
  bundleConfigs: [
    {
      id: 10,
      name: "Six-class bundle",
      priceInPence: 7500,
      credits: 6,
      expiryDays: 90,
    },
  ],
};

const NOTHING_TYPED: PricingEdits = {
  bundles: {},
};

function edits(overrides: Partial<PricingEdits>): PricingEdits {
  return { ...NOTHING_TYPED, ...overrides };
}

describe("poundsToPence", () => {
  it("converts pounds as typed", () => {
    expect(poundsToPence("15.00")).toBe(1500);
    expect(poundsToPence("15")).toBe(1500);
    expect(poundsToPence(" 12.50 ")).toBe(1250);
  });

  it("rounds rather than truncating a third decimal", () => {
    expect(poundsToPence("15.005")).toBe(1501);
    expect(poundsToPence("0.1")).toBe(10);
  });

  it("reads an unusable value as free rather than throwing", () => {
    expect(poundsToPence("")).toBe(0);
    expect(poundsToPence("abc")).toBe(0);
    expect(poundsToPence("-5")).toBe(0);
  });
});

describe("penceToPounds", () => {
  it("always shows two decimal places", () => {
    expect(penceToPounds(1500)).toBe("15.00");
    expect(penceToPounds(1250)).toBe("12.50");
    expect(penceToPounds(0)).toBe("0.00");
  });
});

describe("buildChangeSummary", () => {
  it("is empty when nothing has been typed", () => {
    expect(buildChangeSummary(ROWS, NOTHING_TYPED)).toEqual([]);
  });

  it("ignores a field retyped to the value already stored", () => {
    expect(
      buildChangeSummary(
        ROWS,
        edits({ bundles: { 10: { priceInPence: "75.00" } } }),
      ),
    ).toEqual([]);
  });

  it("describes each bundle field in its own units", () => {
    expect(
      buildChangeSummary(
        ROWS,
        edits({
          bundles: {
            10: { priceInPence: "80.00", credits: "8", expiryDays: "120" },
          },
        }),
      ),
    ).toEqual([
      "Six-class bundle price: £75.00 → £80.00",
      "Six-class bundle credits: 6 → 8",
      "Six-class bundle expiry: 90 days → 120 days",
    ]);
  });

  it("reports only the bundle field that actually moved", () => {
    expect(
      buildChangeSummary(
        ROWS,
        edits({ bundles: { 10: { credits: "6", expiryDays: "120" } } }),
      ),
    ).toEqual(["Six-class bundle expiry: 90 days → 120 days"]);
  });
});

describe("buildPricingPayload", () => {
  it("sends nothing when nothing changed", () => {
    expect(buildPricingPayload(ROWS, NOTHING_TYPED)).toEqual({});
  });

  it("carries only the fields that changed on a row", () => {
    expect(
      buildPricingPayload(
        ROWS,
        edits({
          bundles: { 10: { priceInPence: "75.00", credits: "8" } },
        }),
      ),
    ).toEqual({
      bundleConfigs: [{ id: 10, credits: 8 }],
    });
  });

  it("carries exactly what the summary describes", () => {
    const typed = edits({
      bundles: { 10: { expiryDays: "120" } },
    });
    expect(buildChangeSummary(ROWS, typed)).toHaveLength(1);
    expect(buildPricingPayload(ROWS, typed)).toEqual({
      bundleConfigs: [{ id: 10, expiryDays: 120 }],
    });
  });
});
