import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/server";
import { fetchBundle } from "@/lib/fetchBundle";
import PublicView from "./PublicView";

export const dynamic = "force-dynamic";

export default async function PublicTournamentPage({ params }: { params: { id: string } }) {
  const supabase = createServiceClient();
  const bundle = await fetchBundle(supabase, params.id);
  if (!bundle) notFound();

  return <PublicView id={params.id} initial={bundle} />;
}
