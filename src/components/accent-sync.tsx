"use client";

import { useEffect } from "react";
import { type AccentId, applyAccent } from "@/lib/accent";

/** Übernimmt die Vereinsfarbe vom Server an die Seite (und merkt sie für das nächste Laden/offline). */
export function AccentSync({ accent }: { accent: AccentId }) {
  useEffect(() => applyAccent(accent), [accent]);
  return null;
}
