"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getBrowserClient } from "@/lib/supabase/client";
import { fetchBundle } from "@/lib/fetchBundle";
import type { TournamentBundle } from "@/lib/types";

/**
 * Subscribe to a tournament's live state. Loads the bundle once, then refetches
 * whenever any related row changes (Supabase realtime). Refetch-on-change keeps
 * the merge logic trivial and always-correct.
 */
export function useLiveTournament(id: string, initial: TournamentBundle | null) {
  const [bundle, setBundle] = useState<TournamentBundle | null>(initial);
  const [loading, setLoading] = useState(initial === null);
  const refetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refetch = useCallback(async () => {
    const supabase = getBrowserClient();
    const next = await fetchBundle(supabase, id);
    setBundle(next);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    if (initial === null) refetch();

    const supabase = getBrowserClient();
    // Coalesce bursts of changes into a single refetch.
    const scheduleRefetch = () => {
      if (refetchTimer.current) clearTimeout(refetchTimer.current);
      refetchTimer.current = setTimeout(refetch, 150);
    };

    const channel = supabase
      .channel(`tournament-${id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "matches", filter: `tournament_id=eq.${id}` },
        scheduleRefetch
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "participants", filter: `tournament_id=eq.${id}` },
        scheduleRefetch
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tournaments", filter: `id=eq.${id}` },
        scheduleRefetch
      )
      .subscribe();

    return () => {
      if (refetchTimer.current) clearTimeout(refetchTimer.current);
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  return { bundle, loading, refetch };
}
