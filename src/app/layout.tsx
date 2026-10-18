import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { ClubAccent } from "@/components/club-accent";
import { DemoNote } from "@/components/demo-note";
import { ArticleArtSprite } from "@/components/icons/article-art";
import { Toaster } from "@/components/ui/sonner";
import { fontMono } from "@/fonts";
import { themeScript } from "@/lib/theme";
import "./globals.css";

export const metadata: Metadata = {
  title: "Vereinsdeckel",
  description: "Vereinsdeckel – der digitale Bierdeckel für Vereine",
  robots: { index: false, follow: false },
  // iPad/iPhone: „Zum Home-Bildschirm“ öffnet ohne Browserleiste
  appleWebApp: { capable: true, title: "Theke", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f2f2f7" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // suppressHydrationWarning: Browser-Erweiterungen (z. B. Gutschein-Helfer) setzen eigene Merkmale
    // an <html>, bevor die App startet. Gilt nur für dieses eine Element, nicht für die Seite darunter.
    <html
      lang="de"
      suppressHydrationWarning
      className={`${fontMono.variable} h-full antialiased`}
    >
      <head>
        {/* Gewählte Darstellung (Hell/Dunkel) vor dem ersten Anzeigen setzen */}
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-full flex flex-col">
        <ArticleArtSprite />
        {children}
        <Suspense fallback={null}>
          <ClubAccent />
        </Suspense>
        <Suspense fallback={null}>
          <DemoNote />
        </Suspense>
        <Toaster position="top-center" richColors />
      </body>
    </html>
  );
}
