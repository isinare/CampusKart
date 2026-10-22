const test = require("node:test");
const assert = require("node:assert/strict");

const { RULES, requireFields } = require("../validators");
const templates = require("../templates/notifications");
const { MODELS, VALIDATORS } = require("../models");
const { TOPIC } = require("../events");

test("college e-mail validation matches the database rule", () => {
  assert.equal(RULES.collegeEmail("aarav.sharma@college.edu.in"), true);
  assert.equal(RULES.collegeEmail("student@university.ac.in"), true);
  assert.equal(RULES.collegeEmail("student@gmail.com"), false);
});

test("phone, password and PRN validation", () => {
  assert.equal(RULES.phone("9876543210"), true);
  assert.equal(RULES.phone("98765 43210"), false);
  assert.equal(RULES.password("pass1234"), true);
  assert.equal(RULES.password("short"), false);
  assert.equal(RULES.prn("23070122041"), true);
  assert.equal(RULES.prn("AB-1"), false);
});

test("semester must belong to its academic year", () => {
  assert.equal(RULES.semester(1, 1), true);
  assert.equal(RULES.semester(1, 2), true);
  assert.equal(RULES.semester(3, 5), true);
  assert.equal(RULES.semester(3, 4), false);
  assert.equal(RULES.semester(6, 11), false);
});

test("listing and price rules mirror the original validation", () => {
  const listing = {
    item_name: "DBMS Textbook",
    description: "A clean copy with all pages and no writing in the margins.",
    item_condition: "GOOD",
    pickup_location: "Library",
  };
  assert.equal(RULES.listing(listing), true);
  assert.equal(RULES.listing({ ...listing, description: "too short" }), false);
  assert.equal(RULES.condition("BROKEN"), false);
  assert.equal(RULES.price(650, 300), true);
  assert.equal(RULES.price(650, 700), false);
});

test("required-field helper reports every missing field", () => {
  assert.throws(
    () => requireFields({ email: "a@b.edu.in" }, ["email", "password"]),
    /password/
  );
});

test("e-mail templates keep the original wording", () => {
  assert.match(templates.requestAccepted({ targetName: "Calculator", place: "Library", when: "10:00" }).text, /Calculator/);
  assert.match(templates.requestDeclined({ targetName: "Calculator" }).subject, /declined/);
  assert.match(templates.requestCountered({ targetName: "Calculator", counter: 500 }).text, /500/);
  assert.match(templates.handoverRecorded({ billId: "BL101" }).text, /BL101/);
});

test("every model has a collection and primary key", () => {
  for (const [name, model] of Object.entries(MODELS)) {
    assert.ok(model.collection, `${name} has no collection`);
    assert.ok(model.pk, `${name} has no primary key`);
  }
  assert.ok(Object.keys(VALIDATORS).length >= 10);
});

test("event topics cover the critical marketplace actions", () => {
  for (const action of ["createItem", "sendRequest", "markSold", "returnRental", "verifyStudent"]) {
    assert.ok(TOPIC[action], `${action} should emit an event`);
  }
});
