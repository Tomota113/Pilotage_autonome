import { useEffect, useMemo, useRef, useState } from "react";
import { ALGO_LABELS } from "../../data/algorithms.js";
import {
  ACTION_LABELS, denormalizeObservation, getDiscreteOutput, getObservationLabels, getTrackHalfWidth,
  neuronGrid, pedalValue, topActivationLinks, topActivations,
} from "../../data/network.js";
import { formatNumber } from "../charts/LineChart.jsx";
import { NeuronHistory } from "./EpisodeCharts.jsx";
import { formatMeasure, SignedBar } from "./NetworkReadings.jsx";

const WIDTH = 1000;
const HEIGHT = 347;
const INPUT_X = 232;
const OUTPUT_X = 800;
const MIDDLE_Y = 188;

function activationColor(value, max = 1) {
  const strength = Math.min(1, Math.abs(value) / max) * 100;
  const color = value < 0 ? "var(--network-negative)" : "var(--network-positive)";
  return `color-mix(in srgb, ${color} ${strength}%, var(--network-zero))`;
}

function layerPoints(size, center) {
  const grid = neuronGrid(size);
  if (!grid.length) return grid;
  const columns = Math.ceil(Math.sqrt(size));
  const rows = grid.at(-1).row + 1;
  const gap = Math.min(26, 216 / Math.max(columns - 1, rows - 1, 1));
  return grid.map(({ column, row }) => ({
    x: center + (column - (columns - 1) / 2) * gap,
    y: MIDDLE_Y + (row - (rows - 1) / 2) * gap,
  }));
}

function NeuronLayer({ points, values, ranks, scale, layer, active, pinned, onPreview, onPin }) {
  const [focus, setFocus] = useState(0);
  const columns = Math.ceil(Math.sqrt(points.length));
  const radius = points.length <= 64 ? 6.6 : 4.8;

  function navigate(event, neuron) {
    const offsets = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -columns, ArrowDown: columns };
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (!event.repeat) onPin(layer, neuron);
    } else if (offsets[event.key]) {
      event.preventDefault();
      const next = Math.max(0, Math.min(points.length - 1, neuron + offsets[event.key]));
      event.currentTarget.parentNode.querySelector(`[data-neuron="${next}"]`)?.focus();
    }
  }

  return <g role="group" aria-label={`Couche ${layer + 1} · ${points.length} neurones`}>
    {points.map(({ x, y }, neuron) => {
      const value = values[neuron];
      const label = `Couche ${layer + 1} · neurone ${neuron + 1}`;
      const reading = Number.isFinite(value) ? `${formatNumber(value)} · rang ${ranks[neuron]}` : "activation absente";
      const highlighted = active?.layer === layer && active.neuron === neuron;
      return <circle key={neuron} cx={x} cy={y} r={radius} className="network-neuron"
        fill={Number.isFinite(value) ? activationColor(value, scale) : "var(--panel-3)"}
        data-neuron={neuron} data-active={highlighted || undefined}
        role="button" tabIndex={neuron === focus ? 0 : -1} aria-label={`${label} · ${reading}`}
        aria-pressed={pinned?.layer === layer && pinned.neuron === neuron}
        onPointerEnter={(event) => { if (event.pointerType !== "touch") onPreview({ layer, neuron }); }}
        onPointerLeave={() => onPreview(null)}
        onFocus={() => { setFocus(neuron); onPreview({ layer, neuron }); }}
        onBlur={() => onPreview(null)}
        onClick={() => onPin(layer, neuron)}
        onKeyDown={(event) => navigate(event, neuron)}>
        <title>{`${label} · ${reading}`}</title>
      </circle>;
    })}
  </g>;
}

function ActivationLinks({ groups, index, playing }) {
  // En lecture, le signal continue son trajet même si les extrémités changent à l’image suivante.
  const pulse = playing ? "playing" : index;
  return <g aria-hidden="true" pointerEvents="none">
    {groups.slice(1).map((to, stage) => {
      const from = groups[stage];
      return <g key={stage}>{topActivationLinks(from.values, to.values).map((link, rank) => {
        const start = from.points[link.from];
        const end = to.points[link.to];
        const { x: x1, y: y1 } = start;
        const { x: x2, y: y2 } = end;
        const mid = (x1 + x2) / 2;
        const path = `M${x1},${y1} C${mid},${y1} ${mid},${y2} ${x2},${y2}`;
        return <g key={rank}>
          <path className="network-link" d={path} strokeWidth={0.7 + link.strength * 2.2} />
          <path key={pulse} className="network-pulse" d={path} pathLength="100" strokeWidth={1.8 + link.strength * 2.2}
            style={{ animationDelay: `${stage * 15 + rank * 6}ms` }} />
        </g>;
      })}</g>;
    })}
  </g>;
}

