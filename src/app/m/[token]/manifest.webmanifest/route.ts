import { connection } from "next/server";
import { getDb } from "@/db/client";
import { findMemberByToken } from "@/server/member-view";

/** Persönliches App-Manifest: „Zum Startbildschirm“ öffnet direkt den eigenen Bierdeckel. */
export async function GET(_request: Request, ctx: RouteContext<"/m/[token]/manifest.webmanifest">) {
  await connection();
  const { token } = await ctx.params;
  if (!(await findMemberByToken(getDb(), token))) return new Response("Nicht gefunden", { status: 404 });
  const start = `/m/${encodeURIComponent(token)}`;
  return Response.json(
    {
      id: start,
      name: "Mein Bierdeckel",
      short_name: "Bierdeckel",
      lang: "de",
      start_url: start,
      scope: start,
      display: "standalone",
      background_color: "#f2f7fb",
      theme_color: "#1d63a5",
      icons: [
        { src: "/icons/theke-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
        { src: "/icons/theke-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
        { src: "/icons/theke-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      ],
    },
    { headers: { "Content-Type": "application/manifest+json", "Cache-Control": "private, no-cache" } },
  );
}
