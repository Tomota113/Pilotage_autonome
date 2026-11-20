# Journal des expériences

Chaque entraînement ou évaluation est noté ici, avec son `run_id`, sa
configuration et sa graine. Aucun résultat n'est inscrit sans provenir d'un
vrai run.

| Date | run_id | Configuration | Graine | Résultat mesuré | Décision |
|------|--------|---------------|--------|-----------------|----------|
| 2026-11-20 | classic_demo | pilote classique (`agents/classic_driver.py`), demo_oval, μ = 1,0, env par défaut (continuous, dt 0,05 s) | 0 | tour valide en 33,7 s, 674 pas, récompense 140,95, 0 sortie | premier vrai replay pour l'application ; évaluation de référence complète prévue en mission 8 |
