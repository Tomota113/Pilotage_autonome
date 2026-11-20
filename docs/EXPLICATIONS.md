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
