import { CONDITION_BY_ID, OUTCOME_LABELS, conditionLabel } from "../../data/algorithms.js";
import { clockLabel, gapLabel } from "./raceData.js";

const shortName = (id) => CONDITION_BY_ID[id]?.short ?? id;

function RaceTiming({ racer, best }) {
  const { outcome, lap_time: lapTime } = racer.replay.summary;
  if (racer.finished) return <span className={best ? "tower-best" : undefined}
                                    title={best ? "Meilleur tour de la course" : "Tour bouclé"}>
    <small>TOUR</small> {clockLabel(lapTime)}
  </span>;
  if (racer.done) return <span className="tower-out" title={OUTCOME_LABELS[outcome]}>
    <small>{outcome === "off_track" ? "SORTIE" : "ARRÊT"}</small> {clockLabel(racer.end)}
  </span>;
  if (racer.position === 1) return <strong className="tower-leader">Leader</strong>;
  return gapLabel(racer.gap);
}

export function TimingTower({ racers, selectedId, onSelect, title, bestLap, compact = false }) {
  return <div className={compact ? "timing-tower fullscreen-standings" : "card timing-tower"}>
    <header><h3>{title}</h3>{racers.length > 0 && <span>{racers.length} pilotes</span>}</header>
    <div className="standings" role="table" aria-label={title}>
      <div className="standings-row headings" role="row">
        <span role="columnheader">Pos.</span><span role="columnheader">±</span>
        <span role="columnheader">Pilote</span><span role="columnheader" title="Écart au leader au même point du tour">Écart / temps</span>
      </div>
      <div className="standings-body" role="rowgroup" style={{ "--rows": racers.length }}>
        {racers.map((racer) => {
          const { condition, color, position, gained } = racer;
          const selected = condition === selectedId;
          const name = conditionLabel(condition);
          const rankChange = gained > 0 ? "places gagnées" : gained < 0 ? "places perdues" : "place inchangée";
          return <div key={condition} role="row"
                      className={`standings-row racer${selected ? " selected" : ""}`}
                      style={{ "--rank": position - 1, "--racer-color": color }}>
            <span className="tower-position" role="cell">{position}</span>
            <span className={`tower-change ${gained > 0 ? "up" : gained < 0 ? "down" : ""}`} role="cell"
                  aria-label={gained ? `${Math.abs(gained)} ${rankChange}` : rankChange}
                  title={gained ? `${Math.abs(gained)} ${rankChange} depuis la grille` : rankChange}>
              {gained ? `${gained > 0 ? "▲" : "▼"}${Math.abs(gained)}` : "·"}
            </span>
            <span role="cell">
              <button type="button" className="standing-agent" aria-label={`Suivre ${name}`} aria-pressed={selected}
                      title={name} onClick={() => onSelect(condition)}>
                <span className="swatch" />{shortName(condition)}
              </button>
            </span>
            <span role="cell"><RaceTiming racer={racer} best={racer.finished && racer.replay.summary.lap_time === bestLap} /></span>
          </div>;
        })}
      </div>
    </div>
    {!racers.length && <p className="note">Aucun pilote affiché.</p>}
  </div>;
}

export function RaceFinish({ racers }) {
  const podium = racers.filter((racer) => racer.finished).slice(0, 3);
  const unclassified = racers.filter((racer) => !racer.finished);
  return <section className="card race-finish" aria-label="Résultats de la course">
    <h3>Fin de course</h3>
    {podium.length ? <ol className="race-podium">
      {podium.map((racer) => <li key={racer.condition} style={{ "--racer-color": racer.color }}>
        <span className="podium-place">{racer.position}</span>
        <span><strong>{shortName(racer.condition)}</strong><small>{clockLabel(racer.replay.summary.lap_time)}</small></span>
      </li>)}
    </ol> : <p>Aucun tour bouclé.</p>}
    {unclassified.length > 0 && <>
      <h4>Non classés</h4>
      <ul className="race-unclassified">
        {unclassified.map((racer) => <li key={racer.condition}>
          <strong>{shortName(racer.condition)}</strong><span>{OUTCOME_LABELS[racer.replay.summary.outcome]}</span>
        </li>)}
      </ul>
    </>}
  </section>;
}
