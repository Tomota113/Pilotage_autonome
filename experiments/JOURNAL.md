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
