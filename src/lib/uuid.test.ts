import { describe, expect, it } from "vitest";
import { z } from "@/lib/z";
import { uuid } from "./uuid";

describe("uuid", () => {
  it("liefert gültige, verschiedene UUIDs (Version 4)", () => {
    const ids = Array.from({ length: 200 }, uuid);
    for (const id of ids) expect(z.uuid({ version: "v4" }).safeParse(id).success, id).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
