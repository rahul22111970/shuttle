# SHUTTLE · Build charter

How the app gets built. Product decisions live in PRODUCT.md; this file is the process, and it is binding on every session that touches app code.

## Roles

| Role | Model | Owns |
|---|---|---|
| **PM** | Fable 5, high | The backlog. Writes each slice's spec and acceptance criteria before code exists, and refuses scope that is not in the current phase. One slice = one commit = one reviewable thing. |
| **Builder** | Fable 5, medium | Writes the code. Runs with ponytail active, always. |
| **Reviewer** | varies by commit type, see matrix | Blocks the commit or signs it. Never the same session that wrote the code. |
| **Research** | Sonnet 5, parallel | Differentiation and competitor watch. Feeds the PM, never the builder directly. |

Fable builds this project at Rahul's explicit direction (2026-08-06), against the usual routing where Opus owns volume. The reason to keep it: correctness in the scoring and rating engines is worth more than throughput, and a wrong draw at a real event is the stated reputational risk in PRODUCT.md.

## The reviewer matrix

Different eyes per commit type. A reviewer reads the diff and the spec, and nothing else.

| Commit type | Reviewer | What it must prove |
|---|---|---|
| `db` migration / schema | `sql-pro` | RLS enabled on every new table. Foreign keys real. Indexes on every column the app filters by. No destructive change without a down path. |
| `auth` / RLS policy | `security-reflexes` | The policy is proven by a test that fails as the wrong user, not asserted in prose. `service_role` appears in no client path. |
| `engine` pure TS (score, rating, split, draw) | `code-reviewer` | Deterministic. Property tests present and meaningful. No I/O, no clock, no randomness that is not injected. |
| `ui` screen or component | `interface-design` | Tokens only. Every state drawn: empty, loading, error, offline. Correct at 390px. |
| `api` data access / sync | `code-reviewer` | Error and loading states exist. No N+1. Optimistic updates reconcile. |
| `infra` CI, deploy, config | `security-reflexes` | No secret in the diff. Gates actually run in CI, not just locally. |

Every commit also passes `ponytail-review`, which hunts only over-engineering.

## Commit contract

One slice, one commit. The message is the record, so it carries the why and the review, not just the what.

```
type(scope): what changed, in one line

Why: the reason this exists, one or two sentences.
Review: <reviewer> — verdict, and what changed because of it. "clean" if nothing.
```

`type` is one of `db auth engine ui api infra test docs`. Scope is the feature, not the folder.

Rules that make the history readable a year from now:
- No commit mixes two types. A migration and the screen that uses it are two commits.
- No "wip", no "fixes", no "address review comments". Amend or rewrite before pushing.
- A commit that only passes because tests were weakened is a revert, not a fix.

## Definition of done, per slice

A slice is done when all of these pass, and not when the code looks finished:

1. `typecheck` clean.
2. Tests pass. Engine slices need property tests, not just examples.
3. RLS proven by a negative test: the wrong user gets zero rows.
4. No secret in the diff.
5. Commit message matches the contract above.
6. `ponytail-review` finds nothing.
7. The named reviewer for this commit type has signed it.
8. Deployed preview reachable and the feature works there, not only locally.

Point 8 is not ceremony. Two of W01's real bugs on other projects were invisible locally and only production showed them.

## Minimal-code enforcement

`ponytail` (installed 2026-08-06, plugin `ponytail@ponytail`, level `full`) is active for every coding session: YAGNI first, reuse before write, stdlib before dependency, shortest working diff. Its `ponytail:` comment convention marks a deliberate shortcut with its ceiling and upgrade path, and `ponytail-debt` harvests those into a ledger.

Honest note on what it is worth: independent measurement (JetBrains, 80 tasks) found about 15% less code and 10% lower cost, not the 54% the README claims. The reason to run it anyway is that it fires unconditionally through a hook. A passive skill about minimalism does not self-trigger, because the model never feels like it is over-building.

Two things it does not cover, so they are rules here:

- **Touch only what the request requires.** No improving adjacent code, comments, or formatting. No refactoring what is not broken. Match existing style even where you would do it differently.
- **Unrelated dead code gets mentioned, not deleted.** Delete only what your own change orphaned. Every changed line must trace to the request.

`simplification-cascades` pushes the opposite way, toward extracting abstractions. It is for when complexity has already spiralled. Do not invoke it during a build slice.

## Phase gates

No phase starts before the previous one has real users on it.

| Phase | Ships | Gate to the next |
|---|---|---|
| P0 scaffold | Expo Router universal app, Supabase auth, both account types, deployed to Vercel | Rahul signs in on his phone through the web build |
| P1 daily loop | Sessions, scoring, ledger, profile, rating v1 | 3 real groups, 4 weeks, retention measured |
| P2 friendly tournaments **+ the queue card** | Player-run mini events: round robin, americano, small knockout. Plus "you're 2 matches out, court 3, about 25 min" | 5 mini events run by someone who is not Rahul, and the queue card is the thing players mention unprompted |
| P3 organiser console | Categories, entries, BWF draws, Call Board, scheduling, offline | 2 paying organisers |
| P4 iOS | EAS build, TestFlight, App Store | - |

The P1 and P3 gates are the ones already written into PRODUCT.md's verdict. They are not negotiable by enthusiasm.

**Why the queue card moves into P2** (decided 2026-08-06). Research ranked the matchday console as the deepest wedge and the queue card as a feature no tournament product in any sport has shipped. But the console needs a stranger's real Saturday event, and PRODUCT.md's own risk line says one wrong draw kills word of mouth. So the unclaimed feature gets proven at twelve players in a friendly mini event, where being wrong costs nothing, before it is trusted with two hundred entries. Build order follows testability, not prize size.
