import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import ProfileForm from "./ProfileForm";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const user = await getCurrentUser();
  // Nothing to edit when there's no account — send them to sign in and back.
  if (!user) redirect(`/login?next=${encodeURIComponent("/profile")}`);

  return <ProfileForm user={user} />;
}
