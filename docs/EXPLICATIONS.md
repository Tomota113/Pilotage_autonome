# Explications, mission par mission

Ce fichier résume, après chaque mission, ce qui a été fait, pourquoi, et les
points à bien comprendre pour pouvoir les défendre.

## Mission 0 — squelette

- Arborescence décrite dans `CLAUDE.md`, plus `docs/` (ce fichier).
- `requirements.txt` liste toute la pile : NumPy (simulateur), Gymnasium
  (interface d'environnement), Stable-Baselines3 + PyTorch CPU (DQN, PPO, SAC),
  PyYAML (configurations), pandas + matplotlib (résultats), FastAPI + Uvicorn +
  websockets (Training Center), pytest (tests).
- PyTorch s'installe depuis l'index CPU : la version par défaut embarque CUDA
  (plusieurs Go) alors que le PC n'a pas de GPU utile.
- `runs/` et `results/` sont ignorés par git : ce sont des sorties régénérables,
  et chaque résultat reste rattaché à son `run_id` dans `experiments/JOURNAL.md`.

## Mission 1 — physique de la voiture (`sim/car.py`)

- Modèle de la bicyclette cinématique : deux roues (avant directrice, arrière fixe),
  état (x, y, psi, v, delta). L'angle beta = atan((l_r/L) tan delta) est la direction
  de la vitesse du centre de gravité par rapport au cap psi.
- `step(state, command, mu, dt=0.05, substeps=5)` : une décision de l'agent dure
  dt = 0,05 s et est découpée en 5 sous-pas de 0,01 s. Un pas physique court garde
  l'intégration d'Euler stable ; une décision plus longue rend l'apprentissage plus facile
  (moins de décisions par tour).
- Euler semi-implicite : on met à jour v d'abord, puis la position avec le nouveau v.
- Cercle de friction simplifié : si l'accélération latérale v²/R dépasse mu*g, la voiture
  ne suit plus le rayon demandé mais R_eff = v²/(mu g), plus large (sous-virage) ; `slip` le signale.
- Le freinage est plafonné à mu*g : sur piste glissante, on freine moins fort (test 5).
- Fonctions pures sur un état gelé : même entrée → même sortie, d'où le déterminisme.

## Mission 2 — pistes (`sim/track.py`, `tools/generate_tracks.py`, `tools/validate.py`)

- Un circuit = une ligne centrale fermée (points tous les 5 m) + largeur + mu en chaque point.
  Au chargement, on précalcule abscisse curviligne s, bords gauche/droit et courbure.
- `project(x, y, hint_index)` cherche le segment le plus proche seulement autour du segment
  du pas précédent (±10 segments = ±50 m) : la voiture avance d'au plus ~3 m par décision.
  Si le meilleur segment est au bord de la fenêtre, on refait une recherche complète (sécurité).
- Courbure signée (positive = virage à gauche) = angle entre deux segments / longueur,
  puis moyenne glissante sur 5 points (≈ 25 m) pour lisser le bruit de discrétisation.
  `curvature_ahead(s, d)` donne la courbure d mètres devant : c'est ce que « voit venir » l'agent.
- Générateur : courbe polaire r(theta) = R0 + somme_k a_k sin(k theta + phi_k), k = 2..10.
  Une courbe polaire avec r > 0 ne se recoupe pas ; on rejette en plus les circuits hors
  [1,5 ; 3] km, avec un rayon < 15 m ou deux portions éloignées à moins de 24 m.
  Même graine → même circuit (test). Rayons minimaux obtenus : 19 à 41 m.
- Les amplitudes ont été augmentées après un premier essai : avec a_k ≤ 0,35 R0/k, le rayon
  minimal était de 70 à 170 m, les agents n'auraient jamais eu besoin de freiner.
- `tools/validate.py` vérifie track.json, replay.json, config.yaml et eval.csv (code de sortie 1
  si invalide). Choix à confirmer avec le contrat de données : `mu.mode` vaut `fixed` ou `uniform`.

## Mission 3 — capteurs et sortie de piste (`sim/sensors.py`, `tools/benchmark.py`)

- 7 rayons (−90° à +90° par rapport au cap psi), portée 100 m. Intersection rayon/segment
  résolue avec deux produits vectoriels (t : distance le long du rayon, u ∈ [0, 1] : position
  sur le segment), pour tous les rayons et segments à la fois en NumPy.
- On ne teste que les segments à ±40 indices de la voiture : un rayon qui reste dans la piste
  sur 100 m avance d'au plus ≈ 167 m le long de la ligne centrale (au rayon minimal de 15 m).
  Un test vérifie que le résultat est identique à la recherche sur tout le circuit.
- Sortie de piste : |écart latéral| > demi-largeur locale ; un test vérifie le pas exact (61).
- Débit mesuré par `python -m tools.benchmark` sur l'i3-1115G4 : ≈ 10 000 pas/s sur gen_00
  (≈ 9 400 sur gen_06), objectif > 2 000 atteint sans optimisation. Les capteurs prennent
  ≈ 55 % du temps, la projection ≈ 31 %, la voiture ≈ 13 %.

## Mission 4 — environnement Gymnasium (`env/f1_env.py`)

- `F1Env` relie le simulateur au RL : observation (12 valeurs dans [-1, 1]), action (continue
  ou `discrete9`), récompense et fin d'épisode. Il est construit à partir des sections
  `env`, `reward` et `mu` de config.yaml (valeurs par défaut si absentes) et d'une liste de circuits.
- Toutes les briques sont des méthodes d'aide testées : `_compute_obs`, `_progress`,
  `_check_checkpoints`, `_compute_reward`, `_is_truncated`, `_info`... `reset()` et `step()`
  les appellent dans l'ordre, chaque étape est commentée (à savoir expliquer à l'oral :
  à la demande de l'étudiant, elles ont été écrites par Claude et non par lui).
- Δs est plafonné à ±(v dt + 1 m) : la voiture ne peut pas aller plus loin en une décision.
  Un Δs plus grand veut dire que la projection a « sauté » (virage coupé) : on ne le
  récompense pas et on ne valide aucun checkpoint sur ce pas.
- Checkpoints validés un par un dans l'ordre ; le 20e est la ligne d'arrivée = tour.
  Comme le suivant n'est cherché qu'après le précédent, en sauter un empêche de finir le tour.
- « Sans progrès » = `progress_m` ne dépasse plus son maximum : avancer-reculer ne remet
  pas le compteur à zéro.
- μ effectif = facteur de l'épisode (fixe ou tiré dans `range`) × μ local du circuit ; l'agent
  ne le voit pas, sauf avec `observe_mu` (13e valeur = μ / 1,5).
- Point d'attention : avec δ en radians, λ |Δδ| ≤ 0,05 × 0,1 = 0,005 par pas, très petit devant
  k Δs ≈ 0,1 à 0,3. L'ablation λ = 0 (mission 8) dira si ce terme change quelque chose.
- Tests : `check_env` de Gymnasium, marche arrière non récompensée, virage coupé sans
  checkpoint, arrêt tronqué après 100 pas, épisodes aléatoires qui finissent, tour complet de
  l'ovale. Débit de `env.step` complet (i3-1115G4, actions aléatoires) : ≈ 4 800 pas/s.

## Mission 5 — pilote classique et évaluation (`agents/classic_driver.py`, `agents/evaluate.py`)

- Pilote classique = référence non-RL ; il connaît μ et la géométrie, les agents non.
  Direction par poursuite de cible : on vise le point de la ligne centrale à L_d = max(10, 0,8 v)
  devant et on braque de δ = atan(2 L sin α / L_d) (arc de cercle passant par ce point).
- Vitesse : 0,9 √(μ g R) en virage ; pour un virage à d mètres, on peut aller à √(v_virage² + 2 μ g d)
  et freiner à temps. Cible = minimum sur 150 m. Mesuré : il boucle les 16 circuits à μ = 1,0 et 0,6.
- `evaluate.py` fait rouler une politique figée (classique, table Q, ou checkpoint SB3 en
  `deterministic=True`) sur circuits × μ × épisodes, écrit un replay.json validé par épisode et
  ajoute les lignes à `results/eval.csv`. Pour un checkpoint, il relit `runs/<run_id>/config.yaml`
  pour évaluer dans les conditions de l'entraînement.
- `--with-activations` : des « hooks » PyTorch recopient la sortie de chaque couche cachée à chaque
  décision (pour le Neural Network Explorer).
- Point d'attention : le départ est fixe et les politiques évaluées sont déterministes, donc
  plusieurs épisodes sur le même circuit et le même μ donnent exactement le même résultat.
- Premier vrai replay : `runs/classic_demo/` (tour de demo_oval en 33,7 s, noté dans le journal).

## Mission 7 — entraînement Deep RL (`agents/train.py`)

- `python -m agents.train configs/<fichier>.yaml [--steps N]` : valide la config, crée
  `runs/<run_id>/` avec la copie de la config réellement utilisée (`total_steps` compris), entraîne,
  sauvegarde `checkpoints/step_<N>.zip` et écrit `progress.csv`.
- PPO et SAC pilotent en actions continues, DQN en `discrete9` (DQN ne sait choisir que parmi un
  nombre fini d'actions). Les trois ont une politique MLP 2 × 64 (`net_arch`), réglages SB3 par
  défaut sauf `hyperparams`. Attention : SAC a 2 × 256 par défaut dans SB3, on le force à 2 × 64.
- Évaluation périodique déterministe (moyenne de la politique, sans exploration) sur les graines
  0..n−1 : toujours les mêmes épisodes, donc la courbe d'apprentissage est comparable d'un point à l'autre.
- Essai de vérification (20 000 pas, demo_oval, graine 0) : à 10 000 pas la politique boucle déjà
  l'ovale (66 s, 2 × plus lent que le pilote classique), puis à 20 000 pas elle sort de piste.
  C'est un seul essai court : il montre que la chaîne fonctionne, pas une performance.
