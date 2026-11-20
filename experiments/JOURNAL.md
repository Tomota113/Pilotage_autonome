# Journal des expériences

Chaque entraînement ou évaluation est noté ici, avec son `run_id`, sa
configuration et sa graine. Aucun résultat n'est inscrit sans provenir d'un
vrai run.

| Date | run_id | Configuration | Graine | Résultat mesuré | Décision |
|------|--------|---------------|--------|-----------------|----------|
| 2026-11-20 | classic_demo | pilote classique (`agents/classic_driver.py`), demo_oval, μ = 1,0, env par défaut (continuous, dt 0,05 s) | 0 | tour valide en 33,7 s, 674 pas, récompense 140,95, 0 sortie | premier vrai replay pour l'application ; évaluation de référence complète prévue en mission 8 |
| 2026-11-20 | classic_ref | pilote classique, `python -m tools.evaluate_all`, 15 circuits (gen_00–09 train, gen_10–14 test) × μ ∈ {1,0 ; 0,8 ; 0,6}, 1 épisode (politique déterministe) | 0 | 45/45 tours valides ; temps moyen test : 87,15 s (μ 1,0), 95,59 s (0,8), 108,43 s (0,6) ; train : 89,88 / 98,65 / 111,98 s ; à μ 0,6 le tour est 24,5 % plus long en moyenne (23,8 à 25,2 %) | référence non-RL pour les figures ; replays de démo sur gen_10 dans runs/classic_ref/ |