function SteeringWheel({ value }) {
  return <svg viewBox="0 0 64 64" className="network-wheel" aria-hidden="true">
    <g transform={`rotate(${-value * 115} 32 32)`}>
      <circle cx="32" cy="32" r="27" className="network-wheel-rim" />
      <circle cx="32" cy="32" r="21" className="network-wheel-inner" />
      <path d="M7 24l25 8 25-8M32 32v25" className="network-wheel-spokes" />
      <circle cx="32" cy="32" r="7" className="network-wheel-hub" />
      <path d="M28 6h8" className="network-wheel-mark" />
    </g>
  </svg>;
}

const PERCENT = new Intl.NumberFormat("fr-FR", { style: "percent", maximumFractionDigits: 1, signDisplay: "exceptZero" });
const SCORE = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 4 });

function SteeringGauge({ value }) {
  return <div className="network-steering">
    <SteeringWheel value={value} />
    <div><strong>Volant</strong><br />{PERCENT.format(value)}</div>
  </div>;
}

function CommandGauge({ label, value, signed = false }) {
  return <div className="network-command">
    <span><strong>{label}</strong><span className="network-number">{PERCENT.format(value)}</span></span>
    {signed ? <>
      <SignedBar value={value} />
      <small><span>Frein</span><span>Gaz</span></small>
    </> : <div className="network-command-bar" aria-hidden="true"><span style={{ width: `${value * 100}%` }} /></div>}
  </div>;
}

function OutputColumn({ mode, action, points, discrete }) {
  if (mode === "discrete9") {
    const { chosen, scores } = discrete;
    const max = scores ? Math.max(...scores.map(Math.abs)) || 1 : 1;
    return <foreignObject x={OUTPUT_X + 8} y={points[0].y - 13} width={190} height={282}>
      <ul className="network-actions">
        {ACTION_LABELS.map((label, index) => <li key={label} aria-current={chosen === index ? "true" : undefined}>
          <span>{chosen === index && <span aria-hidden="true">✓ </span>}{label}</span>
          <span className="network-number" title={scores ? formatNumber(scores[index]) : undefined}>
            {scores ? SCORE.format(scores[index]) : "—"}
          </span>
          {scores && <SignedBar value={scores[index]} max={max} />}
        </li>)}
      </ul>
      {!scores && <p className="network-missing-q">Scores Q non enregistrés</p>}
    </foreignObject>;
  }

  return <g>
    <foreignObject x={OUTPUT_X + 12} y={points[0].y - 30} width={180} height={63}>
      <SteeringGauge value={action.steer} />
    </foreignObject>
    {mode === "pedal" ? <foreignObject x={OUTPUT_X + 12} y={points[1].y - 12} width={180} height={70}>
      <CommandGauge label="Pédale" value={pedalValue(action)} signed />
    </foreignObject> : <>
      <foreignObject x={OUTPUT_X + 12} y={points[1].y - 12} width={180} height={52}>
        <CommandGauge label="Accélérateur" value={action.throttle} />
      </foreignObject>
      <foreignObject x={OUTPUT_X + 12} y={points[2].y - 12} width={180} height={52}>
        <CommandGauge label="Frein" value={action.brake} />
      </foreignObject>
    </>}
  </g>;
}

