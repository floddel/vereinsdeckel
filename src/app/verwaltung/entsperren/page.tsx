import Link from "next/link";
import { Suspense } from "react";
import { AuthFrame } from "@/components/auth-frame";
import { DEMO_LOGIN, isDemo } from "@/lib/demo";
import { safeNextPath } from "@/lib/safe-next";
import { requireAdmin } from "@/server/session";
import { UnlockForm } from "./unlock-form";

export default function EntsperrenPage({ searchParams }: PageProps<"/verwaltung/entsperren">) {
  return (
    <AuthFrame title="Verwaltung entsperren" description="Bitte die Verwaltungs-PIN eingeben.">
      <Suspense fallback={<p>Lädt …</p>}>
        <UnlockGate searchParams={searchParams} />
      </Suspense>
      <p className="mt-6 text-center">
        <Link href="/theke" className="text-muted-foreground underline underline-offset-4">
          Zurück zur Theke
        </Link>
      </p>
    </AuthFrame>
  );
}

async function UnlockGate({ searchParams }: Pick<PageProps<"/verwaltung/entsperren">, "searchParams">) {
  await requireAdmin();
  const { next } = await searchParams;
  return <UnlockForm next={safeNextPath(next, "/verwaltung")} demoPin={isDemo() ? DEMO_LOGIN.pin : undefined} />;
}
