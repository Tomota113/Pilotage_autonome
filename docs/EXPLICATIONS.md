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
