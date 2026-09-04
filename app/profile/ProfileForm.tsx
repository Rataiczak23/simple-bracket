"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Field from "@/components/Field";
import type { AuthUser } from "@/lib/types";

export default function ProfileForm({ user }: { user: AuthUser }) {
  const router = useRouter();

  const [form, setForm] = useState({
    name: user.name,
    displayName: user.display_name,
    email: user.email,
    currentPassword: "",
    newPassword: "",
    confirmNewPassword: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  // Typing invalidates both the last error and the last success note, so a
  // stale "Saved" can never sit above fields that no longer match the account.
  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const { value } = e.target;
    setError(null);
    setSaved(null);
    setForm((f) => ({ ...f, [key]: value }));
  };

  const emailChanged = form.email.trim().toLowerCase() !== user.email;
  const changingPassword = form.newPassword.length > 0 || form.confirmNewPassword.length > 0;
  // Derived so the warning tracks the fields live rather than lingering from
  // an earlier submit.
  const passwordsMismatch =
    form.confirmNewPassword.length > 0 && form.newPassword !== form.confirmNewPassword;
  const needsCurrentPassword = emailChanged || changingPassword;

  const unchanged =
    !needsCurrentPassword &&
    form.name.trim() === user.name &&
    form.displayName.trim() === user.display_name;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (passwordsMismatch) return;
    setBusy(true);
    setError(null);
    setSaved(null);
    try {
      const res = await fetch("/api/auth/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not save your profile.");

      const notes = ["Profile saved."];
      if (data.renamedEntries > 0) {
        notes.push(
          `Updated your name on ${data.renamedEntries} bracket ${
            data.renamedEntries === 1 ? "entry" : "entries"
          }.`
        );
      }
      if (data.passwordChanged) notes.push("Signed out your other devices.");
      setSaved(notes.join(" "));

      // Clear the password boxes so a save doesn't leave them primed, and pull
      // the header greeting (a Server Component) back in sync with the account.
      setForm((f) => ({ ...f, currentPassword: "", newPassword: "", confirmNewPassword: "" }));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save your profile.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-sm mx-auto rounded-xl border border-slate-800 bg-slate-900 p-6 space-y-4">
      <h1 className="text-lg font-semibold">Your profile</h1>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Name" id="name">
          <input
            id="name"
            value={form.name}
            onChange={set("name")}
            maxLength={80}
            required
            className="auth-input"
          />
        </Field>
        <Field label="Display name" id="displayName" hint="Shown in brackets &amp; rankings">
          <input
            id="displayName"
            value={form.displayName}
            onChange={set("displayName")}
            maxLength={40}
            required
            className="auth-input"
          />
        </Field>
        <Field label="Email" id="email" hint="You sign in with this">
          <input
            id="email"
            type="email"
            autoComplete="email"
            value={form.email}
            onChange={set("email")}
            required
            className="auth-input"
          />
        </Field>

        <div className="border-t border-slate-800 pt-4 space-y-4">
          <p className="text-sm text-slate-400">
            Change password{" "}
            <span className="text-slate-600">· leave blank to keep your current one</span>
          </p>
          <Field label="New password" id="newPassword" hint="At least 8 characters">
            <input
              id="newPassword"
              type="password"
              autoComplete="new-password"
              value={form.newPassword}
              onChange={set("newPassword")}
              className="auth-input"
            />
          </Field>
          <Field label="Confirm new password" id="confirmNewPassword">
            <input
              id="confirmNewPassword"
              type="password"
              autoComplete="new-password"
              value={form.confirmNewPassword}
              onChange={set("confirmNewPassword")}
              className="auth-input"
              aria-invalid={passwordsMismatch || undefined}
              aria-describedby={passwordsMismatch ? "confirmNewPassword-error" : undefined}
            />
            {passwordsMismatch && (
              <p id="confirmNewPassword-error" className="mt-1 text-sm text-red-400">
                New passwords do not match.
              </p>
            )}
          </Field>
        </div>

        {/* Only asked for when it's actually required, so an ordinary rename
            isn't gated behind re-entering a password. */}
        {needsCurrentPassword && (
          <div className="border-t border-slate-800 pt-4">
            <Field
              label="Current password"
              id="currentPassword"
              hint={changingPassword ? "required to set a new password" : "required to change email"}
            >
              <input
                id="currentPassword"
                type="password"
                autoComplete="current-password"
                value={form.currentPassword}
                onChange={set("currentPassword")}
                required
                className="auth-input"
              />
            </Field>
          </div>
        )}

        {error && <p className="text-sm text-red-400">{error}</p>}
        {saved && <p className="text-sm text-emerald-400">{saved}</p>}
        <button
          type="submit"
          disabled={busy || passwordsMismatch || unchanged}
          className="w-full rounded-md bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 px-4 py-2 font-semibold"
        >
          {busy ? "Saving…" : unchanged ? "No changes" : "Save changes"}
        </button>
      </form>
    </div>
  );
}
