# 🎯 Simple Bracket

Dead-simple **darts** tournament brackets. A competitor to Challonge, stripped down to
the essentials: create a single- or double-elimination tournament, share a link, and let
players join as guests — no accounts. Deploys to a free Vercel instance.

- **Single & double elimination** (with automatic byes for non-power-of-2 fields)
- **Guest entry** — players join with just a name, no sign-up
- **Link + secret** host model — one private admin link, one public share link
- **Pick-a-winner** scoring — tap the winner, the bracket advances
- **Live updates** via Supabase realtime

## Tech

Next.js (App Router) · TypeScript · Tailwind CSS · Supabase (Postgres + Realtime).

All writes go through server Route Handlers using the Supabase **service-role** key.
The browser only ever uses the **anon** key (read + realtime, restricted by RLS). Admin
tokens live in a separate `tournament_secrets` table the public can never read.

## Setup

### 1. Create a Supabase project
At [supabase.com](https://supabase.com), create a free project.

### 2. Apply the schema
Open your project's **SQL Editor → New query**, paste the contents of
[`supabase/schema.sql`](supabase/schema.sql), and run it. This creates the tables, RLS
policies, and realtime publication.

### 3. Configure environment
Copy `.env.local.example` to `.env.local` and fill in from **Project Settings → API**:

```
NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...        # "anon public" key
SUPABASE_SERVICE_ROLE_KEY=...            # "service_role" secret key (server only)
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
3. Add the three environment variables above in **Project Settings → Environment Variables**.
4. Deploy. (Or run `vercel` from the CLI and set the env vars when prompted.)

## How it works

| Page | Who | What |
|------|-----|------|
| `/` | anyone | Create a tournament (name + format) |
| `/t/[id]` | public | Live bracket, player list, guest join (while open) |
| `/t/[id]/manage#token=…` | host | Add/remove players, start, report winners, reset |

The bracket engine lives in [`lib/bracket.ts`](lib/bracket.ts) — pure functions for
generation and advancement, with a fixpoint that propagates byes through both the winners
and losers brackets. Regression simulation: `npx tsx lib/bracket.test.mjs`.

## Out of scope (kept simple)
Scores/legs/sets, seeding UI, round-robin, bracket-reset grand final, host dashboards.
