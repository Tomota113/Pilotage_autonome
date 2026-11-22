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
| ppo_mualea | step_300000, step_1000000, step_700000 | 0,20 / 0,67 / 0,33 | 0,13 / 0,40 / 0,20 | 58 / 32 |
| dqn_mufixe | step_800000, step_900000, step_1000000 | 0,27 / 0,20 / 0,20 | 0,13 / 0,07 / 0,00 | 28 / 12 |
| sac_mufixe | step_150000, step_500000, step_450000 | 0,80 / 0,60 / 0,00 | 0,67 / 0,67 / 0,00 | 62 / 61 |
| ppo_mufixe_nolambda | step_1001472, step_1001472, step_700000 | 0,60 / 0,27 / 0,00 | 0,40 / 0,20 / 0,00 | 36 / 27 |
| qlearning / sarsa / montecarlo | step_1000000 (table finale) | 0 / 0 / 0 | 0 / 0 / 0 | 2 / 6 / 0 (inchangé) |

Décision / lecture :
- Le dernier checkpoint sous-estime les méthodes dont l'apprentissage oscille : PPO μ aléatoire
  passe de 32 à 58 tours, DQN de 12 à 28. Les conclusions du bilan restent valables, en plus nettes :
  PPO μ aléatoire est l'agent le plus robuste (0,67 de tours à μ 0,8, 0,33 à μ 0,6) ; SAC reste le
  meilleur à μ 1,0 (0,80) et le seul à n'avoir aucune variance entre graines à μ 1,0 et 0,8.
- Le meilleur checkpoint de SAC arrive tôt (150 000 à 500 000 pas) : 1 M de pas n'apporte rien de plus.
- Biais à garder en tête : le choix se fait sur les circuits d'entraînement, donc les chiffres « train »
  de eval_best.csv sont légèrement optimistes ; les chiffres « test » ne le sont pas.

## Replays de démonstration pour l'application (21/11/2026, `python -m tools.make_showcase`)

Pour chaque condition, la graine qui a bouclé le plus de tours dans `eval_best.csv`, avec son
meilleur checkpoint, roule sur les 5 circuits de test × μ ∈ {1,0 ; 0,8 ; 0,6} (activations
enregistrées pour les réseaux). Ce sont de vraies évaluations ; elles ne servent qu'à l'affichage
(Race Simulator, Championship) et vont dans `results/eval_showcase.csv`, sans remplacer aucun résultat.

| Condition | run_id montré | Tours bouclés /15 |
|---|---|---|
| Pilote classique | classic_ref | 15 |
| SAC | sac_multi_mufixe_s1_20261121-0335 | 7 |
| PPO μ aléatoire | ppo_multi_mualea_s0_20261120-2341 | 9 |
| DQN | dqn_multi_mufixe_s1_20261121-0148 | 7 |
| PPO sans pénalité (λ = 0) | ppo_multi_mufixe_s0_20261121-0020 | 5 |
| PPO μ fixe | ppo_multi_mufixe_s2_20261121-0123 | 4 |
| Q-Learning, SARSA, Monte-Carlo | s0 de chaque | 0 |

## Circuits de F1 réels (21/11/2026, `python -m tools.evaluate_f1`, après correction des checkpoints)

