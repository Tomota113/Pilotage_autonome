import { useEffect, useMemo, useState } from "react";
import { listReplays } from "../data/api.js";
import { CAR_MODELS } from "../data/f1.js";

export function useCarReplays() {
  const [all, setAll] = useState(null);
  const [preference, setCar] = useState(null);
  useEffect(() => {
    let active = true;
    listReplays().then((rows) => { if (active) setAll(rows); })
      .catch(() => { if (active) setAll([]); });
    return () => { active = false; };
  }, []);

  const car = preference ?? (all?.some((r) => r.car === "f1_2024") ? "f1_2024" : "v1");
  const replays = useMemo(() => all?.filter((r) => (r.car ?? "v1") === car) ?? null, [all, car]);
  return { car, setCar, replays };
}

export default function CarSelector({ car, setCar, loading }) {
  return <label className="field">Voiture
    <select value={car} onChange={(event) => setCar(event.target.value)} disabled={loading}>
      {Object.entries(CAR_MODELS).map(([id, { label }]) => <option key={id} value={id}>{label}</option>)}
    </select>
  </label>;
}
