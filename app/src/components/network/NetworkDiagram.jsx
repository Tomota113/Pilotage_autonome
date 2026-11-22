import { ALGO_LABELS } from "../../data/algorithms.js";

const ACTION_EXPLANATIONS = {
  pedal: "Le réseau produit deux nombres. Le volant règle la direction et la pédale va de −1 (frein à fond) à +1 (plein gaz), avec 0 pour la roue libre.",
  continuous: "Le réseau produit trois nombres pour régler séparément le volant, l’accélérateur et le frein.",
};

function outputExplanation(mode, algo) {
  if (mode === "discrete9") {
    return `${ALGO_LABELS[algo] ?? "L’agent"} choisit parmi neuf actions possibles, qui combinent une direction et une commande parmi accélérer, laisser rouler ou freiner.`;
  }
  return ACTION_EXPLANATIONS[mode] ?? "Le résultat des calculs détermine la commande envoyée à la voiture.";
}

export default function NetworkDiagram({ inputCount, layerSizes, mode, algo, sensorRange }) {
  const layers = layerSizes
    ? layerSizes.map((size, index) => ({
      title: `Couche ${index + 1} · ${size} neurones`,
      text: index === 0
        ? "Chaque neurone combine les mesures pour produire un nouveau nombre."
        : "Les neurones combinent les nombres de la couche précédente pour préparer la décision.",
    }))
    : [{ title: "Couches internes", text: "Le replay ne précise pas leur nombre ni leur taille." }];
  const stages = [
    {
      title: `La voiture perçoit (${inputCount} nombres)`,
      text: `Elle mesure les bords jusqu’à ${sensorRange} m et reçoit aussi sa vitesse et des informations sur la piste.`,
    },
    ...layers,
    { title: "Commandes", text: outputExplanation(mode, algo) },
  ];

  return <section aria-label="De la piste aux commandes">
    <ol className="network-flow">
      {stages.map(({ title, text }, index) => (
        <li className="card" key={title}>
          <h3 className="card-title">{index + 1}. {title}</h3>
          <p>{text}</p>
        </li>
      ))}
    </ol>
  </section>;
}
