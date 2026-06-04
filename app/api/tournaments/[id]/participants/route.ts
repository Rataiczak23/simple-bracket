import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { assertAdmin, HttpError, errorResponse, tokenFromRequest } from "@/lib/admin";
import { getCurrentUser } from "@/lib/auth";

export const runtime = "nodejs";

/**
 * POST /api/tournaments/[id]/participants
 *
 * Two ways to add an entrant (both setup-only, both must resolve to a real
 * account so results can feed the power rankings):
 *   - Self-join: signed-in user, no body — joins as themselves.
 *   - Host add:  valid x-admin-token + { email } — adds the registered user with
 *     that email.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const supabase = createServiceClient();
    const body = await req.json().catch(() => ({}));
    const adminToken = tokenFromRequest(req);

    const { data: tournament, error: tErr } = await supabase
      .from("tournaments")
      .select("id, status")
      .eq("id", params.id)
      .single();
    if (tErr || !tournament) throw new HttpError(404, "Tournament not found.");
    if (tournament.status !== "setup") {
      throw new HttpError(409, "This tournament has already started — no more entries.");
    }

    // Resolve which account to add.
    let userId: string;
    let displayName: string;

    if (adminToken) {
      // Host adding another player by email.
      await assertAdmin(supabase, params.id, adminToken);
      const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
      if (!email) throw new HttpError(400, "Enter the player's account email.");
      const { data: user } = await supabase
        .from("users")
        .select("id, display_name")
        .eq("email", email)
        .maybeSingle<{ id: string; display_name: string }>();
      if (!user) throw new HttpError(404, "No account found with that email.");
      userId = user.id;
      displayName = user.display_name;
    } else {
      // Self-join.
      const me = await getCurrentUser();
      if (!me) throw new HttpError(401, "Sign in to join this tournament.");
      userId = me.id;
      displayName = me.display_name;
    }

    // Already in?
    const { data: dupe } = await supabase
      .from("participants")
      .select("id")
      .eq("tournament_id", params.id)
      .eq("user_id", userId)
      .maybeSingle();
    if (dupe) throw new HttpError(409, "That player has already joined.");

    const { count } = await supabase
      .from("participants")
      .select("id", { count: "exact", head: true })
      .eq("tournament_id", params.id);
    if ((count ?? 0) >= 128) throw new HttpError(409, "Entry limit reached (128).");

    const { data: participant, error: pErr } = await supabase
      .from("participants")
      .insert({ tournament_id: params.id, user_id: userId, name: displayName })
      .select("*")
      .single();
    if (pErr || !participant) throw new HttpError(500, "Could not add the player.");

    return NextResponse.json(participant);
  } catch (err) {
    return errorResponse(err);
  }
}
