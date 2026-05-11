# Poke Forums

Unofficial fan forum for Poke (the iMessage AI). Not affiliated with Interaction Co.

Built with Next.js 14 (App Router) + TypeScript + Tailwind + Supabase.

## Local dev

Prereqs: Node ≥20, Docker (OrbStack works), Supabase CLI.

```bash
cp .env.local.example .env.local
# Fill in your Supabase project's URL + anon key + service-role key
npm install
npx supabase start         # starts local Postgres in Docker
npm run db:reset           # applies migrations + seed
npm run dev                # http://localhost:3002
```

## Testing

```bash
npm test                   # unit + db tests via Vitest
npm run test:e2e           # Playwright (signup → thread → reply)
```

## Migrations

SQL migrations live in `supabase/migrations/`. After editing schema:

```bash
npm run db:reset           # rebuild local DB from scratch
npx supabase db push       # push migrations to linked remote project
npm run db:types           # regenerate lib/types.ts from local schema
```

See `docs/superpowers/specs/2026-05-08-poke-forums-design.md` and
`docs/superpowers/plans/2026-05-08-poke-forums-mvp.md` for design intent.
