"use client";

import type { MemberStand } from "@/domain/member-view";
import { useLivePoll } from "./use-live-poll";

/** Live-Bierdeckel (siehe useLivePoll). */
export function useMemberStand(token: string, initial: MemberStand) {
  const { data, invalid } = useLivePoll(`/api/m/${encodeURIComponent(token)}/stand`, initial);
  return { stand: data, invalid };
}
