// The Me controller: fetch every match the player took part in across
// groups, resolve names in one profiles query, aggregate with lib/stats.
import { useCallback, useRef, useState } from "react";
import { router } from "expo-router";
import { useFocusEffect } from "expo-router";
import MeView, {
  type AdminGroupRow,
  type ChemistryRow,
  type GroupRating,
  type MeFeedRow,
  type RatingLine,
} from "../../components/me-view";
import { INITIAL_RATING, PROVISIONAL_MATCHES } from "@shuttle/rating";
import * as ImagePicker from "expo-image-picker";
import PlayerAnalytics from "../../components/player-analytics";
import { PhotoTooBigError, PhotoTypeError, saveAvatar, uploadAvatarPhoto } from "../../lib/avatar";
import { useAuth } from "../../lib/auth";
import { listGroups } from "../../lib/session";
import { getThemeChoice, setThemeChoice, type ThemeChoice } from "../../lib/theme";
import {
  chemistry,
  currentStreak,
  fetchPlayedMatches,
  lastTen,
  winPct,
  type Form,
  type PlayedMatch,
} from "../../lib/stats";
import { supabase } from "../../lib/supabase";

function feedRow(m: PlayedMatch, name: (id: string) => string, selfName: string): MeFeedRow {
  const us = [selfName, ...m.partnerIds.map(name)].join(" & ");
  const them =
    m.opponentIds.length > 0
      ? m.opponentIds.map(name).join(" & ")
      : `Side ${m.side === "a" ? "B" : "A"}`;
  const won = m.winner === m.side;
  const ours = m.games.map((g) => (m.side === "a" ? `${g.a}–${g.b}` : `${g.b}–${g.a}`));
  return {
    id: m.id,
    line: m.winner === null ? `${us} · ${them}` : won ? `${us} d. ${them}` : `${them} d. ${us}`,
    // winner-first scores, so flip ours when they beat us
    score: (won || m.winner === null
      ? ours
      : m.games.map((g) => (m.side === "a" ? `${g.b}–${g.a}` : `${g.a}–${g.b}`))
    ).join(" · "),
    when: new Date(m.createdAt).toLocaleString(undefined, {
      day: "numeric",
      month: "short",
      hour: "numeric",
      minute: "2-digit",
    }),
    self: m.winner === null ? null : won ? "w" : "l",
  };
}

