import { useEffect, useMemo, useRef, useState } from "react";
import TrackCanvas from "../components/TrackCanvas.jsx";
import { listTracks, loadTrack } from "../data/api.js";
import { createOvalTrack, resampleTrack, TRACK_SPLITS, updateTrackGeometry, validateTrack } from "../data/trackValidation.js";

const FORMAT = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });

function closestPoint(points, [x, y], radius) {
  let index = -1;
  points.forEach(([px, py], i) => {
    const distance = Math.hypot(x - px, y - py);
    if (distance < radius) {
      radius = distance;
      index = i;
    }
  });
  return index;
}

function closestSegment(points, [x, y], radius) {
  let closest = null;
  points.forEach(([ax, ay], i) => {
    const [bx, by] = points[(i + 1) % points.length];
    const dx = bx - ax, dy = by - ay;
    const fraction = ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy);
    if (!(fraction > 0 && fraction < 1)) return;
    const point = [ax + fraction * dx, ay + fraction * dy];
    const distance = Math.hypot(x - point[0], y - point[1]);
    if (distance < radius) {
      radius = distance;
      closest = { index: i, fraction, point };
    }
  });
  return closest;
}

function normalizeStart(track) {
  const { index } = track.start;
  if (index === 0) return track;
  const rotate = (values) => [...values.slice(index), ...values.slice(0, index)];
  return updateTrackGeometry({
    ...track, centerline: rotate(track.centerline), width: rotate(track.width), mu: rotate(track.mu),
  }, true);
}

