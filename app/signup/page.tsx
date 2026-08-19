import { redirect } from "next/navigation";
import { getCurrentUser, safeRedirectPath } from "@/lib/auth";
import SignupForm from "./SignupForm";

export const dynamic = "force-dynamic";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: { next?: string };
}) {
  // Already signed in? There's nothing to sign up for — go where they were headed.
  const user = await getCurrentUser();
  if (user) redirect(safeRedirectPath(searchParams.next));

  return <SignupForm />;
}
