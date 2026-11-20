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
