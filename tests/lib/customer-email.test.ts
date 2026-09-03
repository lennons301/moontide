import { describe, expect, it } from "vitest";
import { normaliseEmail } from "@/lib/customers/email";

/**
 * The one place a customer's email address is made comparable. Five handlers
 * used to each decide for themselves — four of them by not deciding — so
 * `Ada@example.com` and `ada@example.com` were two customers to the duplicate
 * check, to the uniqueness index and to the bundle lookup.
 */

describe("normaliseEmail", () => {
  it("folds the case a customer typed", () => {
    expect(normaliseEmail("Ada@example.com")).toBe("ada@example.com");
    expect(normaliseEmail("ADA@EXAMPLE.COM")).toBe("ada@example.com");
  });

  it("drops the whitespace a paste or a phone keyboard adds", () => {
    expect(normaliseEmail("  ada@example.com ")).toBe("ada@example.com");
    expect(normaliseEmail("\tAda@Example.com\n")).toBe("ada@example.com");
  });

  it("leaves an address that is already normalised alone", () => {
    expect(normaliseEmail("ada@example.com")).toBe("ada@example.com");
  });

  it("answers with an empty string for nothing at all", () => {
    expect(normaliseEmail(undefined)).toBe("");
    expect(normaliseEmail(null)).toBe("");
    expect(normaliseEmail("   ")).toBe("");
  });
});
