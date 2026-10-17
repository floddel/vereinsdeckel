"use client";

import { CloudOff, ListChecks, Loader2, Search, Settings, Undo2, Wifi } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { UNDO_REASON } from "@/domain/reversal";
import { ThemeButton } from "@/components/theme-switch";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  availableUnits,
  memberDeckel,
  paidToday,
  type PaymentSummary,
  type SaleOp,
  type SaleSummary,
  searchMembers,
  summarizePayments,
  summarizeSales,
  type ThekeArticle,
  type ThekeMember,
  type ThekeOp,
  type ThekeSnapshot,
} from "@/domain/theke";
import { formatBusinessDay } from "@/lib/date";
import { formatCents } from "@/lib/money";
import { useHydrated } from "@/lib/use-hydrated";
import { cn } from "@/lib/utils";
import { registerServiceWorker } from "@/lib/service-worker";
import { uuid } from "@/lib/uuid";
import { MemberPicker } from "./member-picker";
import { KitchenButton, KitchenSheet, OrderBar, RejectDialog } from "./food-orders";
import { type CartLine, cartKey, cartTotal, MemberScreen } from "./member-screen";
import { PayDialog, type PayRequest, type PayResult } from "./pay-dialog";
import { PaymentStornoDialog } from "./payment-storno-dialog";
import { SaleDialog, type SaleDialogResult, type SaleDialogState } from "./sale-dialog";
import { SaleList } from "./sale-list";
import { itemsText, useFoodOrders } from "./use-food-orders";
import { type SyncStatus, useThekeSync } from "./use-theke-sync";
import type { ThekeOrder } from "@/server/food-orders";

const UNDO_SECONDS = 10;

/** Rückgängig-Leiste: Text und die Vorgänge, die alles wieder aufheben. */
type Undo = { text: string; until: number; revert: () => ThekeOp[] };

const METHOD_WORD: Record<string, string> = { cash: "bar", paypal: "per PayPal" };

function buildSaleOp(member: ThekeMember, cart: CartLine[]): SaleOp {
  return {
    type: "sale",
    id: uuid(),
    memberId: member.id,
    createdAt: new Date().toISOString(),
    lines: cart.map((l) => ({
      id: uuid(),
      articleId: l.article.id,
      articleName: l.article.name,
      quantity: l.quantity,
      unitPriceCents: l.article.priceCents,
      isGuest: l.isGuest,
    })),
  };
}

const undoSale = (saleId: string): ThekeOp => ({
  type: "reversal",
  id: uuid(),
  saleId,
  createdAt: new Date().toISOString(),
  reason: UNDO_REASON,
  lines: "all",
});
const undoPayment = (paymentId: string): ThekeOp => ({
  type: "payment-reversal",
  id: uuid(),
  paymentId,
  createdAt: new Date().toISOString(),
  reason: UNDO_REASON,
});


function isTyping(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  return !!el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));
}

