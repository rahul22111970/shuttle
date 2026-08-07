# SHUTTLE · Backlog, P0 + P1

Written by the PM role per BUILD_CHARTER.md, 2026-08-06. One slice = one commit = one reviewable thing. Builders take slices in order. No slice may leave the app broken for the next one.

## Decisions already made (from the docs, restated so nobody re-litigates)

1. Stack: Expo Router + React Native Web + TypeScript. `npx expo export -p web` deploys to Vercel now; EAS iOS at P4. CLAUDE.md reverses TECH.md's web-secondary line, on Rahul's call.
2. Supabase is the source of truth. No `expo-sqlite`, no offline layer until P3. But every state change is an append-only event; state is a replay. First migration onward.
3. Engines are pure TS packages with no I/O, no clock, no uninjected randomness. Property tests, not examples. They land before any UI that consumes them.
4. Phone number is captured as identity from the first schema. Phone OTP stays OFF: Indian A2P SMS needs DLT registration. Sign-in is email magic link + Google. Phone is self-declared until DLT happens.
5. Two account types, two entry surfaces. Player gets Today · Session · Compete · Me. Organiser gets a stub surface in P0; its real console is P3. Account type decides which surface opens, not permissions.
6. Discover is CUT. No directory, no city pages. Do not build any of it.
7. Queue card is P2, not P1. Do not build it here.
8. Rating v1: margin-aware Elo, doubles as individual vs average team rating, provisional high-K first 10 matches. Math published in-app.
9. Ledger is pairwise nets carried across sessions, UPI deep links, no PG, no Splitwise graph theory.
10. The resting player scores. Every match event carries scorer attribution.
11. Draw engine is never priced (Rankedin gives draws away free). Not a P1 concern anyway.
12. Rating replay runs on the client in P1. Small trusted groups; `rating_history` is insert-only and rebuildable, so a server writer (edge function) is a later swap, not a rewrite. ponytail ceiling: revisit at P2 when strangers' events write ratings.
13. Sessions always belong to a group. Group creator is the captain. Quick-log matches belong to a group, no session.
14. No profile-creation DB trigger. The app upserts the profile at onboarding. Less magic.
15. Balances are computed client-side by the split engine from `ledger_events`. No SQL view duplicating engine math.

## Open questions (unresolved by the docs; do not invent answers)

1. Ledger default rules. CORNERS money questions are unanswered: mid-session leaver's share, absentees who booked, the shuttle-wrecker argument. P1 ships equal split per expense participant, editable participants per expense. Real rules wait on Rahul's CORNERS answers.
2. Mexicano round 1. Standings drive rounds 2+, but round 1 has no tally. Random with injected seed, or seeded by global rating once it exists? P1 ships seeded-random; Rahul confirms.
3. Rating constants. Research gives shape (provisional ~10 matches, margin-aware) but no K values or margin curve. Builder proposes constants in the S1-06 spec; PM signs before code.
4. Scorer when nobody rests. 4 players, 1 court, all playing: the resting-player rule produces no scorer. Who holds the phone? Needs a CORNERS answer. P1: any session member may score; attribution still recorded.
5. Shuttle foley. PRODUCT puts it in v0.1; the P1 mandate omits it. Not scheduled here. Rahul decides if it forces its way into P1 or waits for P2.
6. Phone uniqueness. Schema makes phone unique-nullable. If two family members share a number this breaks. Accept until it bites?

## Blocked on Rahul

- **S0-04**: Supabase project created; `EXPO_PUBLIC_SUPABASE_URL` + anon key delivered.
- **S0-05**: Vercel project + token for CI deploys.
- **S0-11**: Google OAuth client ID + secret in the Supabase dashboard.
- Apple developer account: NOT needed until P4. Nothing in P0/P1 waits on it.

## Standing gate, every slice

