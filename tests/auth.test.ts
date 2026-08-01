import { describe, expect, it } from "vitest";

import { authenticate, createStaffMember, hashPassword, verifyPassword } from "@/lib/auth";
import { createTestDb } from "@/lib/db";
import { seed } from "@/lib/seed";

describe("password hashing", () => {
  it("verifies a correct password", () => {
    const stored = hashPassword("roast-and-toast");
    expect(verifyPassword("roast-and-toast", stored)).toBe(true);
  });

  it("rejects a wrong password", () => {
    const stored = hashPassword("roast-and-toast");
    expect(verifyPassword("roast-and-toasr", stored)).toBe(false);
    expect(verifyPassword("", stored)).toBe(false);
  });

  it("salts, so the same password hashes differently every time", () => {
    expect(hashPassword("same")).not.toBe(hashPassword("same"));
  });

  it("never stores the password itself", () => {
    expect(hashPassword("hunter2")).not.toContain("hunter2");
  });

  it("normalises unicode so an equivalent password still verifies", () => {
    // "é" composed vs decomposed — the same password typed on two keyboards.
    const stored = hashPassword("café");
    expect(verifyPassword("café", stored)).toBe(true);
  });

  it("rejects a malformed stored hash instead of throwing", () => {
    expect(verifyPassword("x", "")).toBe(false);
    expect(verifyPassword("x", "notascheme$abc$def")).toBe(false);
    expect(verifyPassword("x", "scrypt$only-two-parts")).toBe(false);
  });
});

describe("authenticate", () => {
  it("returns the staff member on a correct pair", () => {
    const db = createTestDb();
    seed({}, db);
    const restaurant = db.prepare<[], { id: string }>("SELECT id FROM restaurants").get()!;

    createStaffMember(restaurant.id, "Owner@Example.com", "correct horse", "owner", db);

    const staff = authenticate("owner@example.com", "correct horse", db);
    expect(staff?.role).toBe("owner");
    // Email is normalised on both write and read, so case cannot fork an
    // account.
    expect(staff?.email).toBe("owner@example.com");
  });

  it("returns null for a wrong password", () => {
    const db = createTestDb();
    seed({}, db);
    const restaurant = db.prepare<[], { id: string }>("SELECT id FROM restaurants").get()!;
    createStaffMember(restaurant.id, "owner@example.com", "correct horse", "owner", db);

    expect(authenticate("owner@example.com", "wrong horse", db)).toBeNull();
  });

  it("returns null for an unknown email without leaking that it is unknown", () => {
    const db = createTestDb();
    seed({}, db);

    // The observable result is identical to a wrong password, and the
    // implementation burns the same scrypt work — so this cannot be used to
    // enumerate staff accounts.
    expect(authenticate("nobody@example.com", "anything", db)).toBeNull();
  });
});
