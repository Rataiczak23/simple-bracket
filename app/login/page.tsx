import { redirect } from "next/navigation";
import { getCurrentUser, safeRedirectPath } from "@/lib/auth";
import LoginForm from "./LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: { next?: string };
}) {
  // Already signed in? Don't offer a second login — go where they were headed.
  const user = await getCurrentUser();
  if (user) redirect(safeRedirectPath(searchParams.next));

  return <LoginForm />;
}
