import type { MetadataRoute } from "next";

/** App-Manifest: Theke als Vollbild-App auf dem Tablet („Zum Home-Bildschirm“). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/theke",
    name: "Vereinsdeckel – Theke",
    short_name: "Theke",
    description: "Vereinsdeckel – der digitale Bierdeckel für Vereine",
    lang: "de",
    start_url: "/theke",
    scope: "/",
    display: "fullscreen",
    display_override: ["fullscreen", "standalone"],
    orientation: "any",
    background_color: "#f2f7fb",
    theme_color: "#1d63a5",
    icons: [
      { src: "/icons/theke-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/theke-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/theke-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
