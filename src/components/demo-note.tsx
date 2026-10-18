import { connection } from "next/server";
import { demoEndsAt, isDemo } from "@/lib/demo";
import { formatTimeBerlin } from "@/lib/date";

/** „Demo“-Hinweis unten rechts auf jeder Seite – nur im Demo-Betrieb (im Wurzel-Layout, in Suspense). */
export async function DemoNote() {
  await connection();
  if (!isDemo()) return null;
  const endsAt = demoEndsAt();
  return (
    <p
      role="note"
      data-testid="demo-hinweis"
      className="glass pointer-events-none fixed right-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-50 rounded-full px-3 py-1.5 text-sm font-semibold print:hidden"
    >
      Demo{endsAt && ` bis ${formatTimeBerlin(endsAt.toISOString())}`}
    </p>
  );
}
