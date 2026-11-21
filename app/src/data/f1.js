export const isF1Track = (id) => typeof id === "string" && (id.startsWith("f1_") || id.startsWith("real_"));

export const CAR_MODELS = {
  f1_2024: { label: "F1 2024 réaliste", speedColorMax: 96, sensorRange: 200 },
  v1: { label: "Modèle simplifié (v1)", speedColorMax: 60, sensorRange: 100 },
};

export function identifyF1Rows(rows, runs) {
  const conditions = new Map(runs.map(({ run_id, condition }) => [run_id, condition]));
  conditions.set("classic_ref", "classic");
  conditions.set("raceline_ref", "raceline");
  conditions.set("classic_f1_ref", "classic");
  conditions.set("raceline_f1_ref", "raceline");
  return rows.map((row) => ({ ...row, condition: conditions.get(row.run_id) }));
}

// Écart relatif, à formater en pourcentage.
export function lapTimeGap(lapTime, idealTime) {
  const lap = Number(lapTime);
  const ideal = Number(idealTime);
  if (!Number.isFinite(lap) || !Number.isFinite(ideal) || lap <= 0 || ideal <= 0) return null;
  return (lap - ideal) / ideal;
}

export function formatLapTimeGap(gap) {
  return GAP_PERCENT.format(gap);
}

const GAP_PERCENT = new Intl.NumberFormat("fr-FR", {
  style: "percent", maximumFractionDigits: 1, signDisplay: "exceptZero",
});
