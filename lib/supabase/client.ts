"use client";

import { createClient } from "@supabase/supabase-js";

/**
 * Browser Supabase client using the public anon key.
 * Used for read-only queries and realtime subscriptions. RLS restricts it to SELECT.
 */
let browserClient: ReturnType<typeof createClient> | null = null;

export function getBrowserClient() {
  if (browserClient) return browserClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Missing Supabase env vars. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY."
    );
  }

  browserClient = createClient(url, anonKey, {
    auth: { persistSession: false },
  });
  return browserClient;
}
