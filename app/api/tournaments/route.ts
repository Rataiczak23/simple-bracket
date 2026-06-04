import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { HttpError, errorResponse } from "@/lib/admin";
import { requireUser } from "@/lib/auth";
import { clientIpKey, enforceRateLimits, rateLimitKey } from "@/lib/rate-limit";

export const runtime = "nodejs";

// POST /api/tournaments  { name, format } -> create a tournament + admin secret.
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const limited = await enforceRateLimits(req, [
      {
        name: "tournament-create-ip",
        key: clientIpKey(req),
        limit: 20,
        windowSec: 3600,
        message: "Too many tournament creations. Try again later.",
      },
      {
        name: "tournament-create-user",
        key: rateLimitKey("user", user.id),
        limit: 10,
        windowSec: 3600,
        message: "Too many tournament creations. Try again later.",
      },
    ]);
    if (limited) return limited;

    const { name, format } = await req.json();

    const cleanName = typeof name === "string" ? name.trim() : "";
    if (!cleanName) throw new HttpError(400, "Tournament name is required.");
    if (cleanName.length > 80) throw new HttpError(400, "Name too long (max 80 chars).");
    if (format !== "single" && format !== "double") {
      throw new HttpError(400, "Format must be 'single' or 'double'.");
    }

    const supabase = createServiceClient();
    const { data: tournament, error: tErr } = await supabase
      .from("tournaments")
      .insert({ name: cleanName, format, status: "setup", created_by: user.id })
      .select("id")
      .single();
    if (tErr || !tournament) throw new HttpError(500, "Could not create tournament.");

    const adminToken = `${globalThis.crypto.randomUUID()}${globalThis.crypto.randomUUID()}`.replace(
      /-/g,
      ""
    );
    const { error: sErr } = await supabase
      .from("tournament_secrets")
      .insert({ tournament_id: tournament.id, admin_token: adminToken });
    if (sErr) {
      // roll back the orphaned tournament
      await supabase.from("tournaments").delete().eq("id", tournament.id);
      throw new HttpError(500, "Could not create tournament secret.");
    }

    return NextResponse.json({ id: tournament.id, adminToken });
  } catch (err) {
    return errorResponse(err);
  }
}