8 circuits (TUM racetrack-database, jamais vus à l'entraînement) × μ ∈ {1,0 ; 0,8 ; 0,6}, 1 épisode
déterministe, 6 000 pas maximum ; 24 runs (meilleur checkpoint) + pilote classique + pilote trajectoire
idéale (`raceline_ref`). Résultats : `results/eval_f1.csv`.

| Agent | Tours bouclés | Distance moyenne avant l'arrêt (meilleure graine, 24 épisodes) |
|---|---|---|
| Pilote trajectoire idéale | 24 / 24 | 99,9 % |
| Pilote classique | 23 / 24 (sortie à Monza, μ 0,6) | 96,5 % |
| PPO μ aléatoire | 0 / 72 | 27,9 % |
| SAC | 1 / 72 | 25,5 % |
| Q-Learning | 1 / 72 (Red Bull Ring, μ 1,0) | 21,0 % |
| DQN | 0 / 72 | 18,6 % |
| SARSA | 0 / 72 | 16,6 % |
| PPO sans pénalité (λ = 0) | 0 / 72 | 15,6 % |
| PPO μ fixe | 0 / 72 | 15,5 % |
| Monte-Carlo | 0 / 72 | 3,2 % |

Temps au tour du pilote trajectoire idéale, μ 1,0 (s) : Red Bull Ring 110,2 ; Zandvoort 127,8 ;
Hungaroring 133,0 ; Barcelone 134,7 ; Monza 136,2 ; Silverstone 152,8 ; Suzuka 155,4 ; Spa 177,6.
Il est plus rapide que le pilote classique sur tous les circuits et à toutes les adhérences
(de 4,5 % à Monza à 11,6 % à Silverstone, à μ 1,0).

Décision / lecture : échec de généralisation des agents RL sur les vrais circuits, alors que les deux
pilotes de référence y roulent sans problème (l'environnement n'est pas en cause). Causes probables :
pistes plus étroites (7,5 à 18 m, contre 12 m partout à l'entraînement), virages plus serrés (rayons de
10 à 18 m, contre 19 m au minimum) et chicanes après de longues lignes droites (ex. 16 % du tour à Monza
pour presque tous les agents : la première chicane, abordée à pleine vitesse). Piste : entraîner sur des
circuits générés plus variés (largeur, rayons, chicanes), ou sur une partie des circuits F1.

## Série v2 — préparation (21/11/2026)

| Date | run_id | Configuration | Graine | Résultat mesuré | Décision |
|---|---|---|---|---|---|
| 2026-11-21 | ppo_multi_mufixe_f1_s0_20261121-1404, sac_multi_mufixe_f1_s0_20261121-1404 (runs/_aborted/) | premiers essais v2 : voiture F1, 17 circuits réels, départs aléatoires, actions continues 3D, γ 0,99, sortie −10 | 0 | PPO 2,4 M pas : récompense d'évaluation bloquée ≈ 42, 0 tour ; diagnostic sur 6 départs : plein gaz (gaz moyen 0,96, frein 0,03), entrée en virage à 230–290 km/h pour une limite de 50–160 km/h ; SAC 200 000 pas : 0 tour | arrêtés ; corrections : action « pédale » (−1 frein … +1 gaz), sortie −(10 + 0,01 v²), γ 0,995 |
| 2026-11-21 | runs/_pilot/ (essais courts, configs v2 corrigées) | mesure de débit, réseaux 2 × 256 (PPO 4 env.) | 0 | pas/s (évaluations comprises) : PPO 1 436 ; DQN 1 381 ; Q-Learning 2 616 ; SARSA 2 514 ; Monte-Carlo 2 656 ; Deep MC 2 355 (début) ; Deep SARSA 411 ; TD3 183 ; QR-DQN 175 ; SAC 131 ; TQC 66. PPO 400 000 pas : la voiture roule (récompense 34, 0 tour) | budgets et files de tools/run_v2.sh (≈ 5 h 30 par graine en 3 files) ; lancement sur signal de l'étudiant |

## Réévaluation de la série v1 après les deux corrections des checkpoints (21/11/2026)

Mêmes runs et même protocole, après les corrections de l'environnement (saut de projection dans les
virages serrés ; checkpoint sur un sommet de la ligne centrale). Ces chiffres remplacent ceux des tableaux
précédents de la série v1 (les écarts sont faibles, les conclusions inchangées). Pilote trajectoire idéale
(`raceline_ref`) ajouté. Taux de tours sur les 5 circuits de test, moyenne des 3 graines :

