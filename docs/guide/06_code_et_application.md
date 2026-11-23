# 06 — Du code à l’écran

## Où trouver quoi

```text
sim/                     Physique et géométrie
env/                     Interface Gymnasium
agents/                  Politiques, entraînement et évaluation
tools/                   Configurations, circuits, évaluations groupées
tracks/                  Circuits JSON
configs/                 Réglages YAML
runs/<run_id>/           Configuration effective et fichiers d’un run
results/                 Résultats agrégés et figures
server/                  API FastAPI et connexion WebSocket
app/src/                 Pages React et dessins Canvas 2D
tests/                   Vérifications automatisées côté Python
experiments/JOURNAL.md   Historique des expériences
```

| Fichier | Rôle |
|---|---|
| [`sim/car.py`](../../sim/car.py) | Intègre le mouvement de la monoplace et définit les deux jeux de paramètres. |
| [`sim/track.py`](../../sim/track.py) | Charge les circuits, prépare leurs bords, projette la voiture et mesure la courbure. |
| [`sim/sensors.py`](../../sim/sensors.py) | Calcule les distances aux bords par lancer de rayons. |
| [`sim/raceline.py`](../../sim/raceline.py) | Calcule une trajectoire de faible courbure et son profil de vitesse. |
| [`env/f1_env.py`](../../env/f1_env.py) | Fournit `reset()` et `step()`, observations, récompenses et fins d’épisode. |
| [`agents/train.py`](../../agents/train.py) | Valide et copie la configuration, lance l’entraînement choisi, journalise les évaluations périodiques et organise les sauvegardes. |
| [`agents/tabular.py`](../../agents/tabular.py) · [`agents/discretize.py`](../../agents/discretize.py) | Table Q, exploration et évaluation partagées d’un côté. Transformation de l’observation en indice de table de l’autre. |
| [`agents/qlearning.py`](../../agents/qlearning.py) · [`agents/sarsa.py`](../../agents/sarsa.py) · [`agents/monte_carlo.py`](../../agents/monte_carlo.py) | Trois boucles et trois cibles pour mettre à jour la table. |
| [`agents/deep_value.py`](../../agents/deep_value.py) · [`agents/algorithms.py`](../../agents/algorithms.py) | Réseaux et boucles Deep SARSA et Deep MC. Sélection des classes de Stable-Baselines3 et sb3-contrib. |
| [`agents/classic_driver.py`](../../agents/classic_driver.py) · [`agents/raceline_driver.py`](../../agents/raceline_driver.py) | Pilotes programmés suivant, respectivement, la ligne centrale et la trajectoire idéale. |
| [`agents/evaluate.py`](../../agents/evaluate.py) | Recharge une politique, joue les épisodes déterministes, écrit les lignes CSV et peut enregistrer les replays. |
| [`tools/make_configs.py`](../../tools/make_configs.py) | Génère les configurations par condition et par graine. |
| [`tools/generate_tracks.py`](../../tools/generate_tracks.py) · [`tools/import_f1_tracks.py`](../../tools/import_f1_tracks.py) · [`tools/validate.py`](../../tools/validate.py) | Produit les tracés synthétiques, convertit les tracés TUM et vérifie les formats des fichiers. |
| [`tools/evaluate_all.py`](../../tools/evaluate_all.py) · [`tools/evaluate_f1.py`](../../tools/evaluate_f1.py) · [`tools/make_showcase.py`](../../tools/make_showcase.py) | Évalue des lots de runs, choisit les checkpoints disponibles, organise le test F1 et prépare les replays de démonstration. |
| [`server/app.py`](../../server/app.py) · [`app/src/data/api.js`](../../app/src/data/api.js) | Expose les fichiers et les routes côté Python. Le client JavaScript les charge pour les pages. |
| [`app/src/App.jsx`](../../app/src/App.jsx) · [`app/src/playback.jsx`](../../app/src/playback.jsx) | Définit le menu, sélectionne la page et installe l’état de lecture partagé entre les pages concernées. |

## Suivre un entraînement

```text
configs/<condition>_s<graine>.yaml
              |
              v
        agents.train ----> runs/<run_id>/config.yaml
              |
              +----------> progress.csv (évaluations périodiques)
              +----------> checkpoints/ (sauvegardes)
                                |
                                v
                         agents.evaluate
                                |
              +-----------------+-------------------+
              v                                     v
   results/eval*.csv                   runs/<run_id>/replays/*.json
              +-----------------+-------------------+
                                v
                  FastAPI puis interface React
```

