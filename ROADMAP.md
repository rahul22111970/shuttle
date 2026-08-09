# SHUTTLE · pilot to product

Written 2026-08-09, the day after the first real pilot. This is the plan for
turning the pilot into a product a stranger can use without Rahul. It is
sequenced, estimated, and honest about what waits on the outside world.

**Product means:** a stranger can discover the app, join or start a group,
and run their own nights with zero involvement from us, on an installable
app, with no security debt.

**Where we start from (2026-08-09):** two-tab WhatsApp-model shell, one room
per group (Night / Games / Stats / Members), per-group Elo, bulk paste
scoring, UPI ledger, dark mode, 232 unit tests, 13 e2e suites, CI deploys.
Pilot rating 8/10. Product rating 4/10. The gap is structural, not polish.

---

## The two environments

No clone app. One codebase, two deployments. The pilot keeps producing data
and feedback while the product is built in parallel, and launch day is a
merge, not a migration.

| | Prod (the pilot) | Staging (the product bench) |
|---|---|---|
| URL | shuttle-ten-chi.vercel.app | own Vercel URL, `develop` branch |
| Database | real Supabase project | second free Supabase project |
| Data | Bad-minton + Week Day Group, real | seeded fake groups |
| Who uses it | the crews, every week | Rahul, any evening |
| What ships | only full-gate-passed merges from develop | everything, immediately |

Rule: risky work (auth, codes, realtime, push) bakes on staging first. The
e2e battery and db tests move to the staging project, which also ends the
"tests run against prod" debt. Features graduate by merging develop → main.

---

## Phases

### Phase A — stop the bleeding (2 nights) · first
1. **Staging environment.** Second Supabase project, migrations 0001-0012
   applied, seed script, `develop` branch, CI split (develop → staging,
   main → prod). Tests repointed at staging.
2. **Key rotation.** The leaked service key finally rotates. BLOCKED ON
   RAHUL saying "rotate the key" — standing rule, never unprompted.
3. **Per-group codes.** `groups.code` column, shown to the captain on
   Members, sign-in checks the number belongs to a member of a group with
   that code. `smash21` dies. Copy already says "group code"; it becomes true.

### Phase B — real auth (3 nights build + 1-2 weeks calendar, parallel)
4. **File DLT/SMS paperwork on day one** (MSG91 or similar). The approval
   wait is the whole critical path; everything else runs during it.
5. **OTP sign-in.** Number + code stays as the door, OTP verifies possession
   the first time a number signs in on a new device.
6. **Custom SMTP** (Resend). Kills the 2-emails-per-hour cap. Half a night.

### Phase C — self-serve growth (2 nights)
7. **Join by link / QR.** Captain shares an invite link; a new player opens
   it, enters name + number, lands in the group. Replaces captain-typed
   numbers as the main door. Highest-leverage product feature on this list.
8. **Onboarding polish.** Empty states teach, a native what/why page.

### Phase D — liveness (3 nights)
9. **Supabase Realtime** replaces the 8-second poll for live scores,
   check-ins and the Tonight table.
10. **Web push.** Night planned, you're in, results. Android PWA + iOS 16.4+.

### Phase E — installability (1 night now, stores later)
11. **PWA install** (manifest + service worker + prompt). One night, everyone
    gets a home-screen icon immediately.
12. **App stores.** EAS builds, TestFlight, Play closed testing. 2-3 build
    nights; the calendar is Apple review (days) and Google's forced 14-day
    12-tester closed test for new accounts (weeks). PWA ships first so the
    stores are never the bottleneck.

### Phase F — ops (2 nights)
13. Sentry (crashes), PostHog (usage), DB backup policy, hardening sweep.

---

## The estimate

Build speed is not the constraint (the IA redesign was one session, net
-691 lines). The constraints are review bandwidth per night, external
approvals, and the retention gate.

| Milestone | Build nights | Wall clock |
|---|---|---|
| Phase A complete, smash21 dead | 2 | this week |
| Self-serve joining + PWA + realtime + push | ~8 | 2-3 weeks |
| Verified OTP auth | 3 | gated on DLT, ~2 weeks, parallel |
| App-store presence | 3 | +3-4 weeks, mostly waiting |

**Product-grade web app: ~3-4 weeks. App-store presence: 6-8 weeks.**

---

## Gates and decisions that are Rahul's

- **"Rotate the key"** — say it and Phase A step 2 happens the same night.
- **P1 exit gate stands:** 3 real groups × 4 weeks retention before any P2
  *feature* code (tournaments, organiser console). Product hardening above
  is not P2 and runs in parallel with the gate.
- **DLT provider choice and payment** (MSG91 ≈ ₹0.15-0.25/SMS).
- **Apple/Google developer accounts** (₹8.3K/yr + $25 one-time) when Phase E
  stores begin.

## Explicitly not in this plan

Tournaments, organiser console, offline mode, monetisation. All P2+, all
blocked behind the retention gate. The op-log architecture keeps offline
possible; nothing here forecloses it.
