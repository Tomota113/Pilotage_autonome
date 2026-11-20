// Lecture des CSV du contrat (progress.csv, eval.csv) : aucune virgule dans les valeurs.

export function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length === 0 || lines[0] === "") return [];
  const header = lines[0].split(",");
  return lines.slice(1).map((line) => {
    const cells = line.split(",");
    const row = {};
    header.forEach((key, i) => {
      const raw = cells[i] ?? "";
      const num = Number(raw);
      row[key] = raw !== "" && Number.isFinite(num) ? num : raw;
    });
    return row;
  });
}