1. **Configurer.** Le YAML précise l’algorithme, la graine, les circuits, la voiture, les actions, μ, la récompense et le budget en pas. Le point d’entrée est `python -m agents.train configs/ppo_mufixe_s0.yaml`. La copie dans le dossier du run conserve les réglages effectivement utilisés, y compris un budget remplacé en ligne de commande. [`agents/train.py`](../../agents/train.py)
2. **Entraîner.** La boucle interagit avec `F1Env`. Une autre instance sert à évaluer périodiquement la politique sur les circuits d’entraînement. Chaque ligne de `progress.csv` résume une évaluation et indique son pas. Les sauvegardes sont en `.zip` pour SB3 et sb3-contrib, en `.pt` pour Deep SARSA et Deep MC, et en `.npy` pour une table finale. [`agents/train.py`](../../agents/train.py) · [`agents/deep_value.py`](../../agents/deep_value.py)
3. **Évaluer.** `agents.evaluate` charge la sauvegarde et la config du run. Il rejoue les conditions imposées et écrit une ligne par épisode dans `results/eval.csv` par défaut. Les évaluations groupées produisent aussi `eval_best.csv`, `eval_f1.csv` et `eval_f1_v2.csv`. Chaque ligne relie le résultat à son run, son checkpoint, sa graine, son circuit et son facteur μ. [`agents/evaluate.py`](../../agents/evaluate.py) · [`tools/evaluate_all.py`](../../tools/evaluate_all.py) · [`tools/evaluate_f1.py`](../../tools/evaluate_f1.py)
4. **Rejouer et afficher.** Une image du replay contient l’observation qui a servi à choisir l’action, la commande appliquée et l’état obtenu après ce pas. Elle peut contenir les activations du réseau enregistrées pendant la décision et, pour les agents à valeurs Q (DQN, QR-DQN, Deep SARSA, Deep MC), les 9 valeurs Q qui ont servi à choisir l’action (`q_values`, format replay 1.4). FastAPI sert les fichiers sous `/files/` et liste les replays via `/replays`. React utilise le JSON pour dessiner la course et les CSV pour les graphiques. [`agents/evaluate.py`](../../agents/evaluate.py) · [`server/app.py`](../../server/app.py) · [`app/src/data/api.js`](../../app/src/data/api.js)

Les formats constituent un contrat entre Python et JavaScript. `track.json` décrit un circuit, `config.yaml` les réglages (version 1.3) et `replay.json` un épisode enregistré (version 1.4). Toute modification d’un format incrémente sa version, et les anciens fichiers restent valides tant qu’ils n’utilisent pas les nouveautés. Le CSV de progression agrège plusieurs épisodes par point d’évaluation. Le CSV d’évaluation conserve une ligne par épisode. Les dossiers `runs/` et `results/` contiennent des fichiers générés. [`docs/CONTEXTE_POUR_CLAUDE.md`, § 15](../CONTEXTE_POUR_CLAUDE.md#15-format-des-fichiers-contrat-de-données) · [`tools/validate.py`](../../tools/validate.py)

## Les sept pages

| Page | Ce qu’elle permet de montrer |
|---|---|
| **Accueil** | Une couverture de soutenance : la question du projet, quatre chiffres clés calculés depuis `results/eval_f1_v2.csv` et la boucle d’apprentissage en quatre étapes. |
| **Race Simulator** | Un épisode enregistré sur une piste dessinée (vibreurs, secteurs, piste mouillée à μ 0,8 et 0,6). Une **voiture fantôme** (pilote classique ou trajectoire idéale) roule en transparence avec l’écart en secondes au même point du tour. La **télémétrie** montre vitesse, volant et pédale selon la distance. On peut faire pause à l’entrée d’un virage et lire les capteurs. |
| **AI Championship** | Les meilleurs replays de chaque agent sur le même circuit : départ avec cinq feux, grille en épi (décalage seulement visuel, effacé juste après le départ), tour de chronométrage avec les écarts, caméra libre ou qui suit une voiture, podium final. Chaque voiture rejoue son propre épisode : elles ne se gênent pas. |
| **Performance Analytics** | Les résultats en sept onglets (tours bouclés, circuits, fins d’essai, chronos, adhérence, démonstration, apprentissage), avec la conclusion de chaque graphique, son mode de lecture et un tableau. |
| **Neural Network Explorer** | Le calcul du réseau image par image : les 12 entrées avec leur valeur physique, les deux couches de 256 neurones colorées selon leur activation, puis les sorties. Pour les agents à actions continues, un volant et une pédale ; pour les agents à 9 actions, les 9 valeurs Q avec l’action choisie (la plus haute). Les activations décrivent un calcul observé et ne suffisent pas à attribuer une cause à une décision. |
| **Track Designer** | L’édition d’une piste et sa validation. Avec le serveur, « Enregistrer et faire rouler les agents » enregistre la piste (`tracks/custom_*.json`) et y fait rouler les deux pilotes de référence et la meilleure graine de chaque algorithme ; la course apparaît ensuite dans AI Championship. |
| **Training Center** | La préparation d’une configuration, le lancement d’un entraînement via le serveur, le suivi des métriques et le visionnage d’un checkpoint disponible. |

Pour projeter en soutenance : le **mode présentation** (bouton en bas de la barre latérale ou touche **P**) agrandit les textes et renforce les contrastes, et les flèches ← → changent de page ; le bouton **Thème clair** convient à une salle éclairée ; la touche **F** met le circuit en plein écran.

Le Training Center envoie le YAML à `POST /runs`. FastAPI lance un processus d’entraînement, puis le WebSocket `/ws/runs/{run_id}` transmet les nouvelles métriques et les checkpoints. « Regarder en direct » rejoue un checkpoint dans un processus dédié. Le rendu de la page et son rafraîchissement sont indépendants de la boucle d’optimisation. [`server/app.py`](../../server/app.py) · [`app/src/App.jsx`](../../app/src/App.jsx) · [`docs/EXPLICATIONS.md`, missions 9 et 10](../EXPLICATIONS.md)
