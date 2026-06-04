import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { HttpError, errorResponse } from "@/lib/admin";
import { createSession, hashPassword } from "@/lib/auth";
import { clientIpKey, enforceRateLimits, rateLimitKey } from "@/lib/rate-limit";

export const runtime = "nodejs";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// POST /api/auth/signup { name, displayName, email, password, confirmPassword }
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const displayName = typeof body.displayName === "string" ? body.displayName.trim() : "";
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const confirmPassword = typeof body.confirmPassword === "string" ? body.confirmPassword : "";

    const limited = await enforceRateLimits(req, [
      {
        name: "auth-signup-ip",
        key: clientIpKey(req),
        limit: 6,
        windowSec: 900,
        message: "Too many account creation attempts. Try again a little later.",
      },
      {
        name: "auth-signup-email",
        key: rateLimitKey("email", email || "__blank__"),
        limit: 3,
        windowSec: 3600,
        message: "Too many account creation attempts. Try again a little later.",
      },
    ]);
    if (limited) return limited;

    if (!name) throw new HttpError(400, "Name is required.");
    if (name.length > 80) throw new HttpError(400, "Name too long (max 80 chars).");
    if (!displayName) throw new HttpError(400, "Display name is required.");
    if (displayName.length > 40) throw new HttpError(400, "Display name too long (max 40 chars).");
    if (!EMAIL_RE.test(email)) throw new HttpError(400, "Enter a valid email address.");
    if (password.length < 8) throw new HttpError(400, "Password must be at least 8 characters.");
    if (password !== confirmPassword) throw new HttpError(400, "Passwords do not match.");

    const supabase = createServiceClient();

    const { data: existing } = await supabase
      .from("users")
      .select("id")
      .eq("email", email)
      .maybeSingle();
    if (existing) throw new HttpError(409, "An account with that email already exists.");

    const { data: user, error } = await supabase
      .from("users")
      .insert({ email, name, display_name: displayName, password_hash: hashPassword(password) })
      .select("id")
      .single();
    if (error || !user) throw new HttpError(500, "Could not create your account.");

    await createSession(user.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
