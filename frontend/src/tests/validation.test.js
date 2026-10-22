import { describe, expect, it } from "vitest";
import {
  isCollegeEmail,
  isPhone,
  isStrongEnoughPassword,
  validListing,
  validPrice,
  validSemester,
} from "../validation/validators.js";

describe("CampusKart validation", () => {
  it("accepts only college e-mail domains", () => {
    expect(isCollegeEmail("aarav.sharma@college.edu.in")).toBe(true);
    expect(isCollegeEmail("student@university.ac.in")).toBe(true);
    expect(isCollegeEmail("student@gmail.com")).toBe(false);
  });

  it("requires exactly ten phone digits", () => {
    expect(isPhone("9876543210")).toBe(true);
    expect(isPhone("98765 43210")).toBe(false);
    expect(isPhone("12345")).toBe(false);
  });

  it("enforces the eight-character password minimum", () => {
    expect(isStrongEnoughPassword("pass1234")).toBe(true);
    expect(isStrongEnoughPassword("short")).toBe(false);
  });

  it("keeps semester inside the matching academic year", () => {
    expect(validSemester(1, 1)).toBe(true);
    expect(validSemester(1, 2)).toBe(true);
    expect(validSemester(3, 5)).toBe(true);
    expect(validSemester(3, 2)).toBe(false);
  });

  it("validates listing text and condition", () => {
    const listing = {
      item_name: "DBMS Textbook",
      description: "A clean copy with all pages and no writing in the margins.",
      item_condition: "GOOD",
      pickup_location: "Library",
    };
    expect(validListing(listing)).toBe(true);
    expect(validListing({ ...listing, description: "too short" })).toBe(false);
    expect(validListing({ ...listing, item_condition: "BROKEN" })).toBe(false);
  });

  it("never lets the selling price exceed the original price", () => {
    expect(validPrice(650, 300)).toBe(true);
    expect(validPrice(650, 700)).toBe(false);
    expect(validPrice(0, 0)).toBe(false);
  });
});
