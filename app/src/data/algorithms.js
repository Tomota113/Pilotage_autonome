// Noms lisibles et couleurs fixes, partagés par toutes les pages.
// Couleurs : palette catégorielle validée pour le daltonisme (variante thème sombre) ;
// une condition garde toujours la même couleur, quelle que soit la page ou le filtre.

export const ALGO_LABELS = {
  ppo: "PPO",
  dqn: "DQN",
  sac: "SAC",
  qlearning: "Q-Learning",
  sarsa: "SARSA",
  montecarlo: "Monte-Carlo",
  classic: "Pilote classique",
};

// Ordre d'affichage et libellés des conditions expérimentales (voir tools/make_configs.py)
export const CONDITIONS = [
  { id: "classic", label: "Pilote classique", short: "Classique", color: "#a3a29b",
    help: "Référence sans apprentissage : il connaît le circuit et l'adhérence." },
  { id: "sac_mufixe", label: "SAC", short: "SAC", color: "#c98500",
    help: "Deep RL, actions continues, entraîné à adhérence normale." },
  { id: "ppo_mufixe", label: "PPO", short: "PPO", color: "#3987e5",
    help: "Deep RL, actions continues, entraîné à adhérence normale." },
  { id: "ppo_mualea", label: "PPO · adhérence variable", short: "PPO μ var.", color: "#d95926",
    help: "PPO entraîné avec une adhérence tirée au hasard à chaque épisode (0,5 à 1,1)." },
  { id: "ppo_mufixe_nolambda", label: "PPO · sans pénalité de braquage", short: "PPO λ=0", color: "#0ca30c",
    help: "Ablation : PPO sans le terme qui pénalise les coups de volant." },
  { id: "dqn_mufixe", label: "DQN", short: "DQN", color: "#199e70",
    help: "Deep RL, 9 actions discrètes." },
  { id: "qlearning_mufixe", label: "Q-Learning", short: "Q-Learning", color: "#d55181",
    help: "Tabulaire : table de 768 états × 9 actions." },
  { id: "sarsa_mufixe", label: "SARSA", short: "SARSA", color: "#9085e9",
    help: "Tabulaire, sur politique : apprend la valeur de la politique qui explore." },
  { id: "montecarlo_mufixe", label: "Monte-Carlo", short: "Monte-Carlo", color: "#e66767",
    help: "Tabulaire : apprend à partir du retour complet de chaque épisode." },
];

export const CONDITION_BY_ID = Object.fromEntries(CONDITIONS.map((c) => [c.id, c]));

export function conditionLabel(id) {
  return CONDITION_BY_ID[id]?.label ?? (id ? id : "Essai (hors protocole)");
}

export function conditionColor(id) {
  return CONDITION_BY_ID[id]?.color ?? "#8c8b84";
}

export const OUTCOME_LABELS = {
  lap: "Tour bouclé",
  off_track: "Sortie de piste",
  stalled: "Bloqué (plus de progrès)",
  timeout: "Temps écoulé",
};

export const MU_LABELS = { 1: "Adhérence normale (μ 1,0)", 0.8: "Piste humide (μ 0,8)", 0.6: "Piste glissante (μ 0,6)" };

export function muLabel(mu) {
  return MU_LABELS[Number(mu)] ?? `μ ${Number(mu).toFixed(2)}`;
}

// Libellé court d'un replay : « SAC · gen_10 · μ 1,0 · 92,0 s »
export function replayTitle(r) {
  const result = r.outcome === "lap" && r.lap_time != null ? `${Number(r.lap_time).toFixed(1)} s` : OUTCOME_LABELS[r.outcome] ?? r.outcome;
  return `${conditionLabel(r.condition)} · ${r.track_id} · μ ${Number(r.mu_factor).toFixed(1)} · ${result}`;
}
