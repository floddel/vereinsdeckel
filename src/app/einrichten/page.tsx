import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { AuthFrame } from "@/components/auth-frame";
import { adminExists } from "@/server/auth";
import { setupCodeState } from "@/server/setup-code";
import { SetupForm } from "./setup-form";

export default function EinrichtenPage() {
  return (
    <AuthFrame
      title="Einrichten"
      description="Willkommen! Lege einmalig das Admin-Konto für die Theke und die Verwaltungs-PIN an."
    >
      <Suspense fallback={<p>Lädt …</p>}>
        <SetupGate />
      </Suspense>
    </AuthFrame>
  );
}

async function SetupGate() {
  await connection();
  if (await adminExists()) redirect("/login");
  const state = setupCodeState();
  if (state === "missing") {
    return (
      <p role="alert" className="text-destructive">
        Einrichtung gesperrt: Es fehlt der Einrichtungs-Code. Bitte die Umgebungsvariable SETUP_CODE (mindestens 16 Zeichen) setzen – z. B.
        bei Vercel unter „Environment Variables“ oder in der .env-Datei – und die App neu starten.
      </p>
    );
  }
  return <SetupForm needsCode={state === "required"} />;
}
