import type { NextConfig } from "next";

const dev = process.env.NODE_ENV !== "production";

const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
];

const contentSecurityPolicy = [
  "default-src 'self'",
  // 'unsafe-eval' und WebSocket nur im Entwicklungsmodus (Next.js-Fehleranzeige, Neuladen)
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  // data:/blob: für Fotovorschau, QR-Codes und „Kassenzettel als Bild“
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self'${dev ? " ws: wss:" : ""}`,
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const nextConfig: NextConfig = {
  // Docker: schlanke, eigenständige Ausgabe (.next/standalone) – nur beim Bau des Abbilds (Dockerfile)
  output: process.env.STANDALONE === "1" ? "standalone" : undefined,
  // PGlite lädt eigene WebAssembly-Dateien, react-pdf eigene Schrift-Daten – beide nicht bündeln.
  serverExternalPackages: ["@electric-sql/pglite", "@react-pdf/renderer"],
  // Die Migrationen werden beim Start eingespielt – die SQL-Dateien müssen mit auf den Server (z. B. Vercel).
  outputFileTracingIncludes: { "/**": ["./src/db/migrations/**/*"] },
  cacheComponents: true,
  // Nur im Entwicklungsmodus (npm run dev): Aufruf über 127.0.0.1 oder die
  // Heimnetz-Adresse (z. B. vom Tablet) erlauben. Ohne diese Freigabe blockiert
  // Next.js seine Skripte – die Seite sieht normal aus, aber nichts reagiert.
  allowedDevOrigins: ["127.0.0.1", "192.168.*.*", "10.*.*.*", "172.*.*.*", "*.local"],
  experimental: {
    // Logo und Belegfotos werden im Browser verkleinert; 3 MB lassen genug Luft.
    serverActions: { bodySizeLimit: "3mb" },
    // Nur Entwicklungsmodus: Der separate React-Debugkanal wirft im iPad-Safari
    // „stream is closing or closed“ (als „Issues“ angezeigt). Ohne ihn stecken die
    // Debug-Infos wie früher direkt in der Antwort – kein Einfluss auf die fertige App.
    reactDebugChannel: false,
  },
  partialPrefetching: true,
  async headers() {
    // Mitgliederansicht: nicht in Suchmaschinen, Link nie als Referrer weitergeben
    const memberHeaders = [
      { key: "Referrer-Policy", value: "no-referrer" },
      { key: "X-Robots-Tag", value: "noindex, nofollow" },
    ];
    return [
      // Für alles: HTTPS erzwingen (wirkt nur über HTTPS), kein Einbetten in fremde Seiten,
      // Dateitypen nicht raten lassen, keine Kamera/Mikrofon/Standort-Abfragen.
      { source: "/:path*", headers: securityHeaders },
      // Seiten: nur Inhalte von der eigenen Adresse (die App lädt nichts von außen).
      // Skripte inline sind nötig, weil Next.js seine Seitendaten so einbettet.
      { source: "/((?!api/).*)", headers: [{ key: "Content-Security-Policy", value: contentSecurityPolicy }] },
      { source: "/m/:path*", headers: memberHeaders },
      // Karte und Erklärung sind für den QR-Aufsteller am Tresen gedacht, nicht für Suchmaschinen
      { source: "/karte", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] },
      { source: "/so-gehts", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] },
      { source: "/api/m/:path*", headers: memberHeaders },
      {
        // Service Worker nie zwischenspeichern, damit Updates sofort ankommen
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
