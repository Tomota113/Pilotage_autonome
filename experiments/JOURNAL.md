# Journal des expériences

Chaque entraînement ou évaluation est noté ici, avec son `run_id`, sa
configuration et sa graine. Aucun résultat n'est inscrit sans provenir d'un
vrai run.

| Date | run_id | Configuration | Graine | Résultat mesuré | Décision |
|------|--------|---------------|--------|-----------------|----------|
| 2026-11-20 | classic_demo | pilote classique (`agents/classic_driver.py`), demo_oval, μ = 1,0, env par défaut (continuous, dt 0,05 s) | 0 | tour valide en 33,7 s, 674 pas, récompense 140,95, 0 sortie | premier vrai replay pour l'application ; évaluation de référence complète prévue en mission 8 |
| 2026-11-20 | classic_ref | pilote classique, `python -m tools.evaluate_all`, 15 circuits (gen_00–09 train, gen_10–14 test) × μ ∈ {1,0 ; 0,8 ; 0,6}, 1 épisode (politique déterministe) | 0 | 45/45 tours valides ; temps moyen test : 87,15 s (μ 1,0), 95,59 s (0,8), 108,43 s (0,6) ; train : 89,88 / 98,65 / 111,98 s ; à μ 0,6 le tour est 24,5 % plus long en moyenne (23,8 à 25,2 %) | référence non-RL pour les figures ; replays de démo sur gen_10 dans runs/classic_ref/ |
| 2026-11-20 | ppo_demo_oval_mufixe_s0_20261120-2224 | essai court `configs/ppo_demo.yaml` : PPO, demo_oval, μ fixe 1,0, 20 000 pas, éval. tous les 10 000 pas sur 2 épisodes | 0 | à 10 000 pas : tour valide en 66,05 s, récompense 134,33 (replay vérifié : trajectoire sur tout l'ovale, 20 checkpoints dans l'ordre) ; à 20 000 et 20 480 pas : sortie de piste, récompense ≈ 21 ; débit ≈ 1 300 pas/s | la chaîne d'entraînement fonctionne ; demo_oval est trop facile pour comparer les algorithmes |
| 2026-11-20 | ppo_multi_mufixe_s0_20261120-2225, dqn_multi_mufixe_s0_20261120-2225, sac_multi_mufixe_s0_20261120-2226 (runs/_bench/) | mesure de débit : gen_00–09, μ fixe 1,0, 20 000 pas chacun, 1 évaluation finale d'un épisode | 0 | débit (évaluation comprise) : PPO 1 238 pas/s, DQN 1 208 pas/s, SAC 189 pas/s ; aucun tour valide (attendu à 20 000 pas) | budget : 1 M de pas par run, tout sur le PC (PPO/DQN ≈ 15-20 min, SAC ≈ 1 h 30) |
| 2026-11-20 | ppo_demo_oval_mufixe_s0_20261120-2312 | lancé depuis le Training Center (application) : PPO, demo_oval, μ fixe 1,0, 4 000 pas demandés (4 096 faits : un lot PPO = 2 048 pas) | 0 | évaluation à 4 096 pas : 2/2 tours valides, 57,65 s, récompense 136,04 ; « Regarder en direct » rejoue le checkpoint | lancement, suivi WebSocket et visionnage fonctionnent de bout en bout |
| 2026-11-20 | qlearning_multi_mufixe_s0_20261120-2323 (runs/_bench/) | mesure de débit : Q-Learning, gen_00–09, μ fixe 1,0, 20 000 pas, 1 évaluation finale d'un épisode | 0 | 4 002 pas/s (évaluation comprise) | ≈ 5 min pour 1 M de pas |
| 2026-11-20 | sarsa_multi_mufixe_s0_20261120-2344, montecarlo_multi_mufixe_s0_20261120-2344 (runs/_bench/) | mesure de débit : SARSA et Monte-Carlo, gen_00–09, μ fixe 1,0, 20 000 pas, pendant qu'un run PPO de la nuit tournait | 0 | SARSA 2 741 pas/s, Monte-Carlo 2 751 pas/s (évaluation comprise) | ≈ 6 min pour 1 M de pas ; ajoutés à la file après les 18 runs |
| 2026-11-21 | ppo_multi_mufixe_s0_20261121-0058, ppo_multi_mufixe_s1_20261121-0111, ppo_multi_mufixe_s2_20261121-0123 | ppo, gen_00–09, μ fixe 1,0, 1 M de pas, éval. dernier checkpoint sur 15 circuits × μ ∈ {1,0 ; 0,8 ; 0,6} | 0, 1, 2 | tours (test) μ 1,0 : 0,47 ± 0,23 ; μ 0,8 : 0,20 ± 0,00 ; μ 0,6 : 0,00 ± 0,00 ; train μ 1,0 : 0,40 ± 0,26 ; 25/135 tours au total ; dernière éval. d'entraînement (taux de tours) : s0 0,00, s1 0,00, s2 0,80 | voir bilan du 21/11 ci-dessous |
| 2026-11-21 | ppo_multi_mualea_s0_20261120-2341, ppo_multi_mualea_s1_20261120-2355, ppo_multi_mualea_s2_20261121-0008 | ppo, gen_00–09, μ uniforme [0,5 ; 1,1], 1 M de pas, éval. dernier checkpoint sur 15 circuits × μ ∈ {1,0 ; 0,8 ; 0,6} | 0, 1, 2 | tours (test) μ 1,0 : 0,13 ± 0,23 ; μ 0,8 : 0,40 ± 0,35 ; μ 0,6 : 0,20 ± 0,20 ; train μ 1,0 : 0,20 ± 0,26 ; 32/135 tours au total ; dernière éval. d'entraînement (taux de tours) : s0 0,20, s1 0,60, s2 0,00 | voir bilan du 21/11 ci-dessous |
| 2026-11-21 | dqn_multi_mufixe_s0_20261121-0136, dqn_multi_mufixe_s1_20261121-0148, dqn_multi_mufixe_s2_20261121-0159 | dqn, gen_00–09, μ fixe 1,0, 1 M de pas, éval. dernier checkpoint sur 15 circuits × μ ∈ {1,0 ; 0,8 ; 0,6} | 0, 1, 2 | tours (test) μ 1,0 : 0,13 ± 0,23 ; μ 0,8 : 0,07 ± 0,12 ; μ 0,6 : 0,00 ± 0,00 ; train μ 1,0 : 0,17 ± 0,21 ; 12/135 tours au total ; dernière éval. d'entraînement (taux de tours) : s0 0,00, s1 0,00, s2 0,80 | voir bilan du 21/11 ci-dessous |
| 2026-11-21 | sac_multi_mufixe_s0_20261121-0211, sac_multi_mufixe_s1_20261121-0335, sac_multi_mufixe_s2_20261121-0500 | sac, gen_00–09, μ fixe 1,0, 1 M de pas, éval. dernier checkpoint sur 15 circuits × μ ∈ {1,0 ; 0,8 ; 0,6} | 0, 1, 2 | tours (test) μ 1,0 : 0,67 ± 0,42 ; μ 0,8 : 0,67 ± 0,31 ; μ 0,6 : 0,00 ± 0,00 ; train μ 1,0 : 0,70 ± 0,26 ; 61/135 tours au total ; dernière éval. d'entraînement (taux de tours) : s0 1,00, s1 0,80, s2 0,80 | voir bilan du 21/11 ci-dessous |
| 2026-11-21 | qlearning_multi_mufixe_s0_20261120-2325, qlearning_multi_mufixe_s1_20261120-2330, qlearning_multi_mufixe_s2_20261120-2335 | qlearning, gen_00–09, μ fixe 1,0, 1 M de pas, éval. dernier checkpoint sur 15 circuits × μ ∈ {1,0 ; 0,8 ; 0,6} | 0, 1, 2 | tours (test) μ 1,0 : 0,00 ± 0,00 ; μ 0,8 : 0,00 ± 0,00 ; μ 0,6 : 0,00 ± 0,00 ; train μ 1,0 : 0,07 ± 0,12 ; 2/135 tours au total ; dernière éval. d'entraînement (taux de tours) : s0 0,20, s1 0,00, s2 0,00 | voir bilan du 21/11 ci-dessous |
| 2026-11-21 | sarsa_multi_mufixe_s0_20261121-0629, sarsa_multi_mufixe_s1_20261121-0634, sarsa_multi_mufixe_s2_20261121-0640 | sarsa, gen_00–09, μ fixe 1,0, 1 M de pas, éval. dernier checkpoint sur 15 circuits × μ ∈ {1,0 ; 0,8 ; 0,6} | 0, 1, 2 | tours (test) μ 1,0 : 0,00 ± 0,00 ; μ 0,8 : 0,00 ± 0,00 ; μ 0,6 : 0,00 ± 0,00 ; train μ 1,0 : 0,10 ± 0,17 ; 6/135 tours au total ; dernière éval. d'entraînement (taux de tours) : s0 0,00, s1 0,00, s2 0,00 | voir bilan du 21/11 ci-dessous |
| 2026-11-21 | montecarlo_multi_mufixe_s0_20261121-0645, montecarlo_multi_mufixe_s1_20261121-0650, montecarlo_multi_mufixe_s2_20261121-0655 | montecarlo, gen_00–09, μ fixe 1,0, 1 M de pas, éval. dernier checkpoint sur 15 circuits × μ ∈ {1,0 ; 0,8 ; 0,6} | 0, 1, 2 | tours (test) μ 1,0 : 0,00 ± 0,00 ; μ 0,8 : 0,00 ± 0,00 ; μ 0,6 : 0,00 ± 0,00 ; train μ 1,0 : 0,00 ± 0,00 ; 0/135 tours au total ; dernière éval. d'entraînement (taux de tours) : s0 0,00, s1 0,00, s2 0,00 | voir bilan du 21/11 ci-dessous |
| 2026-11-21 | ppo_multi_mufixe_s0_20261121-0020, ppo_multi_mufixe_s1_20261121-0033, ppo_multi_mufixe_s2_20261121-0046 | ppo, gen_00–09, μ fixe 1,0, λ = 0, 1 M de pas, éval. dernier checkpoint sur 15 circuits × μ ∈ {1,0 ; 0,8 ; 0,6} | 0, 1, 2 | tours (test) μ 1,0 : 0,40 ± 0,35 ; μ 0,8 : 0,20 ± 0,20 ; μ 0,6 : 0,00 ± 0,00 ; train μ 1,0 : 0,47 ± 0,45 ; 27/135 tours au total ; dernière éval. d'entraînement (taux de tours) : s0 1,00, s1 0,80, s2 0,00 | voir bilan du 21/11 ci-dessous |

