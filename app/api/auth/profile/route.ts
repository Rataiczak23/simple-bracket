import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { HttpError, errorResponse } from "@/lib/admin";
import { hashPassword, requireUser, revokeOtherSessions, verifyPassword } from "@/lib/auth";
import { clientIpKey, enforceRateLimits, rateLimitKey } from "@/lib/rate-limit";
import type { AuthUser } from "@/lib/types";

export const runtime = "nodejs";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * PATCH /api/auth/profile
 * { name, displayName, email, currentPassword?, newPassword?, confirmNewPassword? }
 *
 * Updates the signed-in user's own account. Changing the email or the password
 * additionally requires the current password: a session cookie alone must not
 * be enough to take an account over by moving its login identity.
 */
export async function PATCH(req: Request) {
  try {
    const me = await requireUser();
    const body = await req.json();

    const name = typeof body.name === "string" ? body.name.trim() : "";
    const displayName = typeof body.displayName === "string" ? body.displayName.trim() : "";
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const currentPassword = typeof body.currentPassword === "string" ? body.currentPassword : "";
    const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";
    const confirmNewPassword =
      typeof body.confirmNewPassword === "string" ? body.confirmNewPassword : "";

    // Also throttles password guessing: a wrong `currentPassword` costs a hit.
    const limited = await enforceRateLimits(req, [
      {
        name: "auth-profile-ip",
        key: clientIpKey(req),
        limit: 30,
        windowSec: 900,
        message: "Too many profile updates. Try again a little later.",
      },
      {
        name: "auth-profile-user",
        key: rateLimitKey("user", me.id),
        limit: 15,
        windowSec: 900,
        message: "Too many profile updates. Try again a little later.",
      },
    ]);
    if (limited) return limited;

    if (!name) throw new HttpError(400, "Name is required.");
    if (name.length > 80) throw new HttpError(400, "Name too long (max 80 chars).");
    if (!displayName) throw new HttpError(400, "Display name is required.");
    if (displayName.length > 40) throw new HttpError(400, "Display name too long (max 40 chars).");
    if (!EMAIL_RE.test(email)) throw new HttpError(400, "Enter a valid email address.");

    const emailChanged = email !== me.email;
    // Either password box being filled in counts as an attempt to change it, so
    // a typo in only one of them is reported rather than silently ignored.
    const changingPassword = newPassword.length > 0 || confirmNewPassword.length > 0;

    const supabase = createServiceClient();

    if (emailChanged || changingPassword) {
      if (!currentPassword) {
        throw new HttpError(400, "Enter your current password to change your email or password.");
      }
      const { data: row } = await supabase
        .from("users")
        .select("password_hash")
        .eq("id", me.id)
        .single<{ password_hash: string }>();
      if (!row || !verifyPassword(currentPassword, row.password_hash)) {
        throw new HttpError(403, "Current password is incorrect.");
      }
    }

    if (changingPassword) {
      if (newPassword.length < 8) {
        throw new HttpError(400, "New password must be at least 8 characters.");
      }
      if (newPassword !== confirmNewPassword) {
        throw new HttpError(400, "New passwords do not match.");
      }
    }

    if (emailChanged) {
      const { data: taken } = await supabase
        .from("users")
        .select("id")
        .eq("email", email)
        .neq("id", me.id)
        .maybeSingle();
      if (taken) throw new HttpError(409, "An account with that email already exists.");
    }

    const updates: Record<string, string> = { name, display_name: displayName, email };
    if (changingPassword) updates.password_hash = hashPassword(newPassword);

    const { data: updated, error } = await supabase
      .from("users")
      .update(updates)
      .eq("id", me.id)
      .select("id, email, name, display_name")
      .single<AuthUser>();
    // A racing signup can still claim the email between the check and the write.
    if (error?.code === "23505") {
      throw new HttpError(409, "An account with that email already exists.");
    }
    if (error || !updated) throw new HttpError(500, "Could not save your profile.");

    // `participants.name` is a snapshot taken at join time, so brackets would
    // keep showing the old name. Re-point every entry this account owns, so a
    // rename (or a fixed typo) follows the player everywhere they appear.
    let renamedEntries = 0;
    if (displayName !== me.display_name) {
      const { data: rows } = await supabase
        .from("participants")
        .update({ name: displayName })
        .eq("user_id", me.id)
        .select("id");
      renamedEntries = rows?.length ?? 0;
    }

    // A new password invalidates anyone else holding the old one, or a session.
    if (changingPassword) await revokeOtherSessions(me.id);

    return NextResponse.json({
      ok: true,
      user: updated,
      renamedEntries,
      passwordChanged: changingPassword,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
