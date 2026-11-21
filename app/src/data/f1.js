export const isF1Track = (id) => typeof id === "string" && id.startsWith("f1_");

export function identifyF1Rows(rows, runs) {
  const conditions = new Map(runs.map(({ run_id, condition }) => [run_id, condition]));
  conditions.set("classic_ref", "classic");
  conditions.set("raceline_ref", "raceline");
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