## Bilan du 21/11/2026 (24 runs de 1 M de pas, évaluation `tools/evaluate_all.py`)

- Taux de tours = moyenne sur les graines de la part de tours valides (5 circuits de test, ou 10 d'entraînement), ± écart-type entre les 3 graines : avec 3 graines, l'écart-type est indicatif.
- Pilote classique (`classic_ref`, ré-évalué) : 45/45 tours, comme le 20/11.
- SAC est le meilleur agent à μ 1,0 et 0,8 (0,67 de tours sur les circuits de test) mais ne boucle plus aucun tour à μ 0,6 ; PPO à μ fixe : 0,47 à μ 1,0, 0 à μ 0,6.
- PPO entraîné à μ aléatoire est le seul agent qui boucle encore des tours à μ 0,6 (0,20 ± 0,20), mais il est moins bon à μ 1,0 (0,13) : la robustesse se paie en performance nominale.
- Quand PPO (μ fixe) boucle un tour, il est en moyenne 5 % plus rapide que le pilote classique sur le même circuit et le même μ (rapport 0,887 à 1,040, 25 tours) ; SAC +2,5 % (61 tours) ; PPO μ aléatoire +11 % ; DQN +12 %. Le pilote classique ne vise que 90 % de la vitesse limite.
- Ablation λ = 0 : pas de différence nette avec λ = 0,05 (0,40 contre 0,47 de tours à μ 1,0, écarts-types ≈ 0,3) : la pénalité de braquage, très petite (≤ 0,005 par pas), ne change pas le résultat.
- Méthodes tabulaires (Q-Learning, SARSA, Monte-Carlo, 768 états) : presque aucun tour (2, 6 et 0 sur 135). Monte-Carlo finit surtout par arrêt sans progrès (101 épisodes « stalled » sur 135) ; les 768 états grossiers ne suffisent pas pour piloter sur des circuits de 2 à 3 km.
- Train contre test (μ 1,0) : écarts faibles pour les réseaux (SAC 0,70 / 0,67 ; PPO 0,40 / 0,47) : pas de sur-apprentissage visible des circuits d'entraînement.
- Variance entre graines très forte (ex. ppo_mualea : 17, 15 et 0 tours sur 45) ; les courbes d'apprentissage oscillent d'une évaluation à l'autre : 3 graines et 5 épisodes d'évaluation donnent des tendances, pas des écarts significatifs.

## Évaluation des meilleurs checkpoints (21/11/2026, `python -m tools.evaluate_all --checkpoint best`)

Mêmes 24 runs, même protocole (15 circuits × μ ∈ {1,0 ; 0,8 ; 0,6}, 1 épisode déterministe),
mais avec le checkpoint de la meilleure évaluation d'entraînement (progress.csv, circuits
d'entraînement : plus grand taux de tours, puis plus grande récompense). Les circuits de test ne
servent pas au choix. Les méthodes tabulaires n'ont que leur table finale (meilleur = dernier).
Résultats dans `results/eval_best.csv`, figures dans `results/figures_best/`.

| Condition | Checkpoints choisis (s0, s1, s2) | Tours test μ 1,0 / 0,8 / 0,6 (meilleur) | idem (dernier) | Tours totaux /135 (meilleur / dernier) |
|---|---|---|---|---|
| ppo_mufixe | step_850000, step_200000, step_1001472 | 0,60 / 0,13 / 0,00 | 0,47 / 0,20 / 0,00 | 26 / 25 |
| ppo_mualea | step_300000, step_700000, step_1000000 | 0,20 / 0,67 / 0,33 | 0,13 / 0,40 / 0,20 | 58 / 32 |
| dqn_mufixe | step_800000, step_900000, step_1000000 | 0,27 / 0,20 / 0,20 | 0,13 / 0,07 / 0,00 | 28 / 12 |
| sac_mufixe | step_150000, step_450000, step_500000 | 0,80 / 0,60 / 0,00 | 0,67 / 0,67 / 0,00 | 62 / 61 |
| ppo_mufixe_nolambda | step_1001472, step_700000, step_1001472 | 0,60 / 0,27 / 0,00 | 0,40 / 0,20 / 0,00 | 36 / 27 |
| qlearning / sarsa / montecarlo | step_1000000 (table finale) | 0 / 0 / 0 | 0 / 0 / 0 | 2 / 6 / 0 (inchangé) |

Décision / lecture :
- Le dernier checkpoint sous-estime les méthodes dont l'apprentissage oscille : PPO μ aléatoire
  passe de 32 à 58 tours, DQN de 12 à 28. Les conclusions du bilan restent valables, en plus nettes :
  PPO μ aléatoire est l'agent le plus robuste (0,67 de tours à μ 0,8, 0,33 à μ 0,6) ; SAC reste le
  meilleur à μ 1,0 (0,80) et le seul à n'avoir aucune variance entre graines à μ 1,0 et 0,8.
- Le meilleur checkpoint de SAC arrive tôt (150 000 à 500 000 pas) : 1 M de pas n'apporte rien de plus.
- Biais à garder en tête : le choix se fait sur les circuits d'entraînement, donc les chiffres « train »
  de eval_best.csv sont légèrement optimistes ; les chiffres « test » ne le sont pas.
