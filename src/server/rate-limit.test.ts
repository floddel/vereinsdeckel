import { beforeEach, describe, expect, it } from "vitest";
import { hit, resetRateLimits } from "./rate-limit";

beforeEach(() => resetRateLimits());

describe("Bremse gegen zu viele Anfragen", () => {
  it("lässt max Anfragen je Zeitfenster durch, danach erst wieder im nächsten Fenster", () => {
    const t = 1_000_000;
    for (let i = 0; i < 3; i++) expect(hit("a", 3, 60_000, t + i)).toEqual({ ok: true });
    expect(hit("a", 3, 60_000, t + 10_000)).toEqual({ ok: false, retryAfterSeconds: 50 });
    expect(hit("b", 3, 60_000, t + 10_000)).toEqual({ ok: true }); // anderer Schlüssel zählt getrennt
    expect(hit("a", 3, 60_000, t + 60_000)).toEqual({ ok: true });
  });

  it("Speicher bleibt begrenzt, auch bei sehr vielen Schlüsseln", () => {
    for (let i = 0; i < 12_000; i++) hit(`k${i}`, 1, 60_000, 0);
    const map = (globalThis as unknown as { __vereinsdeckelRateLimit: Map<string, unknown> }).__vereinsdeckelRateLimit;
    expect(map.size).toBeLessThanOrEqual(5000);
  });
});
