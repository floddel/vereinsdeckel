import type { Metadata } from "next";
import { Suspense } from "react";
import { getDb } from "@/db/client";
import { requireAdmin } from "@/server/session";
import { getThekeSnapshot } from "@/server/theke/snapshot";
import { ThekeApp } from "./theke-app";

export const metadata: Metadata = { title: "Theke" };

export default function ThekePage() {
  return (
    <Suspense fallback={<p className="p-8 text-center text-lg text-muted-foreground">Theke lädt …</p>}>
      <Theke />
    </Suspense>
  );
}

async function Theke() {
  await requireAdmin();
  return <ThekeApp initial={await getThekeSnapshot(getDb())} />;
}
