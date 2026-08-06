@AGENTS.md

# SHUTTLE · instructions for any session touching this project

Read BUILD_CHARTER.md before writing code. It is binding, not advisory.

## Stack, decided 2026-08-06

Expo Router + React Native Web + TypeScript. One codebase: `npx expo export -p web` deploys to Vercel today, EAS builds iOS later, same screens. This reverses TECH.md's "web is secondary, not in v0.1/v0.2" on Rahul's call, because his circle tests on the web build first.

Supabase is the source of truth: Postgres, auth, realtime. `expo-sqlite` offline-first is deferred to the organiser console (P3), where a hall with dead network is a real design constraint. Daily-mode group nights run online against Supabase with a thin cache. Do not build the offline layer early.

**But do not make offline impossible later.** Research on 2026-08-06 found that concurrent offline writes to shared tournament state are unclaimed in any sport, and that is this product's eventual moat. The architectural constraint that keeps the door open costs nothing now: **every state change is an append-only event in the op log, never a direct row mutation.** Points, calls, walkovers, check-ins, court assignments. State is a deterministic replay of that log. Build it that way from the first migration and offline becomes a storage swap. Mutate rows directly and P3 becomes a rewrite.

Engines stay pure TypeScript with no I/O: `score`, `rating`, `split`, later `draw` and `scheduler`. They are the part that must be correct.

## The two account types

Not one role flag on one surface. Two genuinely different products sharing a spine.

**Player** is the daily active user. Today feed, sessions, scoring, running balances, profile, rating. Also runs *friendly* mini tournaments inside their own group: round robin, americano, mexicano, small knockout. No seeding math, no categories, no fees.

**Organiser** runs real events. Categories, entries, fee collection, BWF draws with seeding and byes, the Call Board, delay-adaptive scheduling, results publishing.

Shared spine: identity, rating, match records, the scoring engine, the op log. A Player's mini event and an Organiser's 200-entry open write the same `Match` and `MatchEvent` rows, which is what makes an ordinary Tuesday feed the same rating that seeds a real draw.

One human can hold both. The account type decides which surface opens, not what they are permitted to become.

## Security, non-negotiable

- RLS on every table in the same migration that creates it. A table without RLS does not ship.
- Prove a policy with a test where the wrong user gets zero rows. Prose is not proof.
- `SUPABASE_SERVICE_ROLE_KEY` never appears in client code and never carries the `EXPO_PUBLIC_` prefix. It bypasses RLS entirely.
- The anon key is public by design and ships in the bundle. That is fine. RLS is the security boundary, not key secrecy.
- No secret in a commit, ever. Check the diff before staging.

## How code gets written here

`ponytail` is active at `full` on every coding session. YAGNI, reuse before write, stdlib before dependency, shortest working diff that actually works.

Plus two rules ponytail does not cover:

- Touch only what the request requires. No improving adjacent code, comments, or formatting. No refactoring what is not broken. Match existing style even where you would do it differently.
- Unrelated dead code gets mentioned, not deleted. Delete only what your own change orphaned. Every changed line traces to the request.

Do not invoke `simplification-cascades` during a build slice. It pushes toward extracting abstractions, which is the opposite of what this project needs while it is small.

## Voice

User-facing text follows DESIGN.md's voice contract and the global humanizer rule: short sentences, plain words, no em dashes, no filler. The player-facing sentence that matters most is "You're 2 matches out. Court 3. About 25 minutes." Write everything else to that standard.