export function ThekeApp({ initial }: { initial: ThekeSnapshot }) {
  const hydrated = useHydrated();
  const { snapshot, view, enqueue, status, unsent } = useThekeSync(initial);
  const [memberId, setMemberId] = useState<string | null>(null);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [guestMode, setGuestMode] = useState(false);
  const [query, setQuery] = useState("");
  const [highlighted, setHighlighted] = useState(0);
  const [undo, setUndo] = useState<Undo | null>(null);
  const [saleDialog, setSaleDialog] = useState<SaleDialogState>(null);
  const [todayOpen, setTodayOpen] = useState(false);
  const [payRequest, setPayRequest] = useState<PayRequest | null>(null);
  const [paymentStorno, setPaymentStorno] = useState<PaymentSummary | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const kitchen = useFoodOrders();
  const [kitchenOpen, setKitchenOpen] = useState(false);
  const [rejecting, setRejecting] = useState<ThekeOrder | null>(null);

  const member = memberId ? view.membersById.get(memberId) : undefined;
  const results = useMemo(
    () => (query.trim() ? searchMembers(view.members, query, view.presentIds) : null),
    [query, view.members, view.presentIds],
  );

  const summaries = useMemo(() => summarizeSales(view.todaySales), [view.todaySales]);
  const memberSummaries = useMemo(
    () => (memberId ? summaries.filter((s) => s.sale.memberId === memberId) : []),
    [summaries, memberId],
  );
  const payments = useMemo(() => summarizePayments(view.todayPayments), [view.todayPayments]);
  const deckel = useMemo(() => (memberId ? memberDeckel(snapshot, view, memberId) : null), [snapshot, view, memberId]);
  const memberPayments = useMemo(
    () => (memberId ? payments.filter((p) => p.payment.memberId === memberId) : []),
    [payments, memberId],
  );

  const confirmSaleDialog = useCallback(
    (result: SaleDialogResult) => {
      if (!saleDialog) return;
      const saleId = saleDialog.summary.sale.id;
      const createdAt = new Date().toISOString();
      if (result.mode === "storno") {
        enqueue([{ type: "reversal", id: uuid(), saleId, createdAt, reason: result.reason, lines: result.lines }]);
        toast.success("Storniert");
      } else {
        enqueue([{ type: "move", id: uuid(), newSaleId: uuid(), saleId, toMemberId: result.toMemberId, createdAt, lines: result.lines }]);
        toast.success(`Umgebucht auf ${view.membersById.get(result.toMemberId)?.name ?? "anderes Mitglied"}`);
      }
      setSaleDialog(null);
    },
    [saleDialog, enqueue, view.membersById],
  );
  const openStorno = useCallback((summary: SaleSummary) => setSaleDialog({ mode: "storno", summary }), []);
  const openMove = useCallback((summary: SaleSummary) => setSaleDialog({ mode: "move", summary }), []);

  const resetMember = useCallback(() => {
    setMemberId(null);
    setCart([]);
    setGuestMode(false);
  }, []);

  const pick = useCallback(
    (id: string) => {
      if (id !== memberId) {
        setCart([]);
        setGuestMode(false);
      }
      setMemberId(id);
      setQuery("");
      setHighlighted(0);
      searchRef.current?.blur();
    },
    [memberId],
  );

  /** Nur verkaufen, was da ist (laut Bestand). Sonst Hinweis statt Buchung. */
  const inStock = useCallback(
    (article: ThekeArticle) => {
      if (availableUnits(article, view.stockLeft, cart) >= 1) return true;
      toast.error(`${article.name}: nichts mehr da`, { description: "Laut Bestand ist nichts mehr übrig. Fehlt ein Einkauf? Dann in der Verwaltung nachtragen." });
      return false;
    },
    [view.stockLeft, cart],
  );

  const add = useCallback(
    (article: ThekeArticle) => {
      if (!inStock(article)) return;
      setCart((c) => {
        const key = cartKey(article.id, guestMode);
        const existing = c.find((l) => cartKey(l.article.id, l.isGuest) === key);
        return existing
          ? c.map((l) => (l === existing ? { ...l, quantity: Math.min(l.quantity + 1, 99) } : l))
          : [...c, { article, quantity: 1, isGuest: guestMode }];
      });
    },
    [guestMode, inStock],
  );

  const change = useCallback(
    (key: string, delta: number) => {
      const line = cart.find((l) => cartKey(l.article.id, l.isGuest) === key);
      if (line && delta > 0 && !inStock(line.article)) return;
      setCart((c) =>
        c
          .map((l) => (cartKey(l.article.id, l.isGuest) === key ? { ...l, quantity: Math.min(l.quantity + delta, 99) } : l))
          .filter((l) => l.quantity > 0),
      );
    },
    [cart, inStock],
  );

  const book = useCallback(() => {
    if (!member || cart.length === 0) return;
    const op = buildSaleOp(member, cart);
    enqueue([op]);
    const items = cart.map((l) => `${l.quantity}× ${l.article.name}`).join(", ");
    setUndo({
      text: `${items} für ${member.name} angeschrieben (${formatCents(cartTotal(cart))})`,
      until: Date.now() + UNDO_SECONDS * 1000,
      revert: () => [undoSale(op.id)],
    });
    resetMember();
  }, [member, cart, enqueue, resetMember]);

  const confirmPay = useCallback(
    (result: PayResult) => {
      if (!payRequest) return;
      const { member: m, instant, dueCents } = payRequest;
      const saleOp = instant ? buildSaleOp(m, cart) : null;
      const paymentId = uuid();
      enqueue([
        ...(saleOp ? [saleOp] : []),
        { type: "payment", id: paymentId, memberId: m.id, createdAt: new Date().toISOString(), saleId: saleOp?.id ?? null, ...result },
      ]);
      const total = result.amountCents + result.tipCents;
      setUndo({
        text: `${formatCents(total)} ${METHOD_WORD[result.methodId] ?? ""} von ${m.name} kassiert${result.tipCents ? ` (davon ${formatCents(result.tipCents)} Trinkgeld)` : ""}`,
        until: Date.now() + UNDO_SECONDS * 1000,
        revert: () => [undoPayment(paymentId), ...(saleOp ? [undoSale(saleOp.id)] : [])],
      });
      if (!instant && result.amountCents >= dueCents) toast.success(`${m.name}: beglichen – Prost!`);
      setPayRequest(null);
      resetMember();
    },
    [payRequest, cart, enqueue, resetMember],
  );

  const confirmPaymentStorno = useCallback(
    (reason: string) => {
      if (!paymentStorno) return;
      enqueue([{ type: "payment-reversal", id: uuid(), paymentId: paymentStorno.payment.id, createdAt: new Date().toISOString(), reason }]);
      toast.success("Zahlung storniert");
      setPaymentStorno(null);
    },
    [paymentStorno, enqueue],
  );

  /** Handy-Bestellung: nächster Schritt. „Abgeholt“ bucht (immer angeschrieben, aktueller Preis). */
  const nextOrderStep = useCallback(
    (order: ThekeOrder) => {
      if (order.status === "new") return void kitchen.act(order, { action: "accept" });
      if (order.status === "accepted") return void kitchen.act(order, { action: "ready" });
      const prices = new Map(snapshot.articles.map((a) => [a.id, a.priceCents]));
      const op: SaleOp = {
        type: "sale",
        id: uuid(),
        memberId: order.memberId,
        createdAt: new Date().toISOString(),
        foodOrderId: order.id,
        lines: order.lines.map((l) => ({
          id: uuid(),
          articleId: l.articleId,
          articleName: l.articleName,
          quantity: l.quantity,
          unitPriceCents: prices.get(l.articleId) ?? l.unitPriceCents,
          isGuest: false,
        })),
      };
      enqueue([op]);
      kitchen.markPickedUp(order.id);
      const total = op.lines.reduce((sum, l) => sum + l.quantity * l.unitPriceCents, 0);
      setUndo({
        text: `${itemsText(order)} für ${order.memberName} angeschrieben (${formatCents(total)})`,
        until: Date.now() + UNDO_SECONDS * 1000,
        revert: () => [undoSale(op.id)],
      });
    },
    [kitchen, snapshot.articles, enqueue],
  );

  const undoLast = useCallback(() => {
    if (!undo) return;
    enqueue(undo.revert());
    setUndo(null);
    toast.success("Rückgängig gemacht");
  }, [undo, enqueue]);

  // Service Worker: Theke lädt auch ohne Internet (nur im fertigen Build über https/localhost)
  useEffect(() => registerServiceWorker(), []);

  // Rückgängig-Leiste nach einigen Sekunden ausblenden
  useEffect(() => {
    if (!undo) return;
    const t = setTimeout(() => setUndo(null), undo.until - Date.now());
    return () => clearTimeout(t);
  }, [undo]);

  // Tastatur (Desktop): „/“ oder lostippen = suchen, Enter = anschreiben, Esc = zurück
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      if (document.querySelector("[role=dialog], [role=alertdialog]")) return;
      const typing = isTyping(e.target);
      if (e.key === "Escape") {
        if (query) setQuery("");
        else if (memberId) resetMember();
        searchRef.current?.blur();
      } else if (!typing && e.key === "/") {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (!typing && e.key.length === 1 && /\p{L}/u.test(e.key)) {
        searchRef.current?.focus(); // der Buchstabe landet direkt im Suchfeld
      } else if (!typing && e.key === "Enter" && memberId && cart.length > 0) {
        e.preventDefault();
        book();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [query, memberId, cart.length, book, resetMember]);

  const showPicker = !member || results !== null;

  // Höhe der schwebenden Kopfleiste als --top: so beginnt der Inhalt darunter und scrollt unter dem Glas durch
  const rootRef = useRef<HTMLDivElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = rootRef.current;
    const top = topRef.current;
    if (!root || !top) return;
    const ro = new ResizeObserver(() => root.style.setProperty("--top", `${top.offsetHeight}px`));
    ro.observe(top);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={rootRef} className="relative flex h-dvh flex-col [--top:6rem]" inert={!hydrated}>
      {/* Kopf, Rückgängig und Handy-Bestellungen schweben als Glas über dem Inhalt – der läuft darunter durch */}
      <div ref={topRef} className="pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-col *:pointer-events-auto">
      <header className="glass relative z-20 mx-2 mt-2 flex items-center gap-2 rounded-[28px] py-2 pr-2 pl-3 md:mx-3 md:mt-3 md:gap-3 md:pl-5">
        <div className="hidden min-w-0 shrink-0 sm:block">
          <p className="truncate font-heading text-lg leading-tight font-bold">{snapshot.clubName}</p>
          <p className="text-sm text-muted-foreground">Theke · {formatBusinessDay(snapshot.businessDate)}</p>
        </div>
        <div className="relative mx-auto w-full max-w-xl">
          <Search className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted-foreground" />
          <input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setHighlighted(0);
            }}
            onKeyDown={(e) => {
              if (!results) return;
              if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                e.preventDefault();
                const step = e.key === "ArrowDown" ? 1 : -1;
                setHighlighted((h) => Math.max(0, Math.min(results.length - 1, h + step)));
              } else if (e.key === "Enter" && results[highlighted]) {
                e.preventDefault();
                pick(results[highlighted].id);
              }
            }}
            placeholder="Mitglied suchen …"
            aria-label="Mitglied suchen"
            autoComplete="off"
            enterKeyHint="go"
            className="h-12 w-full rounded-full bg-secondary pr-4 pl-12 text-lg text-foreground outline-none placeholder:text-muted-foreground focus-visible:bg-card focus-visible:ring-3 focus-visible:ring-primary/40"
          />
        </div>
        <button
          type="button"
          onClick={() => setTodayOpen(true)}
          className="flex h-12 shrink-0 items-center gap-2 rounded-full px-3 font-semibold text-primary hover:bg-secondary"
        >
          <ListChecks className="size-6" aria-hidden />
          <span className="hidden md:inline">Heute</span>
          <span className="sr-only md:hidden">Heute</span>
        </button>
        <KitchenButton
          open={kitchen.kitchenOpen}
          count={kitchen.orders.length}
          newCount={kitchen.orders.filter((o) => o.status === "new").length}
          onClick={() => setKitchenOpen(true)}
        />
        <SyncBadge status={status} unsent={unsent} />
        <ThemeButton />
        <Link
          href="/verwaltung"
          aria-label="Verwaltung"
          className="grid size-12 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          <Settings className="size-6" />
        </Link>
      </header>

      {undo && (
        <div role="status" className="mx-2 mt-2 flex items-center gap-3 rounded-full bg-foreground py-1.5 pr-1.5 pl-5 text-background shadow-soft md:mx-3">
          <p className="min-w-0 flex-1 truncate">{undo.text}</p>
          <button
            type="button"
            onClick={undoLast}
            className="flex h-11 shrink-0 items-center gap-2 rounded-full bg-highlight px-5 font-semibold text-highlight-foreground"
          >
            <Undo2 className="size-5" /> Rückgängig
          </button>
        </div>
      )}

      <OrderBar orders={kitchen.orders} onNext={nextOrderStep} onReject={setRejecting} onOpen={() => setKitchenOpen(true)} />
      </div>

      {showPicker ? (
        <main className="min-h-0 flex-1 overflow-y-auto p-4 pt-[calc(var(--top)+0.75rem)] pr-16 md:p-5 md:pt-[calc(var(--top)+1rem)] md:pr-[4.75rem]">
          <MemberPicker
            view={view}
            results={results}
            highlighted={highlighted}
            warnLimitCents={snapshot.warnLimitCents}
            onPick={pick}
          />
        </main>
      ) : (
        <main className="flex min-h-0 flex-1 flex-col">
          <MemberScreen
            member={member}
            snapshot={snapshot}
            stockLeft={view.stockLeft}
            cart={cart}
            guestMode={guestMode}
            onGuestMode={setGuestMode}
            onAdd={add}
            onChange={change}
            onBook={book}
            onBack={resetMember}
            paidToday={paidToday(view, member.id)}
            deckel={deckel ?? { evenings: [], paidCents: 0 }}
            onPay={() => setPayRequest({ member, dueCents: member.openCents, instant: false })}
            onPayInstant={() => setPayRequest({ member, dueCents: cartTotal(cart), instant: true })}
          >
            <section>
              <h2 className="mb-2 text-xl font-bold">Heute gebucht</h2>
              <SaleList
                summaries={memberSummaries}
                payments={memberPayments}
                membersById={view.membersById}
                onStorno={openStorno}
                onMove={openMove}
                onPaymentStorno={setPaymentStorno}
              />
            </section>
          </MemberScreen>
        </main>
      )}

      <Sheet open={todayOpen} onOpenChange={setTodayOpen}>
        <SheetContent side="right" className="w-full gap-0 sm:max-w-xl data-[side=right]:sm:max-w-xl">
          <SheetHeader>
            <SheetTitle className="font-heading text-2xl">Heute · {formatBusinessDay(snapshot.businessDate)}</SheetTitle>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto p-4 pt-0">
            <SaleList
              summaries={summaries}
              payments={payments}
              membersById={view.membersById}
              showMember
              onStorno={openStorno}
              onMove={openMove}
              onPaymentStorno={setPaymentStorno}
            />
          </div>
        </SheetContent>
      </Sheet>

      <KitchenSheet
        open={kitchenOpen}
        onOpenChange={setKitchenOpen}
        kitchenOpen={kitchen.kitchenOpen}
        orderableCount={kitchen.orderableCount}
        orders={kitchen.orders}
        offline={kitchen.offline}
        onKitchenOpen={kitchen.setKitchenOpen}
        onNext={nextOrderStep}
        onReject={setRejecting}
      />
      <RejectDialog
        order={rejecting}
        onClose={() => setRejecting(null)}
        onConfirm={(reason) => {
          if (rejecting) void kitchen.act(rejecting, { action: "reject", reason });
          setRejecting(null);
        }}
      />

      <SaleDialog state={saleDialog} view={view} onClose={() => setSaleDialog(null)} onConfirm={confirmSaleDialog} />
      <PayDialog request={payRequest} snapshot={snapshot} onClose={() => setPayRequest(null)} onConfirm={confirmPay} />
      <PaymentStornoDialog
        summary={paymentStorno}
        member={paymentStorno ? view.membersById.get(paymentStorno.payment.memberId) : undefined}
        onClose={() => setPaymentStorno(null)}
        onConfirm={confirmPaymentStorno}
      />

    </div>
  );
}

function SyncBadge({ status, unsent }: { status: SyncStatus; unsent: number }) {
  const label =
    status === "offline"
      ? `Keine Verbindung${unsent ? ` – ${unsent} warten` : ""}`
      : status === "sending" || unsent > 0
        ? "Wird gespeichert …"
        : "Gespeichert";
  const Icon = status === "offline" ? CloudOff : status === "sending" || unsent > 0 ? Loader2 : Wifi;
  return (
    <span
      role="status"
      aria-label={label}
      title={label}
      data-testid="sync-status"
      data-status={status === "offline" ? "offline" : unsent > 0 ? "sending" : "ok"}
      className={cn(
        "flex h-10 shrink-0 items-center gap-2 rounded-full px-3 text-sm font-medium",
        status === "offline" ? "bg-highlight text-highlight-foreground" : "bg-secondary text-muted-foreground",
      )}
    >
      <Icon className={cn("size-4", Icon === Loader2 && "animate-spin")} aria-hidden />
      <span className="hidden xl:inline">{label}</span>
    </span>
  );
}