| Condition | Dernier checkpoint μ 1,0 / 0,8 / 0,6 | Meilleur checkpoint μ 1,0 / 0,8 / 0,6 | Tours /135 (dernier / meilleur) |
|---|---|---|---|
| Pilote classique | 1,00 / 1,00 / 1,00 | — | 45 |
| Pilote trajectoire idéale | 1,00 / 1,00 / 1,00 | — | 45 |
| SAC | 0,67 / 0,67 / 0,00 | 0,87 / 0,60 / 0,00 | 66 / 67 |
| PPO μ fixe | 0,47 / 0,20 / 0,00 | 0,60 / 0,13 / 0,00 | 26 / 27 |
| PPO sans pénalité (λ = 0) | 0,40 / 0,20 / 0,00 | 0,60 / 0,27 / 0,00 | 28 / 37 |
| PPO μ aléatoire | 0,20 / 0,40 / 0,20 | 0,20 / 0,67 / 0,33 | 34 / 59 |
| DQN | 0,13 / 0,07 / 0,00 | 0,33 / 0,27 / 0,20 | 15 / 34 |
| Q-Learning / SARSA / Monte-Carlo | 0 / 0 / 0 | 0 / 0 / 0 | 2 / 6 / 0 |

## Série v2 — nuit du 21 au 22/11/2026 (en cours)

Lancée le 21/11 à 20 h 39 (`tools/run_v2.sh`, 3 files). En parallèle sur l'i3 (2 cœurs, 4 threads), les
débits sont bien plus bas que mesurés seuls : SAC 42 pas/s (au lieu de 131), TD3 57 (183), TQC ≈ 21 (66),
PPO ≈ 800 (1 436). Les 3 graines complètes auraient demandé ≈ 38 h de plus. **Décision de l'étudiant
(22/11, 8 h 50) : réduire** (`tools/run_v2_reduced.sh`) : graine 0 de toutes les conditions ; graines 1 et 2
pour PPO (3 variantes), TQC (500 000 pas au lieu de 1 M), DQN, Deep Monte-Carlo et les tabulaires ;
SAC, TD3, QR-DQN et Deep SARSA restent à une graine. td3_f1_s1 arrêté à 200 000 pas (runs/_aborted/).

