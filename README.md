# F1-RL Lab

Projet de L3 Intelligence Artificielle : des agents d'apprentissage par
renforcement profond apprennent à piloter une monoplace sur des circuits 2D.
Le projet compare plusieurs algorithmes (Q-Learning, DQN, PPO, SAC) à un
pilote classique et mesure leur robustesse à une baisse d'adhérence.

État actuel : le simulateur est écrit (physique de la voiture `sim/car.py`,
piste `sim/track.py`, capteurs `sim/sensors.py`) ; l'environnement Gymnasium
n'existe pas encore.

## Installation

Python 3.11 ou plus récent.

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Lancer les tests

```bash
pytest
```

## Organisation

Voir `CLAUDE.md` (arborescence, modèle physique, règles du projet) et
`experiments/JOURNAL.md` (journal des expériences).
