import { describe, expect, it } from "vitest";
import { setupCodeMatches, setupCodeState } from "./setup-code";

const code = "abcdefghijklmnopqrst";

describe("Einrichtungs-Code", () => {
  it("in Produktion Pflicht – ohne oder mit zu kurzem Code ist keine Einrichtung möglich", () => {
    expect(setupCodeState({ NODE_ENV: "production" })).toBe("missing");
    expect(setupCodeState({ NODE_ENV: "production", SETUP_CODE: "kurz" })).toBe("missing");
    expect(setupCodeMatches("", { NODE_ENV: "production" })).toBe(false);
    expect(setupCodeMatches("kurz", { NODE_ENV: "production", SETUP_CODE: "kurz" })).toBe(false);
  });

  it("nur der richtige Code passt", () => {
    const env = { NODE_ENV: "production", SETUP_CODE: code };
    expect(setupCodeState(env)).toBe("required");
    expect(setupCodeMatches(code, env)).toBe(true);
    expect(setupCodeMatches(` ${code} `, env)).toBe(true);
    expect(setupCodeMatches("abcdefghijklmnopqrsX", env)).toBe(false);
    expect(setupCodeMatches("", env)).toBe(false);
  });

  it("lokal ohne Code nicht nötig", () => {
    expect(setupCodeState({ NODE_ENV: "development" })).toBe("not-required");
    expect(setupCodeMatches("", { NODE_ENV: "development" })).toBe(true);
  });
});