État au 22/11 à 8 h 48 (récompense moyenne d'évaluation sur les circuits d'entraînement, 5 épisodes ;
« tours » = meilleur taux de tours vu pendant l'entraînement) :

| Condition | Graine | Pas | Récompense finale | Meilleure (au pas) | Tours max |
|---|---|---|---|---|---|
| ppo_f1_net64 | 0 | 3 M | 417,0 | 431,6 (2,4 M) | 0,6 |
| ppo_f1_mualea | 0 | 3 M | 309,9 | 373,0 (2,3 M) | 0,4 |
| ppo_f1 | 0 | 3 M | 33,5 | 43,3 (2,7 M) | 0 |
| ppo_f1 | 1 | 3 M | 386,3 | 399,3 (2,7 M) | 0,4 |
| ppo_f1_mualea | 1 | 3 M | 214,0 | 322,2 (2,2 M) | 0,2 |
| ppo_f1_net64 | 1 | 3 M | 217,0 | 217,0 (3 M) | 0,2 |
| tqc_f1 | 0 | 0,9 M (en cours) | 214,2 | 246,3 (0,7 M) | 0 |
| deep_mc_f1 | 0 | 1,5 M | 47,4 | 173,4 (1,4 M) | 0 |
| td3_f1 | 0 | 1 M | 36,6 | 36,6 (1 M) | 0 |
| qrdqn_f1 | 0 | 1,1 M (en cours) | 23,9 | 35,1 (0,9 M) | 0 |
| sac_f1 | 0 | 1 M | −6,6 | 30,8 (0,1 M) | 0 |

Premiers tours bouclés en série v2 (PPO). ppo_f1_s0 : politique bloquée (diagnostic sur 8 départs :
sorties de piste entre 7 et 21 % du tour, ou arrêt complet sur Shanghai). Grande variance entre graines.
Ces chiffres sont des évaluations d'entraînement ; l'évaluation sur les circuits F1 suivra.

## Série v2 — fin des entraînements et évaluation sur les 8 circuits F1 (22/11/2026)

Entraînements terminés à 17 h 52 (33 runs, 0 échec ; `tools/run_v2_reduced.sh`). Évaluation
`python -m tools.evaluate_f1 --series v2` (17 h 52 → 17 h 59) : meilleur checkpoint de chaque run (choisi sur
les évaluations d'entraînement), voiture F1_2024, 8 circuits F1 jamais vus × μ ∈ {1,0 ; 0,8 ; 0,6}, 1 épisode
déterministe depuis la ligne de départ, 6 000 pas max. Résultats : `results/eval_f1_v2.csv`, figures
`results/figures_v2/`.

**Tours bouclés** (24 essais par graine) :

| Condition | Graines | μ 1,0 | μ 0,8 | μ 0,6 | Total | Par graine (s0 / s1 / s2) |
|---|---|---|---|---|---|---|
| Pilote classique | — | 8/8 | 8/8 | 8/8 | 24/24 | — |
| Pilote trajectoire idéale | — | 8/8 | 8/8 | 7/8 | 23/24 | — (sortie à Suzuka, μ 0,6) |
| PPO μ variable (2 × 256) | 3 | 14/24 | 9/24 | 0/24 | **23/72** | 9 / 5 / 9 |
| PPO 2 × 64 (ablation) | 3 | 10/24 | 5/24 | 0/24 | 15/72 | 10 / 3 / 2 |
| PPO (2 × 256) | 3 | 7/24 | 4/24 | 0/24 | 11/72 | 0 / 11 / 0 |
| TQC | 3 (s0 : 1 M pas ; s1, s2 : 500 000) | 6/24 | 5/24 | 0/24 | 11/72 | 9 / 2 / 0 |
| Deep Monte-Carlo | 3 | 3/24 | 2/24 | 0/24 | 5/72 | 1 / 4 / 0 |
| DQN, Q-Learning, SARSA, Monte-Carlo | 3 | 0 | 0 | 0 | 0/72 chacun | — |
| SAC, TD3, QR-DQN, Deep SARSA | 1 | 0 | 0 | 0 | 0/24 chacun | — |

**Temps au tour** (tours bouclés seulement, rapport au pilote classique sur le même circuit et le même μ) :
PPO 2 × 64 × 1,42 en moyenne (1,19 à 1,65), PPO μ variable × 1,48, PPO × 1,51, TQC × 1,79, Deep MC × 2,91.
Aucun des 65 tours d'agents n'est plus rapide que le pilote classique. Temps de référence à μ 1,0 (classique /
trajectoire idéale, s) : Monza 100,5 / 91,4 ; Spa 128,4 / 113,7 ; Silverstone 120,6 / 95,7 ; Suzuka 113,7 / 98,5 ;
Hungaroring 102,4 / 89,5 ; Barcelone 101,8 / 88,6 ; Red Bull Ring 83,2 / 76,2 ; Zandvoort 94,2 / 83,4.

**Échecs** (épisodes sans tour) : Monte-Carlo tabulaire s'arrête presque toujours (67 « arrêt » sur 72 :
100 pas sans progrès, hypothèse de la voiture immobile confirmée) ; Deep SARSA idem (18/24) ; Deep MC roule
trop lentement (37 épisodes coupés à 6 000 pas) ; les autres sortent surtout de piste.

**Lecture.** (1) Par rapport à la série v1 (2 tours sur 576 essais sur ces circuits), la série v2 généralise :
5 conditions bouclent des tours sur des circuits F1 jamais vus. (2) Le meilleur est PPO entraîné avec μ variable,
le seul dont les 3 graines bouclent des tours ; c'est aussi le meilleur à μ 0,8. (3) À μ 0,6, aucun agent ne
boucle un tour (les deux pilotes de référence, qui connaissent μ, oui). (4) Le grand réseau n'aide pas PPO ici
(2 × 64 : 15/72, 2 × 256 : 11/72), mais 3 graines ne suffisent pas pour conclure. (5) Les agents sont prudents :
≈ 40 à 50 % plus lents que le pilote classique. (6) Bonne note à l'entraînement ≠ bonne généralisation :
TQC s2, meilleur TQC à l'entraînement, boucle 0/24 ; TQC s0 (0 % de tours à l'entraînement) en boucle 9/24.