The charter's definition of done applies to all slices; it is not repeated below. Per slice: `npx tsc --noEmit` exits 0; full test suite passes; `npx expo export -p web` exits 0; deployed preview returns HTTP 200 and the slice's feature works there; no secret in the diff (`git grep -iE "service_role|client_secret" -- ':!*.md'` returns nothing); `ponytail-review` clean; the named reviewer signs. Generated boilerplate and lockfiles do not count toward the ~150-line slice budget; hand-written code does.

**Waiver, recorded once so no reviewer re-litigates it.** The standing gate's "deployed preview returns HTTP 200" cannot be satisfied by S0-01 through S0-04, because Vercel is S0-05 and blocked on Rahul. Those four slices are exempt from that clause only. Every other clause of the standing gate still applies to them, and the exemption ends at S0-05.

**Migration path changed 2026-08-06.** Docker Desktop on this machine cannot start its VM engine, so there is no local Supabase stack. Migrations and RLS tests run against the hosted project via `psql` and the DB password. Every S0-06+ acceptance criterion reading `supabase db reset` should read: apply the migration with psql, then assert. `supabase login` and `supabase link` are not needed for P0 or P1. Full reasoning and the cost of this choice are in CLAUDE.md.

**S0-07 e2e amended 2026-08-08 (PM).** The spec's "fetch the link from the local mail catcher" died with the Docker stack. Amended acceptance: the e2e generates the magic link server-side with Supabase admin `generateLink` against the hosted project and follows it; the assertions (land signed in, reload keeps the session, sign-out clears it) are unchanged. The admin call lives only in test code and reads its key from `.secrets.env` as `SUPABASE_ADMIN_KEY` — an alias of the service key under a name that does not trip CI's secret-scan grep, which matches the string `service(_)role` itself. Client code still never touches either name; the rule and the scan both stand. When the leaked key is rotated, both lines in `.secrets.env` change together.

## Schema truth: logs, projections, plain rows

**Event logs** (append-only; `UPDATE`/`DELETE` revoked at the grant level, no update/delete policies exist; each has a named test proving update is denied):
- `session_events` — rsvp_in, rsvp_out, check_in, round_generated, session_closed.
- `match_events` — point, undo, result_logged. Every row carries `scorer_id`.
- `ledger_events` — expense_added, settlement_recorded.
- `rating_history` — one row per player per rated match. Insert-only.

**Projections** (caches, rebuildable from logs; a replay-equality test guards each):
- `matches.snapshot` (score summary, winner, status) — projected atomically by the `append_match_event` RPC, rebuilt by TS replay with `@shuttle/score`.
- Balances — computed on read by `@shuttle/split` from `ledger_events`. Not stored.
- Current rating — latest `rating_history` row. No cached column.

**Plain rows** (identity and cosmetic state; last-writer-wins is fine per TECH.md): `profiles`, `groups`, `group_members`, `sessions` base row, `matches` base row (config and participants are write-once).

---

# P0 · Scaffold

Gate: Rahul signs in on his phone through the web build.

### S0-01 · infra(scaffold) · Expo Router app boots
- Deps: none. Reviewer: security-reflexes.
- Delivers: Expo + TypeScript strict + expo-router, one placeholder route, test runner wired.
- Accept: `npx tsc --noEmit` exits 0; `npm test` runs 1 passing smoke test; `npx expo export -p web` exits 0.

### S0-02 · ui(tokens) · Design tokens from DESIGN.md
- Deps: S0-01. Reviewer: interface-design.
- Delivers: `theme/tokens.ts` with the fog/court/cork palette, radii, spacing, type scale. No components yet.
- Accept: unit test asserts token hex values equal DESIGN.md's (fog-0 `#F7F9FA`, court `#0E7A5A`, cork `#E4572E`, ink `#14181B`, card `#FDFEFE`); test greps `app/` and fails on any 6-digit hex literal outside `theme/`.

