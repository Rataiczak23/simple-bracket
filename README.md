# 🎯 Simple Bracket

Dead-simple **darts** tournament brackets. A competitor to Challonge, stripped down to
the essentials: create a single- or double-elimination tournament, share a link, let
signed-in players join, and every result feeds a site-wide power-rankings board. Deploys
to a free Vercel instance.

- **Accounts** — username/password sign-in (log in by email); players must sign in to play
- **Single & double elimination** (with automatic byes for non-power-of-2 fields)
- **Power rankings** — placement points across every completed tournament
- **Link + secret** host model — one private admin link, one public share link
- **Pick-a-winner** scoring — tap the winner, the bracket advances
- **Live updates** via Supabase realtime

## Tech

Next.js (App Router) · TypeScript · Tailwind CSS · Supabase (Postgres + Realtime).

All writes go through server Route Handlers using the Supabase **service-role** key.
The browser only ever uses the **anon** key (read + realtime, restricted by RLS). Admin
tokens live in a separate `tournament_secrets` table the public can never read.
Public write routes are rate-limited; in production the limiter is backed by Supabase so
it works across Vercel instances.

## Setup

### 1. Create a Supabase project
At [supabase.com](https://supabase.com), create a free project.

### 2. Apply the schema
Open your project's **SQL Editor → New query**, paste the contents of
[`supabase/schema.sql`](supabase/schema.sql), and run it. This creates the tables, RLS
policies, and realtime publication.

> Already running an older version with data? Run
> [`supabase/migration-auth-rankings.sql`](supabase/migration-auth-rankings.sql) instead —
> it adds the accounts + rankings tables without dropping your tournaments.
>
> If you already deployed this version before rate limiting was added, also run
> [`supabase/migration-rate-limits.sql`](supabase/migration-rate-limits.sql).

### 3. Configure environment
Copy `.env.local.example` to `.env.local` and fill in from **Project Settings → API**:

```
NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...        # "anon public" key
SUPABASE_SERVICE_ROLE_KEY=...            # "service_role" secret key (server only)
OWNER_EMAIL=you@example.com              # the one account that may delete tournaments
```

### 4. Run
```bash
npm install
npm run dev
```
Open http://localhost:3000.

## Deploy to Vercel
1. Push this repo to GitHub.
2. Import it at [vercel.com/new](https://vercel.com/new) (framework auto-detected as Next.js).
3. Add the environment variables above in **Project Settings → Environment Variables**.
4. Deploy. (Or run `vercel` from the CLI and set the env vars when prompted.)

## How it works

| Page | Who | What |
|------|-----|------|
| `/` | anyone | Create a tournament (requires sign-in) |
| `/signup`, `/login` | anyone | Account: name, display name, email, password |
| `/rankings` | public | Power rankings — placement points across all tournaments |
| `/t/[id]` | public | Live bracket, player list, self-join (signed in, while open) |
| `/t/[id]/manage#token=…` | host | Add players by email, start, report winners, reset |
| `/history` | public | Every tournament, newest first (owner also sees delete controls) |

**Auth model.** Accounts live in a `users` table (passwords hashed with Node's `scrypt`);
sign-in is email + password, with an opaque httpOnly session cookie backed by a `sessions`
table. No Supabase Auth, no OAuth — one username/password method. The public bracket view
stays open to everyone; creating and joining require an account so results can be linked.

**Owner deletes.** One account — the email in `OWNER_EMAIL` — can permanently delete a
tournament along with its participants, matches, saved results, and admin token. It is an
env var rather than a database flag so the privilege can't be granted through the app, and
it fails closed when unset. Only `setup` and `in_progress` tournaments can be deleted;
completed ones are the record the power rankings are built from. Hosts and admin-token
holders get no delete power — they still have **Reset bracket** on the manage page.

**Rankings.** When a tournament completes, each player's placement and points are saved to
a `results` table (champion 100, runner-up 70, semifinal 40, quarterfinal 20, last-16 10,
else 5). `/rankings` aggregates totals across all events. Resetting a bracket clears its
saved results.

The bracket engine lives in [`lib/bracket.ts`](lib/bracket.ts) — pure functions for
generation and advancement, with a fixpoint that propagates byes through both the winners
and losers brackets. Regression simulation: `npx tsx lib/bracket.test.mjs`.

## Out of scope (kept simple)
Scores/legs/sets, seeding UI, round-robin, bracket-reset grand final, host dashboards,
password reset / email verification, OAuth or other sign-in methods.
