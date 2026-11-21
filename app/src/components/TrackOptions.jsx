import { useEffect, useState } from "react";
import { listTracks } from "../data/api.js";
import { isF1Track } from "../data/f1.js";

export default function TrackOptions({ ids }) {
  const [catalog, setCatalog] = useState([]);
  useEffect(() => { listTracks().then(setCatalog).catch(() => {}); }, []);

  const names = new Map(catalog.map(({ id, name }) => [id, name]));
  const groups = [
    ["Circuits de F1", ids.filter(isF1Track)],
    ["Circuits générés (test)", ids.filter((id) => !isF1Track(id))],
  ];
  return groups.map(([label, tracks]) => tracks.length > 0 && (
    <optgroup key={label} label={label}>
      {tracks.map((id) => <option key={id} value={id}>{names.get(id) ?? id}</option>)}
    </optgroup>
  ));
}
