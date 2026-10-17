import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { AuthFrame } from "@/components/auth-frame";
import { safeNextPath } from "@/lib/safe-next";
import { adminExists } from "@/server/auth";
import { getAdminSession } from "@/server/session";
import { LoginForm } from "./login-form";

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <AuthFrame title="Anmelden" description="Theke und Verwaltung des Vereinsheims.">
      <Suspense fallback={<p>Lädt …</p>}>
        <LoginGate searchParams={searchParams} />
      </Suspense>
    </AuthFrame>
  );
}

async function LoginGate({ searchParams }: Pick<PageProps<"/login">, "searchParams">) {
  await connection();
  const { next } = await searchParams;
  if (!(await adminExists())) redirect("/einrichten");
  if (await getAdminSession()) redirect(safeNextPath(next, "/theke"));
  return <LoginForm next={typeof next === "string" ? next : undefined} />;
}
