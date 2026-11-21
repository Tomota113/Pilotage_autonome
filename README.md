# F1-RL Lab

Projet de L3 Intelligence Artificielle : des agents d'apprentissage par
renforcement profond apprennent à piloter une monoplace sur des circuits 2D.
Le projet compare plusieurs algorithmes (Q-Learning, DQN, PPO, SAC) à un
pilote classique et mesure leur robustesse à une baisse d'adhérence.

## Installation

Python 3.11 ou plus récent, Node.js 18 ou plus récent (pour l'application).

```bash
python3 -m venv .venv
source .venv/bin/activate
# PyTorch en version CPU (le PC n'a pas de GPU utile ; la version CUDA pèse plusieurs Go)
pip install torch --index-url https://download.pytorch.org/whl/cpu
pip install -r requirements.txt
npm --prefix app install
```

Toutes les commandes `python`, `pytest` et `uvicorn` ci-dessous supposent l'environnement
activé : taper `source .venv/bin/activate` dans le terminal (avec `source` : le fichier ne
s'exécute pas directement). Sinon, un autre Python du PATH (par exemple celui de
PlatformIO) est utilisé et il manque les dépendances : préfixer alors par `.venv/bin/`.

## Lancer les tests

```bash
pytest                 # Python (simulateur, environnement, agents, serveur)
npm --prefix app test  # parties pures de l'application
```

## Commandes principales

| But | Commande |
|-----|----------|
| Régénérer les circuits | `python -m tools.generate_tracks` |
| Vérifier un fichier du contrat | `python tools/validate.py tracks/*.json results/eval.csv` |
| Mesurer le débit du simulateur | `python -m tools.benchmark` |
| Régénérer les 24 configurations | `python -m tools.make_configs` |
| Un entraînement | `python -m agents.train configs/ppo_mufixe_s0.yaml` (`--steps 20000` pour un essai court) |
| Les entraînements de la nuit | `systemd-inhibit --what=sleep tools/run_night.sh` (reprend là où il s'est arrêté) |
| Une partie seulement | `tools/run_night.sh configs/sac_*.yaml` |
| Évaluer un checkpoint | `python -m agents.evaluate runs/<run_id>/checkpoints/step_1000000.zip --tracks gen_10 --mu 1.0 0.6 --with-activations` |
| Évaluer tous les runs + le pilote classique | `python -m tools.evaluate_all` |
| Figures | `python -m tools.plots` (PNG dans `results/figures/`) |
| Serveur + application (développement) | `tools/start_app.sh` puis http://localhost:5173 (Ctrl+C arrête les deux) |
| Application compilée, une seule adresse | `npm --prefix app run build` (une fois) puis `.venv/bin/uvicorn server.app:app --port 8000` et http://localhost:8000 |

Sans serveur, l'application affiche des données factices `fixture_*.json`,
signalées « FIXTURE » à l'écran : elles ne doivent jamais servir en démonstration.

## Circuits de F1 réels

Les 8 circuits `tracks/f1_*.json` (Monza, Spa, Silverstone, Suzuka, Hungaroring, Barcelone,
Red Bull Ring, Zandvoort) sont convertis par `python -m tools.import_f1_tracks` depuis la base
publique **racetrack-database** de l'Université technique de Munich (TUM FTM,
https://github.com/TUMFTM/racetrack-database), sous licence LGPL-3.0 : voir
`data/f1_tracks_tum/SOURCE.md`. Évaluation de tous les agents : `python -m tools.evaluate_f1`.

## Organisation

- `docs/EXPLICATIONS.md` : ce qui a été fait à chaque mission, et pourquoi.
- `CLAUDE.md` : arborescence, modèle physique, règles du projet.
- `experiments/JOURNAL.md` : journal des expériences (chaque run réel, avec son `run_id`).
