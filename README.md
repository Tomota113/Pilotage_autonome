# F1-RL Lab

Projet de L3 Intelligence Artificielle : des agents d'apprentissage par
renforcement profond apprennent à piloter une monoplace sur des circuits 2D.
Le projet compare plusieurs algorithmes (Q-Learning, DQN, PPO, SAC) à un
pilote classique et mesure leur robustesse à une baisse d'adhérence.

## Installation

Python 3.11 ou plus récent.

```bash
python3 -m venv .venv
source .venv/bin/activate
# PyTorch en version CPU (le PC n'a pas de GPU utile ; la version CUDA pèse plusieurs Go)
pip install torch --index-url https://download.pytorch.org/whl/cpu
pip install -r requirements.txt
```

## Lancer les tests

```bash
pytest
```

## Organisation

- `docs/EXPLICATIONS.md` : ce qui a été fait à chaque mission, et pourquoi.
- `CLAUDE.md` : arborescence, modèle physique, règles du projet.
- `experiments/JOURNAL.md` : journal des expériences.
