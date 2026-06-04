import { cookies } from "next/headers";
import { randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { createServiceClient } from "@/lib/supabase/server";
import { HttpError } from "@/lib/admin";
import type { AuthUser } from "@/lib/types";

/**
 * Server-only username/password auth. There is no Supabase Auth here — accounts
 * live in the `users` table and login state is an opaque session token stored in
 * an httpOnly cookie and the `sessions` table. All reads/writes use the
 * service-role client, which bypasses RLS, so password hashes and session tokens
 * are never exposed to the browser.
 */

export const SESSION_COOKIE = "sb_session";
const SESSION_TTL_DAYS = 30;

// --- Password hashing (Node crypto scrypt, no external dependency) ----------

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `scrypt:${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, salt, hash] = stored.split(":");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "hex");
  const actual = scryptSync(password, salt, 64);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

// --- Sessions ---------------------------------------------------------------

/** Create a session row and set the httpOnly session cookie. */
export async function createSession(userId: string): Promise<void> {
  const supabase = createServiceClient();
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);

  const { error } = await supabase
    .from("sessions")
    .insert({ token, user_id: userId, expires_at: expiresAt.toISOString() });
  if (error) throw new HttpError(500, "Could not start a session.");

  cookies().set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_DAYS * 24 * 60 * 60,
  });
}

/** Clear the current session (deletes the row and the cookie). */
export async function destroySession(): Promise<void> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (token) {
    const supabase = createServiceClient();
    await supabase.from("sessions").delete().eq("token", token);
  }
  cookies().delete(SESSION_COOKIE);
}

/**
 * Resolve the signed-in user from the session cookie, or null if not signed in
 * / the session is missing or expired. Safe to call in Server Components and
 * Route Handlers.
 */
export async function getCurrentUser(): Promise<AuthUser | null> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const supabase = createServiceClient();
  const { data: session } = await supabase
    .from("sessions")
    .select("user_id, expires_at")
    .eq("token", token)
    .single<{ user_id: string; expires_at: string }>();
  if (!session) return null;

  if (new Date(session.expires_at).getTime() < Date.now()) {
    await supabase.from("sessions").delete().eq("token", token);
    return null;
  }

  const { data: user } = await supabase
    .from("users")
    .select("id, email, name, display_name")
    .eq("id", session.user_id)
    .single<AuthUser>();
  return user ?? null;
}

/** Like getCurrentUser, but throws a 401 when not signed in. For Route Handlers. */
export async function requireUser(): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) throw new HttpError(401, "You must be signed in to do that.");
  return user;
}
