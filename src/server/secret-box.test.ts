import { describe, expect, it } from "vitest";
import { open, seal } from "./secret-box";

const SECRET = "x".repeat(40);

describe("secret-box", () => {
  it("ver- und entschlüsselt, jedes Mal anders", () => {
    const a = seal("sk-ant-geheim", SECRET, "anthropic");
    const b = seal("sk-ant-geheim", SECRET, "anthropic");
    expect(a).not.toBe(b);
    expect(a).not.toContain("geheim");
    expect(open(a, SECRET, "anthropic")).toBe("sk-ant-geheim");
  });

  it("falsches Geheimnis, anderer Zweck oder Manipulation → null", () => {
    const a = seal("sk-ant-geheim", SECRET, "anthropic");
    expect(open(a, "y".repeat(40), "anthropic")).toBeNull();
    expect(open(a, SECRET, "anderes")).toBeNull();
    const [v, iv, tag, data] = a.split(".");
    const flipped = data.slice(0, -2) + (data.at(-2) === "A" ? "B" : "A") + data.at(-1);
    expect(open([v, iv, tag, flipped].join("."), SECRET, "anthropic")).toBeNull();
    expect(open("unsinn", SECRET, "anthropic")).toBeNull();
  });
});
