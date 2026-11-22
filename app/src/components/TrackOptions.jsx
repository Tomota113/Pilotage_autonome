import { useEffect, useState } from "react";
import { listTracks } from "../data/api.js";
import { isF1Track } from "../data/f1.js";

export default function TrackOptions({ ids }) {
  const [catalog, setCatalog] = useState([]);
  useEffect(() => { listTracks().then(setCatalog).catch(() => {}); }, []);

  const names = new Map(catalog.map(({ id, name }) => [id, name]));
  // Groupes : test F1 (jamais vus), circuits d'entraînement réels, générés, et circuits dessinés
  const custom = (id) => id.startsWith("custom_");
  const genF1 = (id) => id.startsWith("gen_f1_");
  const groups = [
    ["Circuits F1 (test, jamais vus)", ids.filter((id) => id.startsWith("f1_"))],
    ["Circuits réels (entraînement série v2)", ids.filter((id) => id.startsWith("real_"))],
    ["Circuits générés à l'échelle F1", ids.filter(genF1)],
    ["Mes circuits (Track Designer)", ids.filter(custom)],
    ["Circuits générés (série v1)", ids.filter((id) => !isF1Track(id) && !genF1(id) && !custom(id))],
  ];
  return groups.map(([label, tracks]) => tracks.length > 0 && (
    <optgroup key={label} label={label}>
      {tracks.map((id) => <option key={id} value={id}>{names.get(id) ?? id}</option>)}
    </optgroup>
  ));
}
