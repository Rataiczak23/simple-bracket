import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { HttpError, errorResponse } from "@/lib/admin";
import { createSession, verifyPassword } from "@/lib/auth";
import { clientIpKey, enforceRateLimits, rateLimitKey } from "@/lib/rate-limit";

export const runtime = "nodejs";

// POST /api/auth/login { email, password }
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";

    const limited = await enforceRateLimits(req, [
      {
        name: "auth-login-ip",
        key: clientIpKey(req),
        limit: 10,
        windowSec: 300,
        message: "Too many sign-in attempts. Try again in a few minutes.",
      },
      {
        name: "auth-login-email",
        key: rateLimitKey("email", email || "__blank__"),
        limit: 5,
        windowSec: 300,
        message: "Too many sign-in attempts. Try again in a few minutes.",
      },
    ]);
    if (limited) return limited;

    if (!email || !password) throw new HttpError(400, "Email and password are required.");

    const supabase = createServiceClient();
    const { data: user } = await supabase
      .from("users")
      .select("id, password_hash")
      .eq("email", email)
      .maybeSingle<{ id: string; password_hash: string }>();

    // Same error whether the email is unknown or the password is wrong.
    if (!user || !verifyPassword(password, user.password_hash)) {
      throw new HttpError(401, "Incorrect email or password.");
    }

    await createSession(user.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
