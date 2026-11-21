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
  td3: "TD3",
  tqc: "TQC",
  qrdqn: "QR-DQN",
  deep_sarsa: "Deep SARSA",
  deep_mc: "Deep Monte-Carlo",
  classic: "Pilote classique",
};

// Ordre d'affichage et libellés des conditions expérimentales (voir tools/make_configs.py)
export const CONDITIONS = [
  { id: "classic", label: "Pilote classique", short: "Classique", color: "#a3a29b",
    help: "Référence sans apprentissage : il connaît le circuit et l'adhérence." },
  { id: "raceline", label: "Pilote trajectoire idéale", short: "Idéal", color: "#e8e9ec",
    help: "Référence : suit la trajectoire de courbure minimale à la vitesse maximale permise par l'adhérence." },
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
  { id: "ppo_f1", label: "PPO (F1, circuits réels)", short: "PPO", color: "#3987e5" },
  { id: "ppo_f1_mualea", label: "PPO adhérence variable (F1, circuits réels)", short: "PPO μ var.", color: "#d95926" },
  { id: "sac_f1", label: "SAC (F1, circuits réels)", short: "SAC", color: "#c98500" },
  { id: "dqn_f1", label: "DQN (F1, circuits réels)", short: "DQN", color: "#199e70" },
  // Série v2 complétée (21/11/2026) : couleur de la famille + nom ; jamais mélangée avec la série v1
  { id: "ppo_f1_net64", label: "PPO réseau 2 × 64 (ablation, F1)", short: "PPO 2×64", color: "#3987e5",
    help: "Même PPO que « PPO (F1) » mais avec un réseau 4 fois plus petit : l'effet de la taille du réseau." },
  { id: "td3_f1", label: "TD3 (F1, circuits réels)", short: "TD3", color: "#9085e9",
    help: "Acteur-critique hors politique, deux critiques et mise à jour retardée de l'acteur." },
  { id: "tqc_f1", label: "TQC (F1, circuits réels)", short: "TQC", color: "#e66767",
    help: "SAC avec critiques distributionnels tronqués : l'un des meilleurs algorithmes à actions continues." },
  { id: "qrdqn_f1", label: "QR-DQN (F1, circuits réels)", short: "QR-DQN", color: "#199e70",
    help: "DQN distributionnel : apprend toute la distribution des retours." },
  { id: "deep_sarsa_f1", label: "Deep SARSA (F1, circuits réels)", short: "Deep SARSA", color: "#0ca30c",
    help: "SARSA avec un réseau de neurones à la place de la table." },
  { id: "deep_mc_f1", label: "Deep Monte-Carlo (F1, circuits réels)", short: "Deep MC", color: "#0ca30c",
    help: "Monte-Carlo avec un réseau de neurones à la place de la table." },
  { id: "qlearning_f1", label: "Q-Learning tabulaire (F1, 5 760 états)", short: "Q-Learning", color: "#d55181",
    help: "Table Q avec un découpage adapté à la F1 (vitesse, capteurs à 200 m, virage à venir)." },
  { id: "sarsa_f1", label: "SARSA tabulaire (F1, 5 760 états)", short: "SARSA", color: "#9085e9",
    help: "SARSA avec le découpage F1 de 5 760 états." },
  { id: "montecarlo_f1", label: "Monte-Carlo tabulaire (F1, 5 760 états)", short: "Monte-Carlo", color: "#e66767",
    help: "Monte-Carlo avec le découpage F1 de 5 760 états." },
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
