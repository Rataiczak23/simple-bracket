/**
 * Labelled form row shared by the auth and profile forms. `hint` is the small
 * grey note after the label ("You'll sign in with this"), used instead of
 * placeholder text so it stays visible while the field is filled in.
 */
export default function Field({
  label,
  id,
  hint,
  children,
}: {
  label: string;
  id: string;
  hint?: React.ReactNode;
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
