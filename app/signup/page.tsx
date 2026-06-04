"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

function SignupForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/";

  const [form, setForm] = useState({
    name: "",
    displayName: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (form.password !== form.confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not create your account.");
      router.push(next);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create your account.");
      setBusy(false);
    }
  }

  return (
    <div className="max-w-sm mx-auto rounded-xl border border-slate-800 bg-slate-900 p-6 space-y-4">
      <h1 className="text-lg font-semibold">Create your account</h1>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Name" id="name">
          <input id="name" value={form.name} onChange={set("name")} maxLength={80} required className="auth-input" />
        </Field>
        <Field label="Display name" id="displayName" hint="Shown to other players in brackets &amp; rankings">
          <input
            id="displayName"
            value={form.displayName}
            onChange={set("displayName")}
            maxLength={40}
            required
            className="auth-input"
          />
        </Field>
        <Field label="Email" id="email" hint="You'll sign in with this">
          <input id="email" type="email" autoComplete="email" value={form.email} onChange={set("email")} required className="auth-input" />
        </Field>
        <Field label="Password" id="password" hint="At least 8 characters">
          <input
            id="password"
            type="password"
            autoComplete="new-password"
            value={form.password}
            onChange={set("password")}
            minLength={8}
            required
            className="auth-input"
          />
        </Field>
        <Field label="Confirm password" id="confirmPassword">
          <input
            id="confirmPassword"
            type="password"
            autoComplete="new-password"
            value={form.confirmPassword}
            onChange={set("confirmPassword")}
            required
            className="auth-input"
          />
        </Field>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-md bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 px-4 py-2 font-semibold"
        >
          {busy ? "Creating…" : "Create account"}
        </button>
      </form>
      <p className="text-sm text-slate-400">
        Already have an account?{" "}
        <Link
          href={`/login${next !== "/" ? `?next=${encodeURIComponent(next)}` : ""}`}
          className="text-emerald-400 hover:underline"
        >
          Sign in
        </Link>
      </p>
    </div>
  );
}

function Field({
  label,
  id,
  hint,
  children,
}: {
  label: string;
  id: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm text-slate-400 mb-1">
        {label}
        {hint && <span className="text-slate-600"> · {hint}</span>}
      </label>
      {children}
    </div>
  );
}

export default function SignupPage() {
  return (
    <Suspense fallback={<p className="text-slate-400">Loading…</p>}>
      <SignupForm />
    </Suspense>
  );
}
