import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { authSession, authUser } from "@/db/schema";
import { createTestDb } from "@/db/test-db";
import { listDevices, signOutDevice, signOutOtherDevices } from "./devices";

let db: Db;
const now = new Date("2026-10-16T12:00:00Z");
const day = 24 * 60 * 60_000;

beforeEach(async () => {
  db = await createTestDb();
  await db.insert(authUser).values({ id: "u", name: "Hauswart", email: "h@example.org" });
  await db.insert(authSession).values([
    { id: "tablet", token: "t1", userId: "u", createdAt: new Date(now.getTime() - 30 * day), expiresAt: new Date(now.getTime() + 300 * day) },
    { id: "handy", token: "t2", userId: "u", createdAt: new Date(now.getTime() - day), expiresAt: new Date(now.getTime() + 364 * day) },
    { id: "alt", token: "t3", userId: "u", createdAt: new Date(now.getTime() - 400 * day), expiresAt: new Date(now.getTime() - day) },
  ]);
});

describe("Angemeldete Geräte", () => {
  it("listet nur gültige Anmeldungen, älteste zuerst, und markiert dieses Gerät", async () => {
    const list = await listDevices(db, "handy", now);
    expect(list.map((d) => [d.id, d.current])).toEqual([
      ["tablet", false],
      ["handy", true],
    ]);
  });

  it("ein anderes Gerät abmelden – das eigene nicht", async () => {
    expect(await signOutDevice(db, "handy", "handy")).toBe(false);
    expect(await signOutDevice(db, "tablet", "handy")).toBe(true);
    expect(await signOutDevice(db, "tablet", "handy")).toBe(false);
    expect((await listDevices(db, "handy", now)).map((d) => d.id)).toEqual(["handy"]);
  });

  it("alle anderen abmelden", async () => {
    expect(await signOutOtherDevices(db, "handy")).toBe(2);
    expect((await db.select().from(authSession)).map((s) => s.id)).toEqual(["handy"]);
  });
});
