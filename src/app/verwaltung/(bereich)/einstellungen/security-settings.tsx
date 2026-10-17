"use client";

import { KeyRound, LogOut, MonitorSmartphone, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { ActionForm, SubmitButton, TextField } from "@/components/form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { ActionResult } from "@/lib/form-utils";
import {
  changePasswordAction,
  confirmTwoFactorAction,
  disableTwoFactorAction,
  newBackupCodesAction,
  signOutDeviceAction,
  signOutOtherDevicesAction,
  startTwoFactorAction,
} from "@/server/security-actions";
import { useToastOnSuccess } from "./settings-forms";

export interface DeviceRow {
  id: string;
  current: boolean;
  /** schon fertig formatiert (Server), z. B. „Do., 15.10.2026, 20:58“ */
  since: string;
  lastActive: string;
}

/** Angemeldete Geräte – z. B. ein verlorenes Tablet sofort abmelden. */
export function DevicesCard({ devices }: { devices: DeviceRow[] }) {
  const [pending, startTransition] = useTransition();
  const run = (fn: () => Promise<ActionResult>) =>
    startTransition(async () => {
      const r = await fn();
      if (r.ok) toast.success(r.message ?? "Erledigt");
      else toast.error(r.error ?? "Nicht möglich");
    });
  const others = devices.filter((d) => !d.current).length;

  return (
    <Card data-testid="geraete">
      <CardHeader>
        <CardTitle>Angemeldete Geräte</CardTitle>
        <CardDescription>
          Wo das Admin-Konto gerade angemeldet ist. Geht ein Gerät verloren (z. B. das Tablet), hier abmelden – am besten zusammen mit
          einem neuen Passwort. Die Geräte stehen nur mit Datum da: Browser und IP-Adresse werden nicht gespeichert.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ul className="flex flex-col divide-y">
          {devices.map((d) => (
            <li key={d.id} data-testid="geraet" className="flex flex-wrap items-center gap-3 py-2">
              <MonitorSmartphone className="size-5 shrink-0 text-muted-foreground" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="font-medium">
                  Angemeldet seit {d.since} {d.current && <Badge variant="secondary">dieses Gerät</Badge>}
                </p>
                <p className="text-sm text-muted-foreground">Zuletzt aktiv: {d.lastActive}</p>
              </div>
              {!d.current && (
                <Button variant="outline" disabled={pending} onClick={() => run(() => signOutDeviceAction(d.id))}>
                  <LogOut /> Abmelden
                </Button>
              )}
            </li>
          ))}
        </ul>
        <div>
          <Button variant="outline" className="text-destructive" disabled={pending || others === 0} onClick={() => run(signOutOtherDevicesAction)}>
            <LogOut /> Alle anderen Geräte abmelden
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function PasswordForm() {
  const [state, action, pending] = useActionState(changePasswordAction, undefined);
  const formRef = useRef<HTMLFormElement>(null);
  useToastOnSuccess(state, () => formRef.current?.reset());
  const e = state && !state.ok ? (state.fieldErrors ?? {}) : {};
  const pw = { type: "password", required: true };
  return (
    <Card>
      <CardHeader>
        <CardTitle>Passwort ändern</CardTitle>
        <CardDescription>Meldet gleichzeitig alle anderen Geräte ab – dieses bleibt angemeldet.</CardDescription>
      </CardHeader>
      <CardContent>
        <ActionForm ref={formRef} action={action} pending={pending} className="flex flex-col gap-4">
          <div className="grid gap-4 md:grid-cols-3">
            <TextField label="Aktuelles Passwort" name="currentPassword" autoComplete="current-password" error={e.currentPassword} {...pw} />
            <TextField label="Neues Passwort" name="newPassword" autoComplete="new-password" error={e.newPassword} description="Mindestens 10 Zeichen" {...pw} />
            <TextField label="Neues Passwort wiederholen" name="newPassword2" autoComplete="new-password" error={e.newPassword2} {...pw} />
          </div>
          <div>
            <SubmitButton variant="outline">Passwort ändern</SubmitButton>
          </div>
        </ActionForm>
      </CardContent>
    </Card>
  );
}

type Setup = { qrSvg: string; secret: string; backupCodes: string[] };

/** Zweiter Faktor: einschalten (QR-Code scannen, Notfall-Codes aufschreiben, Code bestätigen), neue Codes, ausschalten. */
export function TwoFactorCard({ enabled }: { enabled: boolean }) {
  const [step, setStep] = useState<"idle" | "enable" | "disable" | "codes">("idle");
  const [password, setPassword] = useState("");
  const [setup, setSetup] = useState<Setup | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [code, setCode] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const reset = () => {
    setStep("idle");
    setPassword("");
    setSetup(null);
    setCode("");
  };
  const withPassword = () =>
    startTransition(async () => {
      if (step === "enable") {
        const r = await startTwoFactorAction(password);
        if (!r.ok) return void toast.error(r.error);
        setSetup(r);
        setPassword("");
      } else if (step === "codes") {
        const r = await newBackupCodesAction(password);
        if (!r.ok) return void toast.error(r.error);
        setCodes(r.backupCodes);
        reset();
      } else if (step === "disable") {
        const r = await disableTwoFactorAction(password);
        if (!r.ok) return void toast.error(r.error);
        toast.success(r.message ?? "Ausgeschaltet");
        setCodes(null);
        reset();
        router.refresh(); // neue Anmeldung – Seite mit dem neuen Login-Cookie laden
      }
    });
  const confirm = () =>
    startTransition(async () => {
      const r = await confirmTwoFactorAction(code);
      if (!r.ok) return void toast.error(r.error);
      toast.success(r.message ?? "Eingeschaltet");
      reset();
      router.refresh(); // neue Anmeldung – Seite mit dem neuen Login-Cookie laden
    });

  return (
    <Card data-testid="zweiter-faktor">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="size-5" aria-hidden /> Zweiter Faktor beim Anmelden{" "}
          {enabled ? <Badge>eingeschaltet</Badge> : <Badge variant="destructive">aus – bitte einschalten</Badge>}
        </CardTitle>
        <CardDescription>
          Zusätzlich zum Passwort fragt die Anmeldung nach einem 6-stelligen Code aus einer Authenticator-App auf deinem Handy (z. B. die
          Passwörter-App auf dem iPhone, Google Authenticator, Microsoft Authenticator oder 2FAS). Ein gestohlenes Passwort allein reicht dann
          nicht mehr. Die Theke bleibt angemeldet – der Code ist nur bei einer neuen Anmeldung nötig.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {setup ? (
          <ol className="flex flex-col gap-5">
            <li className="flex flex-col gap-2">
              <p className="font-semibold">1. In der Authenticator-App den QR-Code scannen</p>
              <div className="flex flex-wrap items-center gap-4">
                <div
                  className="size-44 shrink-0 rounded-xl bg-white p-2 [&_svg]:size-full"
                  role="img"
                  aria-label="QR-Code für die Authenticator-App"
                  dangerouslySetInnerHTML={{ __html: setup.qrSvg }}
                />
                <p className="text-sm text-muted-foreground">
                  Oder von Hand eingeben:
                  <code data-testid="totp-secret" className="mt-1 block font-mono text-base break-all text-foreground">
                    {setup.secret}
                  </code>
                </p>
              </div>
            </li>
            <li className="flex flex-col gap-2">
              <p className="font-semibold">2. Notfall-Codes aufschreiben</p>
              <BackupCodes codes={setup.backupCodes} />
            </li>
            <li className="flex flex-col gap-2">
              <p className="font-semibold">3. Den Code aus der App eingeben</p>
              <div className="flex flex-wrap gap-2">
                <Input
                  aria-label="Code aus der App"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="123456"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  className="h-11 w-36 text-base tracking-widest"
                />
                <Button size="lg" disabled={pending || code.replace(/\s/g, "").length !== 6} onClick={confirm}>
                  Bestätigen und einschalten
                </Button>
                <Button size="lg" variant="ghost" disabled={pending} onClick={reset}>
                  Abbrechen
                </Button>
              </div>
            </li>
          </ol>
        ) : step !== "idle" ? (
          <div className="flex flex-wrap items-end gap-2">
            <Input
              aria-label="Passwort zur Bestätigung"
              type="password"
              autoComplete="current-password"
              placeholder="Passwort zur Bestätigung"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-11 max-w-xs text-base"
              onKeyDown={(e) => e.key === "Enter" && password && withPassword()}
            />
            <Button size="lg" variant={step === "disable" ? "destructive" : "default"} disabled={pending || !password} onClick={withPassword}>
              {step === "enable" ? "Weiter" : step === "codes" ? "Neue Notfall-Codes erzeugen" : "Ausschalten"}
            </Button>
            <Button size="lg" variant="ghost" disabled={pending} onClick={reset}>
              Abbrechen
            </Button>
          </div>
        ) : enabled ? (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setStep("codes")}>
              <KeyRound /> Neue Notfall-Codes
            </Button>
            <Button variant="outline" className="text-destructive" onClick={() => setStep("disable")}>
              Ausschalten
            </Button>
          </div>
        ) : (
          <div>
            <Button size="lg" onClick={() => setStep("enable")}>
              <ShieldCheck /> Einschalten
            </Button>
          </div>
        )}
        {codes && !setup && (
          <div className="flex flex-col gap-2">
            <p className="font-semibold">Deine neuen Notfall-Codes</p>
            <BackupCodes codes={codes} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function BackupCodes({ codes }: { codes: string[] }) {
  return (
    <>
      <ul data-testid="notfall-codes" className="grid w-fit grid-cols-2 gap-x-6 gap-y-1 rounded-xl bg-muted/60 p-3 font-mono text-base">
        {codes.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
      <p className="text-sm text-muted-foreground">
        Falls das Handy weg ist: Jeder Code ermöglicht genau eine Anmeldung. Ausdrucken oder aufschreiben und zu Hause aufbewahren – nicht
        im Vereinsheim und nicht auf dem Handy. Sie werden nur jetzt angezeigt.
      </p>
    </>
  );
}
