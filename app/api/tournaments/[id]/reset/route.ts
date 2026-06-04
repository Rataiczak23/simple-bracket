import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { assertAdmin, errorResponse, tokenFromRequest, HttpError } from "@/lib/admin";

export const runtime = "nodejs";

// POST /api/tournaments/[id]/reset -> clear all matches and return to setup.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const supabase = createServiceClient();
    await assertAdmin(supabase, params.id, tokenFromRequest(req));

    const { error: dErr } = await supabase.from("matches").delete().eq("tournament_id", params.id);
    if (dErr) throw new HttpError(500, "Could not clear the bracket.");

    const { error: uErr } = await supabase
      .from("tournaments")
      .update({ status: "setup", winner_id: null })
      .eq("id", params.id);
    if (uErr) throw new HttpError(500, "Could not reset the tournament.");

    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
