import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/server";
import { fetchBundle } from "@/lib/fetchBundle";
import { getCurrentUser, isOwner } from "@/lib/auth";
import PublicView from "./PublicView";

export const dynamic = "force-dynamic";

export default async function PublicTournamentPage({ params }: { params: { id: string } }) {
  const supabase = createServiceClient();
  const [bundle, user] = await Promise.all([fetchBundle(supabase, params.id), getCurrentUser()]);
  if (!bundle) notFound();

  return (
    <PublicView id={params.id} initial={bundle} currentUser={user} canDelete={isOwner(user)} />
  );
}
