import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { assertAdmin, errorResponse, tokenFromRequest, HttpError } from "@/lib/admin";

export const runtime = "nodejs";

// DELETE /api/tournaments/[id]/participants/[pid] -> admin removes an entrant (setup only).
export async function DELETE(
  req: Request,
  { params }: { params: { id: string; pid: string } }
) {
  try {
    const supabase = createServiceClient();
    await assertAdmin(supabase, params.id, tokenFromRequest(req));

    const { data: tournament } = await supabase
      .from("tournaments")
      .select("status")
      .eq("id", params.id)
      .single();
    if (tournament?.status !== "setup") {
      throw new HttpError(409, "Can't remove players after the tournament has started.");
    }

    const { error } = await supabase
      .from("participants")
      .delete()
      .eq("id", params.pid)
      .eq("tournament_id", params.id);
    if (error) throw new HttpError(500, "Could not remove participant.");

    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
