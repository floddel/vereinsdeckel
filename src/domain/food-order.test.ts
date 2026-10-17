import { describe, expect, it } from "vitest";
import { memberOrderSchema, memberStatusText, nextStatus } from "./food-order";

const id1 = "11111111-1111-4111-8111-111111111111";
const id2 = "22222222-2222-4222-8222-222222222222";

describe("nextStatus", () => {
  it("normaler Ablauf: Annehmen → Fertig → Abgeholt", () => {
    expect(nextStatus("new", "accept")).toEqual({ ok: true, status: "accepted" });
    expect(nextStatus("accepted", "ready")).toEqual({ ok: true, status: "ready" });
    expect(nextStatus("ready", "pickup")).toEqual({ ok: true, status: "picked_up" });
  });

  it("an der Theke darf man Schritte überspringen", () => {
    expect(nextStatus("new", "ready")).toMatchObject({ ok: true, status: "ready" });
    expect(nextStatus("new", "pickup")).toMatchObject({ ok: true, status: "picked_up" });
  });

  it("gleiche Aktion zweimal (zwei Tablets) ist kein Fehler", () => {
    expect(nextStatus("accepted", "accept")).toMatchObject({ ok: true });
    expect(nextStatus("rejected", "reject")).toMatchObject({ ok: true });
  });

  it("zurückziehen nur, solange die Bestellung noch nicht angenommen ist", () => {
    expect(nextStatus("new", "cancel")).toMatchObject({ ok: true, status: "cancelled" });
    expect(nextStatus("accepted", "cancel")).toEqual({ ok: false, message: "Bestellung wird schon zubereitet" });
    expect(nextStatus("ready", "cancel")).toMatchObject({ ok: false });
  });

  it("abgeschlossene Bestellungen ändern sich nicht mehr", () => {
    expect(nextStatus("picked_up", "reject")).toEqual({ ok: false, message: "Bestellung wurde schon abgeholt" });
    expect(nextStatus("cancelled", "accept")).toEqual({ ok: false, message: "Bestellung wurde zurückgezogen" });
    expect(nextStatus("rejected", "pickup")).toEqual({ ok: false, message: "Bestellung wurde abgelehnt" });
    expect(nextStatus("ready", "accept")).toMatchObject({ ok: false });
  });
});

describe("memberOrderSchema", () => {
  it("nimmt eine normale Bestellung an, leere Notiz wird null", () => {
    const r = memberOrderSchema.parse({ lines: [{ articleId: id1, quantity: 2 }], note: "  " });
    expect(r).toEqual({ lines: [{ articleId: id1, quantity: 2 }], note: null });
  });

  it("lehnt leere, zu große und doppelte Bestellungen ab", () => {
    expect(memberOrderSchema.safeParse({ lines: [] }).success).toBe(false);
    expect(memberOrderSchema.safeParse({ lines: [{ articleId: id1, quantity: 11 }] }).success).toBe(false);
    expect(
      memberOrderSchema.safeParse({ lines: [{ articleId: id1, quantity: 6 }, { articleId: id2, quantity: 5 }] }).success,
    ).toBe(false);
    expect(
      memberOrderSchema.safeParse({ lines: [{ articleId: id1, quantity: 1 }, { articleId: id1, quantity: 1 }] }).success,
    ).toBe(false);
    expect(memberOrderSchema.safeParse({ lines: [{ articleId: id1, quantity: 1 }], note: "x".repeat(201) }).success).toBe(false);
  });

  it("nimmt keinen Preis vom Handy an", () => {
    const r = memberOrderSchema.parse({ lines: [{ articleId: id1, quantity: 1, unitPriceCents: 1 }] });
    expect(r.lines[0]).not.toHaveProperty("unitPriceCents");
  });
});

describe("memberStatusText", () => {
  it("unterscheidet „gesendet“ und „an der Theke angekommen“", () => {
    expect(memberStatusText({ status: "new", seen: false, rejectReason: null }).title).toBe("Gesendet");
    expect(memberStatusText({ status: "new", seen: true, rejectReason: null }).title).toBe("Eingegangen");
  });

  it("zeigt den Ablehnungsgrund", () => {
    expect(memberStatusText({ status: "rejected", seen: true, rejectReason: "Ist leider aus" })).toEqual({
      title: "Abgelehnt",
      detail: "Ist leider aus",
    });
  });
});
