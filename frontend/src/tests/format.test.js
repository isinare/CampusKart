import { describe, expect, it } from "vitest";
import { money, pluralize, shortDate, shortDateTime } from "../utils/format.js";

describe("CampusKart formatting", () => {
  it("formats Indian rupee amounts", () => {
    expect(money(1250)).toBe("₹1,250");
    expect(money(0)).toBe("₹0");
  });

  it("returns a dash for missing dates", () => {
    expect(shortDate(null)).toBe("-");
    expect(shortDateTime("")).toBe("-");
  });

  it("formats seeded date-time strings", () => {
    expect(shortDate("2026-09-10")).toContain("2026");
    expect(shortDateTime("2026-09-10 10:00:00")).toContain("10");
  });

  it("pluralises counts", () => {
    expect(pluralize(1, "item")).toBe("1 item");
    expect(pluralize(2, "item")).toBe("2 items");
  });
});