Décision : série v2 close. Pistes si on continue : plus de graines pour PPO μ variable et TQC (1 M de pas) ;
μ variable pour TQC ; budget plus long pour PPO.

## Correction : évaluation v2 refaite depuis la ligne de départ (22/11/2026, soir)

Défaut trouvé grâce à l'application (les voitures ne partaient pas ensemble dans AI Championship) :
`agents/evaluate.py` reprenait la configuration d'entraînement, donc `env.random_start: true` — les agents
de la série v2 étaient évalués depuis un point de départ tiré au hasard (le tour complet était bien exigé,
mais pas depuis la ligne), alors que les pilotes de référence partaient de la ligne. Correctif : l'évaluation
force `random_start: false` (test `test_evaluation_starts_on_the_line_even_after_random_start_training`).
Même défaut pour l'évaluation pendant l'entraînement des tabulaires (`train_tabular`), corrigé pour les
prochains runs : leurs courbes progress.csv v2 viennent de départs aléatoires. Ancien fichier conservé :
`results/eval_f1_v2_depart_aleatoire.csv`. Nouvelle évaluation `results/eval_f1_v2.csv` (tous les départs
vérifiés identiques) :

| Condition | μ 1,0 | μ 0,8 | μ 0,6 | Total (avant correction) | Par graine |
|---|---|---|---|---|---|
| Pilote classique | 8/8 | 8/8 | 8/8 | 24/24 | — |
| Pilote trajectoire idéale | 8/8 | 8/8 | 7/8 | 23/24 | — |
| PPO μ variable | 13/24 | 9/24 | 0/24 | **22/72** (23) | 9 / 5 / 8 |
| PPO 2 × 64 | 10/24 | 5/24 | 0/24 | 15/72 (15) | 10 / 3 / 2 |
| TQC | 6/24 | 5/24 | 0/24 | 11/72 (11) | 10 / 1 / 0 |
| PPO 2 × 256 | 7/24 | 4/24 | 0/24 | 11/72 (11) | 0 / 11 / 0 |
| Deep Monte-Carlo | 3/24 | 4/24 | 0/24 | 7/72 (5) | 4 / 3 / 0 |
| Autres (DQN, QR-DQN, SAC, TD3, Deep SARSA, tabulaires) | 0 | 0 | 0 | 0 | — |

Temps au tour / pilote classique : PPO 2 × 64 × 1,43 ; PPO μ variable × 1,48 ; PPO × 1,52 ; TQC × 1,85 ;
Deep MC × 2,81 ; aucun tour d'agent plus rapide que le classique (0/66). Conclusions inchangées.

## Replays de démonstration série v2 (22/11/2026, soir)

`python -m tools.make_showcase --series v2` : pour chaque condition, la graine qui boucle le plus de tours sur
les circuits F1 (eval_f1_v2.csv), meilleur checkpoint, voiture F1, μ 1,0, sur les 17 circuits réels
d'entraînement et 6 nouveaux circuits générés à l'échelle F1 (`gen_f1_20` à `gen_f1_25`, 4,0–5,3 km, 14 m de
large, rayon ≥ 30 m, split « demo », jamais utilisés pour entraîner). Lignes : `results/eval_showcase_v2.csv`.
Tours bouclés (générés F1 /6, réels d'entraînement /17) : classique 6 + 17 ; trajectoire idéale 6 + 16 (sortie
à Austin) ; PPO 2 × 64 6 + 14 ; PPO 6 + 12 ; PPO μ variable 6 + 11 ; TQC 5 + 11 ; QR-DQN 5 + 2 ; Deep MC 1 + 4 ;
SAC 3 + 1 ; SARSA 2 + 1 ; DQN 1 + 1 ; TD3 0 + 1 ; Deep SARSA, Monte-Carlo, Q-Learning 0. Circuit le plus
facile : Indianapolis (9 agents sur 13) ; le plus difficile : Shanghai (aucun agent).
