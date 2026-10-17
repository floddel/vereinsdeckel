import { describe, expect, it } from "vitest";
import { generateMemberToken, looksLikeMemberToken } from "./token";

describe("Mitglieder-Token", () => {
  it("ist 43 Zeichen lang und URL-sicher", () => {
    const t = generateMemberToken();
    expect(t).toHaveLength(43);
    expect(looksLikeMemberToken(t)).toBe(true);
  });

  it("ist jedes Mal anders", () => {
    const tokens = new Set(Array.from({ length: 1000 }, generateMemberToken));
    expect(tokens.size).toBe(1000);
  });

  it("erkennt ungültige Formate", () => {
    expect(looksLikeMemberToken("abc")).toBe(false);
    expect(looksLikeMemberToken("../../etc/passwd" + "x".repeat(27))).toBe(false);
  });
});
