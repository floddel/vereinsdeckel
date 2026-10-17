import Link from "next/link";
import { Suspense } from "react";
import { AuthFrame } from "@/components/auth-frame";
import { CodeForm } from "./code-form";

export default function CodePage({ searchParams }: PageProps<"/login/code">) {
  return (
    <AuthFrame title="Bestätigungscode" description="Zweiter Schritt der Anmeldung: der 6-stellige Code aus deiner Authenticator-App.">
      <Suspense fallback={<p>Lädt …</p>}>
        <CodeGate searchParams={searchParams} />
      </Suspense>
      <Link href="/login" className="text-sm text-muted-foreground underline underline-offset-4">
        Zurück zur Anmeldung
      </Link>
    </AuthFrame>
  );
}

async function CodeGate({ searchParams }: Pick<PageProps<"/login/code">, "searchParams">) {
  const { next } = await searchParams;
  return <CodeForm next={typeof next === "string" ? next : undefined} />;
}