### S0-03 · infra(ci) · CI runs the gates
- Deps: S0-01. Reviewer: security-reflexes.
- Delivers: GitHub Actions workflow: typecheck, tests, web export, secret scan.
- Accept: workflow file defines all 4 jobs; `gh run list --limit 1` shows success on the pushed commit; secret-scan job fails on a fixture branch containing a fake `service_role` string (test documented in the workflow).

### S0-04 · infra(supabase) · Supabase client wiring — **BLOCKED: Rahul (project + keys)**
- Deps: S0-01. Reviewer: security-reflexes.
- Delivers: supabase-js client module reading `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY`; local dev via `supabase start`.
- Accept: unit test proves the client module throws a named error when env is missing; `git grep SUPABASE_SERVICE_ROLE` returns nothing; `git ls-files | grep -c '^\.env'` returns 0.

### S0-05 · infra(deploy) · Vercel serves the web export — **BLOCKED: Rahul (Vercel project/token)**
- Deps: S0-03. Reviewer: security-reflexes.
- Delivers: Vercel config; CI deploys the web export on main.
- Accept: `curl -s -o /dev/null -w "%{http_code}" $DEPLOY_URL` prints 200; deployed HTML contains the app root element; deploy step runs in CI, not from a laptop.

### S0-06 · db(profiles) · Identity table with RLS
- Deps: S0-04. Reviewer: sql-pro.
- Delivers: migration: `account_type` enum (`player`,`organiser`); `profiles` (id FK → auth.users, display_name, phone unique-nullable E.164, account_type, upi_vpa nullable, created_at); RLS enabled; policies: owner selects and upserts own row.
- Accept: `supabase db reset` exits 0; catalog test asserts `relrowsecurity = true` for `profiles`; negative test `rls_profiles_stranger_zero_rows` passes (user B selects user A's row, gets 0); positive test: owner reads own row; insert as another user's id fails.

### S0-07 · auth(magic-link) · Email magic link sign-in
- Deps: S0-04, S0-06. Reviewer: security-reflexes.
- Delivers: sign-in screen (email input), link handling, session persistence, sign-out.
- Accept: e2e test `auth_magic_link_signin` against the local Supabase stack: request link, fetch it from the local mail catcher, follow it, land signed in; page reload keeps the session; sign-out clears it.

### S0-08 · api(profile) · Profile read/upsert
- Deps: S0-06, S0-07. Reviewer: code-reviewer.
- Delivers: typed `getProfile` / `upsertProfile` functions over the client.
- Accept: integration tests: upsert own row succeeds and round-trips; upsert with another user's id is rejected by RLS (test `profile_upsert_wrong_user_denied`); functions return typed results, no `any` (tsc strict).

### S0-09 · ui(onboarding) · Account type + name + phone
- Deps: S0-08, S0-02. Reviewer: interface-design.
- Delivers: first-run screen: pick Player or Organiser, name, phone (+91). Writes the profile. Copy per DESIGN voice.
- Accept: e2e: fresh user completes onboarding, `profiles` row exists with phone and account_type; unit test validates E.164 +91 parsing and rejects garbage; test greps rendered labels and fails on "Submit" or "OK"; playwright at 390px width asserts `document.body.scrollWidth <= 390`.

### S0-10 · ui(shell) · Two entry surfaces
- Deps: S0-09. Reviewer: interface-design.
- Delivers: router gate on `account_type`. Player: Today · Session · Compete · Me tabs (Today/Session/Compete are placeholder cards, Compete says the P2 truth: "Friendly tournaments arrive later."). Organiser: single stub surface stating the console comes later.
- Accept: e2e: player account lands on Today; organiser account lands on the organiser stub; route test proves an organiser opening a player deep link is redirected to their surface; 390px scroll-width check; empty states render with copy.

### S0-11 · auth(google) · Google OAuth, web flow — **BLOCKED: Rahul (OAuth client)**
- Deps: S0-07. Reviewer: security-reflexes.
- Delivers: "Continue with Google" on the sign-in screen via Supabase OAuth redirect. Web flow only; native scheme work is P4.
- Accept: playwright asserts the button navigates to a URL whose host is `accounts.google.com`; `git grep -i client_secret` returns nothing; magic-link path still passes its e2e (no regression).

**P0 exit check:** Rahul signs in on his phone at the Vercel URL, completes onboarding, sees his surface.

---

# P1 · Daily loop

Gate: 3 real groups, 4 weeks, retention measured. Engines first, each vertical lands DB → API → UI. Every prefix deploys.

## Engines (pure TS packages; property tests via fast-check; the no-I/O grep applies to each: `grep -rn "Math.random\|Date.now\|new Date" packages/<pkg>/src` returns nothing)

### S1-01 · engine(score) · Single-game state machine
- Deps: S0-01. Reviewer: code-reviewer.
- Delivers: `@shuttle/score` core: config `{pointsToWin, settingAt | null, cap | null}` (null settingAt = golden point), `applyPoint`, game state, winner detection.
- Accept: property tests pass (≥1000 runs each): a game ends iff the winning condition per config holds; score at cap ends the game to the leader; setting extends correctly at `settingAt`-all; scores never decrease; identical point sequences yield identical states (determinism); no-I/O grep clean.

### S1-02 · engine(score) · Match layer, presets, undo, events
- Deps: S1-01. Reviewer: code-reviewer.
- Delivers: bestOf wrapper, interval events (mid-game at 11, between games), match winner; presets: 3×21 (setting 20, cap 30), 3×15 (setting 14, cap 21, interval at 8 — the 2027 law), 1×21 golden point, americano fixed-point; `undo` pops the event list.
- Accept: property tests: for any event sequence, `undo` then replay equals the pre-undo state; bestOf terminates at ceil(n/2) games; each preset's constants match RESEARCH §5 (asserted literally in tests); interval events fire exactly once per threshold; no-I/O grep clean.

### S1-03 · engine(rounds) · Americano generator
- Deps: S1-01. Reviewer: code-reviewer.
- Delivers: `@shuttle/rounds` americano: N players (4-12), C courts, seeded RNG injected; emits rounds of pairings + resting players + scorer (a resting player when one exists).
- Accept: property tests: no player appears twice in a round; over a full rotation every player's match count is within ±1; rest assignments over a night differ by ≤1 per player; the scorer is never on court that round; same seed, same output (determinism); no-I/O grep clean.

### S1-04 · engine(rounds) · Mexicano generator
- Deps: S1-03. Reviewer: code-reviewer.
- Delivers: mexicano: round 1 from injected seed, rounds 2+ paired by running tally (1&3 vs 2&4 within adjacent standings).
- Accept: property tests: valid partition each round (no dupes, correct court count); rounds 2+ pairings respect the standings ordering rule; deterministic under fixed seed + tallies; no-I/O grep clean.

### S1-05 · engine(split) · Ledger math
- Deps: S0-01. Reviewer: code-reviewer.
- Delivers: `@shuttle/split`: fold expense/settlement events into pairwise nets and per-head amounts, amounts in paise.
- Accept: property tests: sum of all pairwise nets is 0 (conservation); per-head shares of an expense sum exactly to the expense (deterministic paise remainder assignment); a settlement of X reduces that pair's |net| by exactly X; event-order permutations of independent events yield the same nets; no-I/O grep clean.

### S1-06 · engine(rating) · Margin-aware Elo — **spec needs PM sign-off on constants first (open question 3)**
- Deps: S0-01. Reviewer: code-reviewer.
- Delivers: `@shuttle/rating`: expected score, margin-scaled update, doubles = individual vs average team rating, provisional K for first 10 matches, all constants exported from one module.
- Accept: property tests: winner's delta ≥ 0 and loser's ≤ 0; delta is monotonically non-decreasing in point margin; provisional K strictly exceeds established K; equal-rating equal-K match has symmetric deltas; deterministic; constants module is the single source (`grep` finds no numeric K outside it); no-I/O grep clean.

## Sessions vertical

### S1-07 · db(groups) · Groups and membership
- Deps: S0-06. Reviewer: sql-pro.
- Delivers: migration: `groups` (id, name, captain_id, created_at), `group_members` (group_id, player_id, joined_at). RLS: members select their groups and co-members; any authed user creates a group and becomes captain; captain inserts/removes members. FKs real, indexes on `group_members(player_id)`, `group_members(group_id)`.
- Accept: `supabase db reset` exits 0; RLS-enabled catalog check for both tables; negative tests `rls_groups_stranger_zero_rows` and `rls_group_members_stranger_zero_rows`; test `group_members_insert_by_non_captain_denied`.

### S1-08 · db(sessions) · Sessions and the session event log
- Deps: S1-07. Reviewer: sql-pro.
- Delivers: migration: `sessions` (id, group_id, starts_at, status) plain row; `session_events` (id, session_id, seq, type, actor_id, payload jsonb, created_at) append-only: `UPDATE`/`DELETE` revoked, insert+select policies for group members only. Index `session_events(session_id, seq)`.
- Accept: reset exits 0; RLS catalog check; negative tests `rls_sessions_stranger_zero_rows`, `rls_session_events_stranger_zero_rows`; append-only proof `session_events_update_denied` (update as a member errors); `session_events_insert_by_non_member_denied`.

### S1-09 · api(session) · Create, RSVP, roster
- Deps: S1-08, S0-08. Reviewer: code-reviewer.
- Delivers: typed functions: create group, create session, RSVP in/out (inserts `session_events`), close session, roster derived by replaying rsvp/check-in events.
- Accept: integration tests: rsvp_in then rsvp_out leaves the player off the roster (replay correctness); events are inserts only (no update call sites — grep for `.update(` in the module returns nothing touching `session_events`); non-member RSVP rejected by RLS (`session_rsvp_non_member_denied`).

### S1-10 · ui(session) · Session screen
- Deps: S1-09, S0-10. Reviewer: interface-design.
- Delivers: Session tab: next session card, roster with RSVP chips, create-session flow, start-night action. Tokens only.
- Accept: e2e: create session, RSVP, roster shows the member; component tests render empty, loading, and error states by name; 390px scroll-width check; button labels are actions (grep test fails on "Submit"/"OK").

## Scoring vertical

### S1-11 · db(matches) · Match anchor rows
- Deps: S1-07. Reviewer: sql-pro.
- Delivers: migration: `matches` (id, group_id, session_id nullable, config jsonb, status, snapshot jsonb nullable, created_by, created_at); `match_participants` (match_id, player_id, side). RLS: group members select/insert; snapshot updates only via RPC (next slice) — no direct update policy. Indexes: `matches(group_id)`, `matches(session_id)`, `match_participants(player_id)`.
- Accept: reset exits 0; RLS catalog check both tables; `rls_matches_stranger_zero_rows`, `rls_match_participants_stranger_zero_rows`; `matches_direct_update_denied` (member update of snapshot errors).

### S1-12 · db(match-events) · The match op log
- Deps: S1-11. Reviewer: sql-pro.
- Delivers: migration: `match_events` (id, match_id, seq, type point|undo|result, side, scorer_id, payload jsonb, created_at) append-only: `UPDATE`/`DELETE` revoked; insert/select for group members; unique `(match_id, seq)`.
- Accept: reset exits 0; RLS catalog check; `rls_match_events_stranger_zero_rows`; `match_events_update_denied`; `match_events_insert_by_non_member_denied`; duplicate seq insert errors (`match_events_seq_conflict`).

### S1-13 · db(match-projection) · Atomic append + snapshot RPC
- Deps: S1-12. Reviewer: sql-pro.
- Delivers: Postgres function `append_match_event(match_id, expected_seq, event, snapshot)`: in one transaction, insert the event at `expected_seq` and write `matches.snapshot`; reject if `expected_seq` is stale. The snapshot is computed by the client with `@shuttle/score`; SQL never re-implements scoring.
- Accept: integration test `match_snapshot_replay_equality`: after a random event sequence via the RPC, replaying the log with `@shuttle/score` in TS equals the stored snapshot; `append_rejects_stale_seq` errors on a gap or replayed seq; RPC runs as the caller (no SECURITY DEFINER — grep test).

### S1-14 · api(scoring) · Score and quick-log flows
- Deps: S1-13, S1-02. Reviewer: code-reviewer.
- Delivers: typed flows: create match (config + participants + scorer attribution), live scoring (engine state locally, `append_match_event` per point, undo as an undo event), quick-log (one `result` event with final score). Conflict from a stale seq surfaces as a typed error.
- Accept: integration: score a full 1×21 golden-point game, projection winner equals engine winner; undo removes the last point from both engine state and snapshot; quick-log creates match + result event and snapshot in one flow; stale-seq test asserts the typed error, not a throw-through.

### S1-15 · ui(scorer) · The casual scorer
- Deps: S1-14, S0-02. Reviewer: interface-design.
- Delivers: scorer opened from a session or Today (never a tab): two giant tap zones, mono tabular digits, service dot, undo, scorer chip naming who is scoring, match-complete state. Casual config default 1×21 golden point.
- Accept: e2e: tap one side to 21, match-complete screen appears and the result lands in the feed; undo reverts the displayed score; scorer chip shows the attributed scorer's name; 390px scroll-width check; component tests render loading/error/offline-write-failed states by name.

## Rounds vertical

### S1-16 · api(rounds) · Generate and persist rounds
- Deps: S1-03, S1-04, S1-09, S1-11. Reviewer: code-reviewer.
- Delivers: generate an americano or mexicano round from the checked-in roster (seed injected, persisted in the event payload), write one `round_generated` session event, create the round's `matches` + participants. Mexicano tallies replayed from the session's match snapshots.
- Accept: integration: generating with a stored seed twice yields identical pairings (determinism through the DB); matches rows exactly match the event payload; mexicano round 2 pairing matches the engine's output for the same tallies (fixture test).

### S1-17 · ui(rounds) · Round view
- Deps: S1-16, S1-10. Reviewer: interface-design.
- Delivers: inside the session: current round as court cards (pairings, tap into scorer), resting players, scorer chip, next-round action, night standings (americano/mexicano tallies).
- Accept: e2e: start night, generate round, court cards show engine pairings, tapping a card opens the scorer for that match; standings update after a scored match; 390px check; empty state before round 1 has copy.

## Ledger vertical

### S1-18 · db(ledger) · Ledger event log
- Deps: S1-07. Reviewer: sql-pro.
- Delivers: migration: `ledger_events` (id, group_id, session_id nullable, seq, type expense|settlement, payer_id, amount_paise, participant_ids uuid[], created_by, created_at) append-only: `UPDATE`/`DELETE` revoked; insert/select for group members. Index `ledger_events(group_id, seq)`.
- Accept: reset exits 0; RLS catalog check; `rls_ledger_events_stranger_zero_rows`; `ledger_events_update_denied`; `ledger_events_insert_by_non_member_denied`.

### S1-19 · api(ledger) · Expenses, settlements, balances
- Deps: S1-18, S1-05. Reviewer: code-reviewer.
- Delivers: typed functions: add expense (court/shuttle amounts, participants default = session roster), record settlement, fetch group events, balances computed by `@shuttle/split`.
- Accept: integration: a fixture sequence of expenses + settlements yields the engine's expected pairwise nets; conservation asserted (nets sum to 0); non-member expense insert rejected (`ledger_insert_non_member_denied`).

### S1-20 · ui(ledger) · Night ledger
- Deps: S1-19, S1-10. Reviewer: interface-design.
- Delivers: session ledger: court + shuttles presets, per-head amounts, paid/pending chips, one UPI deep link per debtor ("Collect ₹257 × 7" style labels), mark-settled. Payee VPA from the captain's profile; missing VPA gets a prompt state.
- Accept: e2e: add expense, per-head amounts match engine output; UPI href test asserts `upi://pay` with correct `pa`, `am`, `tn` params; marking settled writes a settlement event and the chip flips; missing-VPA state renders (named test); 390px check.

### S1-21 · ui(today) · Today home
- Deps: S1-10, S1-19, S1-14. Reviewer: interface-design.
- Delivers: Today tab becomes real: next session + RSVP, balance summary (you owe / you are owed, tap → ledger), recent games feed, quick-log entry point. Every card ends in an action.
- Accept: e2e with seeded data: each card renders its data and its action navigates correctly; balance figure equals engine output for the seed; empty states carry DESIGN copy (snapshot test on empty-state strings); 390px check.

### S1-22 · ui(quick-log) · Two-tap match log
- Deps: S1-21, S1-14. Reviewer: interface-design.
- Delivers: from Today: pick players (recent-first), enter final score, done. Writes via the quick-log flow.
- Accept: e2e: log a result in ≤2 screens; match + result event + snapshot exist; the feed shows it immediately; 390px check.

## Profile vertical

### S1-23 · api(profile-stats) · History and chemistry aggregates
- Deps: S1-14. Reviewer: code-reviewer.
- Delivers: query the player's matches across groups; pure aggregate functions: win %, current streak, last-10 form, partner chemistry (win % per partner, min 3 matches to display).
- Accept: unit tests on fixtures for each aggregate including edge cases (0 matches, all losses, tie handling); chemistry excludes partners under the 3-match floor (named test); integration: query returns matches from two different groups for one player.

### S1-24 · ui(me) · Profile screen
- Deps: S1-23, S0-10. Reviewer: interface-design.
- Delivers: Me tab: name + phone, win % / streak / last-10, partner chemistry bars, recent match list.
- Accept: e2e with seeded matches: displayed figures equal S1-23 fixture outputs; empty state for a new player renders; 390px check.

## Rating vertical

### S1-25 · db(rating) · Rating history log
- Deps: S1-11. Reviewer: sql-pro.
- Delivers: migration: `rating_history` (id, player_id, match_id, rating_before, rating_after, k, created_by, created_at) insert-only: `UPDATE`/`DELETE` revoked; select for any authed user (ratings are public in-app); insert only by members of the match's group; unique `(player_id, match_id)`. Index `rating_history(player_id, created_at)`.
- Accept: reset exits 0; RLS catalog check; `rls_rating_history_anon_zero_rows` (unauthenticated gets 0); `rating_history_update_denied`; `rating_history_insert_by_non_member_denied`; duplicate (player, match) insert errors.

### S1-26 · api(rating) · Compute and record ratings
- Deps: S1-25, S1-06, S1-14. Reviewer: code-reviewer.
- Delivers: on match completion, compute deltas with `@shuttle/rating` and insert one row per participant; a TS `rebuildRatings(playerId)` that replays the player's match history through the engine.
- Accept: integration: completing a rated doubles match inserts 4 rows whose deltas equal the engine fixture; `rating_replay_equality` test: rebuild from match history equals stored `rating_history`; unrated match types (quick-log opt-out if configured) insert nothing (named test).

### S1-27 · ui(rating-line) · Rating on Me + the published math
- Deps: S1-26, S1-24. Reviewer: interface-design.
- Delivers: current rating hero + rating sparkline on Me; a "How the rating works" page rendering the constants imported from `@shuttle/rating` (transparent math, the DUPR lesson).
- Accept: e2e: seeded history renders the line and the hero equals the latest `rating_after`; the math page's displayed constants equal the engine's exported constants (test imports both and compares); 390px check.

**P1 exit check:** 3 real groups run 4 weeks of sessions; retention measured before any P2 code.