export default function NetworkDiagram({ frames, index, car, track, layerSizes, mode, algo, playing, pulseDuration }) {
  const [preview, setPreview] = useState(null);
  const [pinned, setPinned] = useState(null);
  const active = pinned ?? preview;
  const inspector = useRef(null);
  useEffect(() => {
    if (pinned) inspector.current.scrollIntoView({ block: "nearest" });
  }, [pinned]);
  const frame = frames[index];
  const { obs, action, activations = [] } = frame;
  const labels = getObservationLabels(car, obs.length);
  // L’entrée décrit l’état juste avant la décision, enregistré à l’image précédente.
  const measures = denormalizeObservation(obs, car, getTrackHalfWidth(track, frames[index - 1] ?? frame));
  const inputPoints = obs.map((_, i) => ({ x: INPUT_X, y: 57 + i * 270 / Math.max(1, obs.length - 1) }));
  const layerLayouts = useMemo(() => layerSizes.map((size, layer) => layerPoints(size, 382 + layer * 270)), [layerSizes]);
  const layers = layerLayouts.map((points, layer) => ({ points, values: activations[layer] ?? [] }));
  const scales = useMemo(() => {
    const maxima = layerSizes.map(() => 1);
    for (const { activations = [] } of frames) {
      activations.forEach((values, layer) => {
        for (const value of values) maxima[layer] = Math.max(maxima[layer], Math.abs(value));
      });
    }
    return maxima;
  }, [frames, layerSizes]);
  const ranksByLayer = layers.map(({ values }) => {
    const ranked = topActivations(values, values.length);
    const ranks = [];
    ranked.forEach(({ neuron }, rank) => { ranks[neuron - 1] = rank + 1; });
    return ranks;
  });

  const discrete = mode === "discrete9" ? getDiscreteOutput(frame) : null;
  // Sans valeurs Q, seule la destination de la commande enregistrée est connue.
  const outputValues = discrete ? (discrete.scores ?? ACTION_LABELS.map((_, i) => Number(discrete.chosen === i)))
    : mode === "pedal" ? [action.steer, pedalValue(action)] : [action.steer, action.throttle, action.brake];
  const outputYs = discrete ? ACTION_LABELS.map((_, i) => 73 + i * 24) : mode === "pedal" ? [129, 224] : [105, 185, 245];
  const outputPoints = outputYs.map((y) => ({ x: OUTPUT_X, y }));
  const outputLabel = discrete ? "9 actions" : `${outputValues.length} sorties`;
  const stages = [{ points: inputPoints, values: obs }, ...layers, { points: outputPoints, values: outputValues }];
  const headings = [
    { x: 12, text: `1. Entrées · ${obs.length}` },
    ...layerLayouts.map((points, layer) => ({
      x: 382 + layer * 270, text: `${layer + 2}. Couche ${layer + 1} · ${points.length} neurones`, centered: true,
    })),
    { x: OUTPUT_X + 8, text: `${layerSizes.length + 2}. ${outputLabel}` },
  ];

  function pin(layer, neuron) {
    setPinned({ layer, neuron });
  }

  return <section className="card network-diagram-card" aria-labelledby="network-diagram-title">
    <div className="network-diagram-heading">
      <h3 id="network-diagram-title" className="card-title">De la piste aux commandes</h3>
      <div className="network-legend" aria-label="Couleur des activations">
        <span><i className="negative" /> Négatif</span>
        <span><i className="zero" /> Zéro</span>
        <span><i className="positive" /> Positif</span>
      </div>
    </div>
    <div className="network-diagram-scroll" tabIndex={0} role="region" aria-label="Schéma interactif du réseau">
      <svg className="network-diagram" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} data-playing={playing || undefined}
        style={{ "--network-pulse-duration": `${pulseDuration}ms` }} aria-label="Entrées, couches de neurones et sorties">
        {headings.map(({ x, text, centered }) => <text className="network-stage-title" key={text} x={x} y={27}
          textAnchor={centered ? "middle" : "start"}>{text}</text>)}
        {layerLayouts.map((_, layer) => <rect key={layer} x={265 + layer * 270} y={70} width={234} height={236} rx={10}
          className="network-layer-panel" />)}
        <ActivationLinks groups={stages} index={index} playing={playing} />
        {inputPoints.map(({ x, y }, input) => <g key={input} className="network-input">
          <title>{`${labels[input]} · ${formatMeasure(measures[input])} · ${formatNumber(obs[input])} normalisé`}</title>
          <text x={12} y={y} dy=".35em">{labels[input].replace("Distance au bord à ", "Bord à ")
            .replace(" avant la commande", "").replace(" de la piste", "").replace("Courbure à ", "Courbure ")}</text>
          <text x={216} y={y} dy=".35em" textAnchor="end" className="network-number">{formatMeasure(measures[input])}</text>
          <circle cx={x} cy={y} r={4.6} fill={activationColor(obs[input])} />
        </g>)}
        {layers.map(({ points, values }, layer) => <NeuronLayer key={layer} points={points} values={values}
          ranks={ranksByLayer[layer]} scale={scales[layer]} layer={layer} active={active} pinned={pinned} onPreview={setPreview} onPin={pin} />)}
        <OutputColumn mode={mode} action={action} points={outputPoints} discrete={discrete} />
      </svg>
    </div>
    <div className="network-inspector" ref={inspector}>
      {active ? <NeuronHistory frames={frames} index={index} {...active} rank={ranksByLayer[active.layer][active.neuron]} />
        : <p>Survolez un neurone pour suivre sa courbe. Cliquez pour la garder affichée.</p>}
      {pinned && <button type="button" onClick={() => { setPinned(null); setPreview(null); }}>Détacher la courbe</button>}
    </div>
    {!activations.some((values) => values.length) && <p className="warn">Activations absentes à cette image.</p>}
    <details className="network-details">
      <summary>En savoir plus sur le schéma</summary>
      <p>L’intensité suit la distance à zéro. L’épaisseur des traits suit l’amplitude des deux points reliés.
        Les traits associent les valeurs les plus fortes entre colonnes pour illustrer le sens du calcul.
        Le replay enregistre des activations, sans les poids nécessaires pour attribuer la décision à un neurone.</p>
      {discrete ? <>
        <p>{ALGO_LABELS[algo] ?? "L’agent"} choisit parmi neuf actions possibles. La ligne cochée indique
          la commande enregistrée. Une valeur Q estime la somme des récompenses futures pondérées pour une action.</p>
        <SteeringGauge value={action.steer} />
      </> : <p>Une commande de volant positive braque à gauche. {mode === "pedal"
        ? "Une pédale négative freine, une pédale positive accélère, zéro laisse rouler."
        : "Les commandes d’accélérateur et de frein sont indépendantes."}</p>}
    </details>
  </section>;
}