export default function Me() {
  const { profile, session, setProfile } = useAuth();
  const selfId = session?.user.id ?? "";
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "error" }
    | {
        kind: "ready";
        winPct: number | null;
        streak: number;
        lastTen: Form[];
        chemistry: ChemistryRow[];
        recent: MeFeedRow[];
        rating: RatingLine;
        captainGroups: { id: string; name: string }[];
        adminGroups: AdminGroupRow[] | null;
      }
  >({ kind: "loading" });
  const [themeChoice, setTheme] = useState<ThemeChoice>(getThemeChoice);
  const loadSeq = useRef(0);
  const [wipe, setWipe] = useState<"idle" | "wiping" | "done" | "error">("idle");

  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    const paint = (next: Parameters<typeof setState>[0]) => {
      if (seq === loadSeq.current) setState(next);
    };
    try {
      // Me is GLOBAL: every group's ladder plus cross-group form. The room
      // is where a single group's world lives.
      const groups = await listGroups();
      const [played, ratingRes] = await Promise.all([
        fetchPlayedMatches(selfId),
        groups.length > 0
          ? supabase
              .from("rating_history")
              .select("group_id, rating_after, created_at, match_id")
              .eq("player_id", selfId)
              .in("group_id", groups.map((g) => g.id))
              .order("created_at", { ascending: true })
              .order("id", { ascending: true })
          : Promise.resolve({
              data: [] as {
                group_id: string;
                rating_after: number;
                created_at: string;
                match_id: string | null;
              }[],
              error: null,
            }),
      ]);
      if (ratingRes.error) throw ratingRes.error;
      // decay rows move the number but only match rows count as played
      const perGroup = new Map<string, { series: number[]; played: number }>();
      for (const r of ratingRes.data) {
        const entry = perGroup.get(r.group_id) ?? { series: [], played: 0 };
        entry.series.push(r.rating_after);
        if (r.match_id !== null) entry.played += 1;
        perGroup.set(r.group_id, entry);
      }
      const playedIn = (groupId: string) => perGroup.get(groupId)?.played ?? 0;
      const groupRatings: GroupRating[] = groups
        .filter((g) => perGroup.has(g.id))
        .map((g) => {
          const { series, played } = perGroup.get(g.id)!;
          return {
            groupId: g.id,
            name: g.name,
            current: series[series.length - 1],
            provisional: played < PROVISIONAL_MATCHES,
            series,
          };
        });
      // blended: games-weighted mean of each ladder's current number
      const totalGames = groupRatings.reduce((n, g) => n + playedIn(g.groupId), 0);
      const blended =
        totalGames === 0
          ? INITIAL_RATING
          : Math.round(
              groupRatings.reduce((s, g) => s + g.current * playedIn(g.groupId), 0) /
                totalGames
            );
      const captainGroups = groups
        .filter((g) => g.captain_id === selfId)
        .map((g) => ({ id: g.id, name: g.name }));
      const ids = [
        ...new Set(played.flatMap((m) => [...m.partnerIds, ...m.opponentIds])),
      ];
      let names = new Map<string, string>();
      if (ids.length > 0) {
        const res = await supabase.from("profiles").select("id, display_name").in("id", ids);
        if (res.error) throw res.error;
        names = new Map(res.data.map((r) => [r.id, r.display_name]));
      }
      const name = (id: string) => names.get(id) ?? "Player";
      // pilot-only oversight: the server says 403 to everyone but the
      // admin account, and the card simply never renders for them
      let adminGroups: AdminGroupRow[] | null = null;
      try {
        const token = (await supabase.auth.getSession()).data.session?.access_token;
        const r = await fetch("/api/admin-overview", {
          headers: { authorization: `Bearer ${token}` },
        });
        if (r.ok) adminGroups = (await r.json()).groups;
      } catch {
        adminGroups = null;
      }
      paint({
        kind: "ready",
        rating: { blended, groups: groupRatings },
        winPct: winPct(played),
        streak: currentStreak(played),
        lastTen: lastTen(played),
        chemistry: chemistry(played).map((c) => ({
          partnerId: c.partnerId,
          name: name(c.partnerId),
          played: c.played,
          winPct: c.winPct,
        })),
        recent: played
          .slice(0, 5)
          .map((m) => feedRow(m, name, profile?.display_name ?? "You")),
        captainGroups,
        adminGroups,
      });
    } catch {
      paint({ kind: "error" });
    }
  }, [selfId, profile?.display_name]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  // pilot-only: POST the captain's wipe to the server function, then reload
  const wipeGroup = useCallback(
    async (groupId: string) => {
      setWipe("wiping");
      try {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (!token) throw new Error("no session");
        const res = await fetch("/api/captain-reset", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ groupId }),
        });
        if (!res.ok) throw new Error(`wipe failed: ${res.status}`);
        setWipe("done");
        load();
      } catch {
        setWipe("error");
      }
    },
    [load]
  );

  if (!profile) return null; // the layout guard has already redirected
  const heading = profile.display_name;
  const detail = `Player · ${profile.phone ?? "no phone"}`;

  const pickPreset = async (key: string) => {
    setAvatarBusy(true);
    setAvatarError(null);
    try {
      setProfile(await saveAvatar(selfId, `preset:${key}`));
    } catch {
      setAvatarError("That did not save. Check your network and try again.");
    } finally {
      setAvatarBusy(false);
    }
  };

  const uploadPhoto = async () => {
    setAvatarError(null);
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (res.canceled || !res.assets?.[0]) return;
    setAvatarBusy(true);
    try {
      setProfile(await uploadAvatarPhoto(selfId, res.assets[0].uri));
    } catch (e) {
      setAvatarError(
        e instanceof PhotoTooBigError
          ? "That photo is over 5 MB. Pick a smaller one."
          : e instanceof PhotoTypeError
            ? "Use a JPG, PNG or WebP photo."
            : "That did not save. Check your network and try again."
      );
    } finally {
      setAvatarBusy(false);
    }
  };

  if (state.kind === "loading") return <MeView kind="loading" name={heading} />;
  if (state.kind === "error") return <MeView kind="error" name={heading} onRetry={load} />;

  return (
    <MeView
      kind="ready"
      name={heading}
      detail={detail}
      avatar={profile.avatar ?? null}
      avatarBusy={avatarBusy}
      avatarError={avatarError}
      onPickPreset={pickPreset}
      onUploadPhoto={uploadPhoto}
      analytics={<PlayerAnalytics playerId={selfId} self />}
      rating={state.rating}
      winPct={state.winPct}
      streak={state.streak}
      lastTen={state.lastTen}
      chemistry={state.chemistry}
      recent={state.recent}
      themeChoice={themeChoice}
      onTheme={(c) => {
        setThemeChoice(c);
        setTheme(c);
      }}
      onSignOut={() => supabase.auth.signOut()}
      onOpenMath={() => router.push("/rating-math")}
      captainGroups={state.captainGroups}
      adminGroups={state.adminGroups}
      wiping={wipe === "wiping"}
      wipeDone={wipe === "done"}
      wipeError={wipe === "error"}
      onWipe={wipeGroup}
    />
  );
}
