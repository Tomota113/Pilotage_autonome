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
| Régénérer les 18 configurations | `python -m tools.make_configs` |
| Un entraînement | `python -m agents.train configs/ppo_mufixe_s0.yaml` (`--steps 20000` pour un essai court) |
| Les entraînements de la nuit | `systemd-inhibit --what=sleep tools/run_night.sh` (reprend là où il s'est arrêté) |
| Une partie seulement | `tools/run_night.sh configs/sac_*.yaml` |
| Évaluer un checkpoint | `python -m agents.evaluate runs/<run_id>/checkpoints/step_1000000.zip --tracks gen_10 --mu 1.0 0.6 --with-activations` |
| Évaluer tous les runs + le pilote classique | `python -m tools.evaluate_all` |
| Figures | `python -m tools.plots` (PNG dans `results/figures/`) |
| Serveur du Training Center | `uvicorn server.app:app --port 8000` |
| Application (développement) | `npm --prefix app run dev` puis http://localhost:5173 (avec le serveur lancé) |

Sans serveur, l'application affiche des données factices `fixture_*.json`,
signalées « FIXTURE » à l'écran : elles ne doivent jamais servir en démonstration.

## Organisation

- `docs/EXPLICATIONS.md` : ce qui a été fait à chaque mission, et pourquoi.
- `CLAUDE.md` : arborescence, modèle physique, règles du projet.
- `experiments/JOURNAL.md` : journal des expériences (chaque run réel, avec son `run_id`).