export default function TrackDesigner() {
  const [tracks, setTracks] = useState([]);
  const [source, setSource] = useState("");
  const [track, setTrack] = useState(createOvalTrack);
  const [sourceError, setSourceError] = useState("");
  const [resampleError, setResampleError] = useState("");
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(null);
  const [range, setRange] = useState(["0", "0"]);
  const [width, setWidth] = useState("");
  const [mu, setMu] = useState("");
  const [fixedView, setFixedView] = useState(null);
  const drag = useRef(null);

  useEffect(() => {
    let active = true;
    listTracks().then((items) => { if (active) setTracks(items); })
      .catch(() => { if (active) setSourceError("La liste des circuits est indisponible."); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    if (source) {
      setLoading(true);
      loadTrack(source).then((loaded) => {
        if (!active) return;
        const problems = validateTrack(loaded);
        if (problems.length) {
          setSourceError(`Circuit source invalide. ${problems.join(" ")}`);
          return;
        }
        setTrack(normalizeStart(loaded));
      }).catch(() => { if (active) setSourceError("Impossible de charger le circuit sélectionné."); })
        .finally(() => { if (active) setLoading(false); });
    } else {
      setTrack(createOvalTrack());
      setLoading(false);
    }
    return () => { active = false; };
  }, [source]);

  const errors = useMemo(() => validateTrack(track), [track]);
  const count = track.centerline.length;
  const [from, to] = range.map(Number);
  const validRange = range.every((value) => value !== "") && Number.isInteger(from) && Number.isInteger(to)
    && from >= 0 && from <= to && to < count;
  const validWidth = width === "" || (Number.isFinite(Number(width)) && Number(width) > 0);
  const validMu = mu === "" || (Number(mu) >= 0.3 && Number(mu) <= 1.5);

  function selectPoint(index, data = track) {
    setSelected(index);
    setRange([String(index), String(index)]);
    setWidth(String(data.width[index]));
    setMu(String(data.mu[index]));
  }

  function resetSelection() {
    drag.current = null;
    setFixedView(null);
    setSelected(null);
    setRange(["0", "0"]);
    setWidth("");
    setMu("");
  }

  function removePoint(index) {
    if (loading || index == null || count <= 3) return;
    const remove = (values) => values.filter((_, i) => i !== index);
    const updated = updateTrackGeometry({
      ...track, centerline: remove(track.centerline), width: remove(track.width), mu: remove(track.mu),
    }, true);
    setTrack(updated);
    setResampleError("");
    selectPoint(index % updated.centerline.length, updated);
  }

  function onPointer(type, point, event, view) {
    if (type === "context") event.preventDefault();
    if (loading) return;
    if (type === "move" && drag.current?.pointerId === event.pointerId) {
      const { index, origin, pointer } = drag.current;
      const target = [origin[0] + point[0] - pointer[0], origin[1] + point[1] - pointer[1]];
      setResampleError("");
      setTrack((current) => {
        const centerline = current.centerline.slice();
        centerline[index] = target;
        return updateTrackGeometry({ ...current, centerline });
      });
    }
    if ((type === "up" || type === "cancel") && drag.current?.pointerId === event.pointerId) {
      drag.current = null;
      setFixedView(null);
    }
    if (type === "context" || (type === "down" && event.button === 0)) {
      const index = closestPoint(track.centerline, point, 9 / view.scale);
      if (index === -1) return;
      if (type === "context") {
        removePoint(index);
      } else {
        selectPoint(index);
        drag.current = { index, pointerId: event.pointerId, origin: track.centerline[index], pointer: point };
        setFixedView(view);
        event.currentTarget.focus({ preventScroll: true });
        event.currentTarget.setPointerCapture(event.pointerId);
      }
    }
    if (type === "double") {
      const segment = closestSegment(track.centerline, point, 9 / view.scale);
      if (!segment || closestPoint(track.centerline, segment.point, 1 / view.scale) !== -1) return;
      const { index, fraction } = segment;
      const insert = (values, value) => values.toSpliced(index + 1, 0, value);
      const between = (values) => values[index] + fraction * (values[(index + 1) % count] - values[index]);
      const updated = updateTrackGeometry({
        ...track,
        centerline: insert(track.centerline, segment.point),
        width: insert(track.width, between(track.width)),
        mu: insert(track.mu, between(track.mu)),
      }, true);
      setTrack(updated);
      setResampleError("");
      selectPoint(index + 1, updated);
    }
  }

  function draw(ctx, view) {
    ctx.save();
    ctx.strokeStyle = "#8c8b84";
    ctx.beginPath();
    track.centerline.forEach((point, index) => {
      if (index === 0) ctx.moveTo(...view.toScreen(point));
      else ctx.lineTo(...view.toScreen(point));
    });
    ctx.closePath();
    ctx.stroke();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#3987e5";
    ctx.beginPath();
    if (validRange) {
      for (let i = from; i <= to; i++) {
        const [x, y] = view.toScreen(track.centerline[i]);
        if (i === from) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
    }
    ctx.stroke();
    track.centerline.forEach((point, index) => {
      ctx.fillStyle = index === selected ? "#fab219" : validRange && index >= from && index <= to ? "#3987e5" : "#c3c2b7";
      ctx.beginPath();
      ctx.arc(...view.toScreen(point), index === selected ? 5 : 2.5, 0, 2 * Math.PI);
      ctx.fill();
    });
    ctx.restore();
  }

  function applyPortion(event) {
    event.preventDefault();
    const update = (values, field) => field === "" ? values
      : values.map((value, index) => index >= from && index <= to ? Number(field) : value);
    setTrack({ ...track, width: update(track.width, width), mu: update(track.mu, mu) });
  }

  function resample() {
    try {
      setTrack(resampleTrack(track));
      setResampleError("");
      resetSelection();
    } catch (error) {
      setResampleError(error.message);
    }
  }

  function exportTrack() {
    if (errors.length) return;
    const url = URL.createObjectURL(new Blob([`${JSON.stringify(track, null, 2)}\n`], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "track.json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <>
      <h2>Éditeur de circuit</h2>
      <p className="subtitle">Glissez un point pour le déplacer, double-cliquez sur un segment pour l’ajouter et faites un clic droit sur un point pour le supprimer.</p>
      <div className="controls">
        <label className="module-field">Circuit source
          <select value={source} onChange={(event) => {
            setSourceError("");
            setResampleError("");
            resetSelection();
            setSource(event.target.value);
          }}>
            <option value="">Ovale par défaut</option>
            {tracks.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.split})</option>)}
          </select>
        </label>
        {loading && <span role="status">Chargement du circuit…</span>}
        {sourceError && <span className="warn" role="alert">{sourceError}</span>}
      </div>
      <div className="row">
        <div className="panel grow" onKeyDown={(event) => {
          if (event.key === "Delete") {
            event.preventDefault();
            removePoint(selected);
          }
        }}>
          <TrackCanvas track={track} onPointer={onPointer} draw={draw} fixedView={fixedView}
                       label="Ligne centrale du circuit. Suppr efface le point sélectionné." />
          <div className="controls">
            <span className="note">{count} points · {FORMAT.format(track.length)} m</span>
            <button type="button" disabled={loading || selected == null || count <= 3}
                    onClick={() => removePoint(selected)}>Supprimer le point{selected == null ? "" : ` ${selected}`}</button>
            <button type="button" disabled={loading} onClick={resample}>Rééchantillonner ≈ 5 m</button>
          </div>
          {resampleError && <p className="warn" role="status">{resampleError}</p>}
        </div>
        <div className="panel module-aside">
          <div className="module-fields">
            <label className="module-field">Identifiant
              <input value={track.id} onChange={(event) => setTrack({ ...track, id: event.target.value })} />
            </label>
            <label className="module-field">Nom
              <input value={track.name} onChange={(event) => setTrack({ ...track, name: event.target.value })} />
            </label>
            <label className="module-field">Split
              <select value={track.split} onChange={(event) => setTrack({ ...track, split: event.target.value })}>
                {TRACK_SPLITS.map((split) => <option key={split}>{split}</option>)}
              </select>
            </label>
          </div>
          <form onSubmit={applyPortion}>
            <fieldset>
              <legend>Portion du circuit</legend>
              <div className="module-fields">
                {["Premier indice", "Dernier indice"].map((label, i) => (
                  <label className="module-field" key={label}>{label}
                    <input type="number" min="0" max={count - 1} required value={range[i]}
                           onChange={(event) => setRange(range.with(i, event.target.value))} />
                  </label>
                ))}
                <label className="module-field">Largeur (m)
                  <input type="number" step="any" value={width} onChange={(event) => setWidth(event.target.value)} />
                </label>
                <label className="module-field">Adhérence μ
                  <input type="number" min="0.3" max="1.5" step="any" value={mu} onChange={(event) => setMu(event.target.value)} />
                </label>
              </div>
              <p className="note">Indices de 0 à {count - 1} inclus. Un champ vide conserve la valeur de chaque point.</p>
              {!validRange && <p className="warn">Saisissez une plage d’indices croissante.</p>}
              {(!validWidth || !validMu) && <p className="warn">La largeur doit être positive et μ compris entre 0,3 et 1,5.</p>}
              <button disabled={loading || !validRange || !validWidth || !validMu || (width === "" && mu === "")}>Appliquer</button>
            </fieldset>
          </form>
          {errors.length > 0 && (
            <div className="warn" role="status">
              <strong>À corriger avant l’export</strong>
              <ul>{errors.map((error) => <li key={error}>{error}</li>)}</ul>
            </div>
          )}
          <div className="controls">
            <button type="button" className="on" disabled={loading || errors.length > 0} onClick={exportTrack}>Exporter</button>
          </div>
        </div>
      </div>
    </>
  );
}
