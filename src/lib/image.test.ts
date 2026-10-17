import { describe, expect, it } from "vitest";
import { detectImageType } from "./image";

const bytes = (...b: number[]) => new Uint8Array(b);

describe("detectImageType", () => {
  it("erkennt PNG, JPEG und WebP", () => {
    expect(detectImageType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe("image/png");
    expect(detectImageType(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("image/jpeg");
    expect(detectImageType(new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 "))).toBe("image/webp");
  });

  it("lehnt SVG, HTML und Unbekanntes ab", () => {
    expect(detectImageType(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg">'))).toBeNull();
    expect(detectImageType(new TextEncoder().encode("<html>"))).toBeNull();
    expect(detectImageType(bytes())).toBeNull();
  });
});
