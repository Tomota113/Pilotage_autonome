import { useEffect, useMemo, useState } from "react";
import { loadReplay } from "../../data/api.js";
import { progressTimeline } from "../../data/interpolate.js";

export function useRaceReference(replays, replay, condition) {
  const references = useMemo(() => {
    if (!replay) return [];
    return (replays ?? []).filter((entry) => ["classic", "raceline"].includes(entry.condition)
      && entry.track_id === replay.track_id && Number(entry.mu_factor) === Number(replay.mu_factor));
  }, [replay, replays]);
  const entry = references.find((reference) => reference.condition === condition);
  const path = entry?.path;
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (!path) return undefined;
    let active = true;
    loadReplay(path).then((source) => {
      if (active) setResult({ path, source, timeline: progressTimeline(source.frames) });
    }).catch(() => {
      if (active) setResult({ path, error: true });
    });
    return () => { active = false; };
  }, [path]);

  const current = path && result?.path === path ? result : null;
  return { references, ...current, loading: Boolean(path && !current) };
}

const DISCRETE = new Set(["qlearning", "sarsa", "montecarlo", "dqn", "qrdqn", "deep_sarsa", "deep_mc"]);

export function useActionMode(replay) {
  const runId = replay?.run_id;
  const algo = replay?.agent?.algo;
  const known = algo === "classic" ? "continuous" : DISCRETE.has(algo) ? "discrete9" : null;
  const [config, setConfig] = useState(null);

  useEffect(() => {
    if (known || !runId) return undefined;
    let active = true;
    // Le replay stocke les commandes décodées. Le mode d'origine est déclaré dans le bloc env du run.
    fetch(`/files/runs/${encodeURIComponent(runId)}/config.yaml`)
      .then((response) => response.ok ? response.text() : "")
      .then((yaml) => {
        const env = yaml.match(/^env:[^\n]*\n((?:[ \t]+[^\n]*\n?|[ \t]*\n)*)/m)?.[1] ?? "";
        const mode = env.match(/^[ \t]+action_space:[ \t]*["']?(pedal|continuous|discrete9)\b/m)?.[1];
        if (active) setConfig({ runId, mode });
      }).catch(() => {
        if (active) setConfig({ runId, mode: null });
      });
    return () => { active = false; };
  }, [known, runId]);

  const mode = known ?? (config?.runId === runId ? config?.mode : null);
  const loading = Boolean(!known && runId && config?.runId !== runId);
  return { mode, loading, unavailable: Boolean(runId && !mode && !loading) };
}
