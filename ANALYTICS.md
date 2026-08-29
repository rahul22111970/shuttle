# The analytics surface

Researched 2026-08-29 (competitive teardown: DUPR, Playtomic, UTR, chess.com
Insights, Lichess, Strava, Whoop, Kicker + code inventory). This file is the
spec; BACKLOG.md carries the slices.

## Where it lives

No new tab. The group room's **Stats** section grows into the group analytics
surface, and the **player room** (`/player/:id`) grows into the personal one.
That is where people already look, and the section contract (`groupId, selfId,
nonce`) is already wired.

## What ships, and why

Ranked by what club players actually revisit (evidence in the research):

**Group Stats section**
1. Leaderboard with weekly movement — chevron + delta vs 7 days ago beside
   each rating. The most-argued number gets a direction.
2. Activity heatmap — weeks x 7 grid of games per day. Social pressure,
   fits 390px natively.
3. Insight sentences — 2-3 auto-surfaced lines with minimum-sample gates
   (best duo, nemesis pairing, clutch record, streak). Sentences first,
   charts behind them: the chess.com lesson is that chart walls go unread.
4. Records — longest streak ever, biggest win, biggest comeback (live-scored
   matches only), best duo. Extends the existing superlatives.

**Player room**
1. Rating line — THE chart. Full-width line of the player's chain in this
   group, decay rows drawn as hollow markers so a drop is always labelled
   (Playtomic's top complaint is silent rating drops; our decay must never
   read as one).
2. Head-to-head — per-opponent W-L rows with a split bar. In a 12-person
   group this beats every aggregate.
3. Clutch tile — win % in games that reached deuce, from per-game scores.
4. Form and chemistry stay as they are.

## What is deliberately out (with the reason)

- Composite fitness-style scores — pseudo-science smell (Strava F&F).
- Shot-type stats — need manual tagging; logging dies in week one.
- Global percentiles, time-of-day charts — empty at two nights a week.
- Serve-effect stat — first server is not ground truth in logged data; parked.
- Session recap card ("Wrapped" style, night MVP, upset of the night) —
  HIGH value, deferred as its own slice; it is a retention feature, not a
  chart. Forecast/win-probability rides with it.

## Data honesty rules

- Rally-level stats (comebacks, runs) exist only for LIVE-scored matches;
  quick/bulk-logged games have final scores only. Every rally stat carries a
  minimum-n gate and says "live-scored games" in its caption.
- `snapshot.points` is the rally WINNER sequence, not point scorers; running
  scores come from replaying `@shuttle/score`, never from counting naively.
- Deuce detection uses per-game scores + config (both sides reached
  settingAt), so it covers logged games too.
- Group history fetches cap at 300 matches with a visible "capped" note,
  the games-section idiom. No silent 1000-row truncation.

## Chart grammar (dataviz method, adapted to RN)

- Emphasis over categorical: one series in `court`, context in washes/grays.
  Never more than 2 lines on a phone.
- Losses are neutral (`inkWash2`), never orange — `cork` stays reserved for
  time pressure. No new colour tokens unless both palettes + the token test
  gain them together.
- Bars <= 24px thick, 2px line, hairline solid grid, values labelled
  selectively (endpoint + extremes), tabular-nums only in aligned columns.
- Every chart has a table twin (the list under it carries the exact values);
  tap targets >= 24px; no tooltip-gated values.
- react-native-svg is added for the line chart ONLY; bars, heatmaps, dots
  and tracks stay plain Views (the me-view Spark precedent).
