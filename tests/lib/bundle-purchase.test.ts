import { describe, expect, it } from "vitest";
import {
  bundleConfigIdFromSession,
  bundleExpiry,
  bundlePaidAt,
  bundleTermsMetadata,
  decideBundleTerms,
} from "@/lib/bundles/purchase";

const config = {
  id: 1,
  name: "6-Class Bundle",
  credits: 6,
  expiryDays: 90,
};

/** What checkout puts in the session for that config. */
const soldTerms = bundleTermsMetadata(config);

describe("decideBundleTerms", () => {
  it("takes the terms the session was sold with", () => {
    const decision = decideBundleTerms({ metadata: soldTerms, config });

    expect(decision).toEqual({
      ok: true,
      source: "session",
      terms: {
        name: "6-Class Bundle",
        credits: 6,
        expiryDays: 90,
        configId: 1,
      },
    });
  });

  it("ignores a config edited between paying and delivery", () => {
    // Gabrielle cut the bundle to 4 classes and 30 days while this session was
    // open. The customer paid for six, on the terms she was shown.
    const decision = decideBundleTerms({
      metadata: soldTerms,
      config: { ...config, credits: 4, expiryDays: 30, name: "4-Class Bundle" },
    });

    expect(decision).toMatchObject({
      ok: true,
      source: "session",
      terms: { name: "6-Class Bundle", credits: 6, expiryDays: 90 },
    });
  });

  it("grants from the session even when the config row has gone", () => {
    const decision = decideBundleTerms({ metadata: soldTerms, config: null });

    expect(decision).toMatchObject({
      ok: true,
      source: "session",
      // Nothing to point the foreign key at, and the grant does not depend on
      // there being something.
      terms: { credits: 6, expiryDays: 90, configId: null },
    });
  });

  it("falls back to the config for a session created before terms travelled", () => {
    const decision = decideBundleTerms({
      metadata: { bundleConfigId: "1" },
      config,
    });

    expect(decision).toEqual({
      ok: true,
      source: "config",
      terms: {
        name: "6-Class Bundle",
        credits: 6,
        expiryDays: 90,
        configId: 1,
      },
    });
  });

  it("refuses when there are neither session terms nor a config", () => {
    const decision = decideBundleTerms({
      metadata: { bundleConfigId: "999" },
      config: null,
    });

    expect(decision.ok).toBe(false);
  });

  it("treats unusable metadata as absent rather than as terms", () => {
    for (const metadata of [
      { bundleCredits: "six", bundleExpiryDays: "90", bundleName: "Bundle" },
      { bundleCredits: "6", bundleExpiryDays: "0", bundleName: "Bundle" },
      { bundleCredits: "6", bundleExpiryDays: "90", bundleName: "  " },
      { bundleCredits: "-6", bundleExpiryDays: "90", bundleName: "Bundle" },
    ]) {
      expect(decideBundleTerms({ metadata, config: null }).ok).toBe(false);
      expect(decideBundleTerms({ metadata, config })).toMatchObject({
        source: "config",
      });
    }
  });
});

describe("bundleConfigIdFromSession", () => {
  it("reads the id the session names", () => {
    expect(bundleConfigIdFromSession({ bundleConfigId: "7" })).toBe(7);
  });

  it("is null rather than NaN when there is nothing to read", () => {
    expect(bundleConfigIdFromSession({})).toBeNull();
    expect(bundleConfigIdFromSession({ bundleConfigId: "" })).toBeNull();
    expect(bundleConfigIdFromSession({ bundleConfigId: "abc" })).toBeNull();
  });
});

describe("bundlePaidAt", () => {
  it("reads Stripe's whole-second timestamp", () => {
    const created = Math.floor(Date.UTC(2026, 0, 10, 12, 0, 0) / 1000);
    expect(bundlePaidAt(created).toISOString()).toBe(
      "2026-01-10T12:00:00.000Z",
    );
  });

  it("falls back to now when a session carries no timestamp", () => {
    const before = Date.now();
    const paidAt = bundlePaidAt(undefined);
    expect(paidAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(paidAt.getTime()).toBeLessThanOrEqual(Date.now());
  });
});

describe("bundleExpiry", () => {
  it("counts from when the customer paid, not from now", () => {
    const paidAt = new Date("2026-01-10T12:00:00.000Z");
    expect(bundleExpiry(paidAt, 90).toISOString()).toBe(
      "2026-04-10T12:00:00.000Z",
    );
  });

  it("gives a late delivery no extra validity", () => {
    const paidAt = new Date("2026-01-10T12:00:00.000Z");
    const firstAttempt = bundleExpiry(paidAt, 90);
    const retryThreeDaysLater = bundleExpiry(paidAt, 90);
    expect(retryThreeDaysLater).toEqual(firstAttempt);
  });
});

describe("bundleTermsMetadata", () => {
  it("writes every term the webhook reads back, as strings", () => {
    expect(bundleTermsMetadata(config)).toEqual({
      bundleConfigId: "1",
      bundleName: "6-Class Bundle",
      bundleCredits: "6",
      bundleExpiryDays: "90",
    });
  });
});
