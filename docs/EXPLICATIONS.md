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

## Mission 6 — Q-Learning tabulaire

- Trois distances aux bords, la vitesse et l’écart cap-piste sont regroupés en tranches pour obtenir 768 états.
- Chaque état désigne une ligne de la table Q, avec une colonne pour chacune des 9 actions de la voiture.
- Une politique ε-greedy explore avec une probabilité ε, qui décroît linéairement, et exploite sinon la meilleure valeur Q.
- La mise à jour de Bellman rapproche Q(s,a) de la récompense immédiate augmentée de la meilleure valeur future actualisée.
- `terminated` supprime ce terme futur. `truncated` interrompt l’épisode, mais la valeur de l’état suivant reste estimée.
- La boucle journalise des évaluations greedy sur les mêmes graines et la table peut être sauvegardée au format `.npy`.
- L’étudiant complète `act()` et `update()`, puis vérifie ses calculs et teste sa politique dans le couloir 1D.

## Mission 8 — expériences et résultats (`tools/`, `configs/`)

- Six conditions × graines 0, 1, 2 = 18 configs générées par `tools/make_configs.py` : PPO, DQN, SAC
  et Q-Learning à μ = 1, PPO à μ aléatoire dans [0,5 ; 1,1], et l'ablation PPO sans pénalité de braquage
  (λ = 0). Seule la variable étudiée change d'une condition à l'autre (même budget, circuits, récompense).
- Budget (STOP 2) : 1 M de pas par run, tout sur le PC de l'étudiant (i3-1115G4). Débits mesurés sur
  20 000 pas : PPO ≈ 1 240 pas/s, DQN ≈ 1 210, SAC ≈ 190. Estimation pour 1 M de pas : PPO et DQN
  ≈ 15-20 min, SAC ≈ 1 h 30 ; les 18 runs ≈ 8 à 9 h au total, soit une à deux nuits.
- `tools/run_night.sh` enchaîne les entraînements (journal par run dans `runs/_logs/`, reprise après
  coupure grâce aux fichiers `.done`, un échec n'arrête pas la file).
- `tools/evaluate_all.py` évalue le dernier checkpoint de chaque run, et le pilote classique, sur les
  circuits d'entraînement et de test × μ ∈ {1,0 ; 0,8 ; 0,6} ; replays de démo sur gen_10 avec activations.
- `tools/plots.py` ne lit que des fichiers réels (`progress.csv`, `eval.csv`) ; chaque figure cite sa
  source et le nombre de graines. Moyenne ± écart-type entre graines : avec 3 graines, l'écart-type
  est indicatif, il faut le dire à l'oral.
- Non faits, car inutiles avec ce choix : le notebook Colab (Claude ne peut pas piloter Colab) et le
  script Windows `.ps1` (tout tourne sur le PC Linux).

## Mission 9 — serveur

- `uvicorn server.app:app` lance le Training Center. `F1RL_ROOT` désigne la racine des données.
- `POST /runs` valide le YAML et transmet au processus d’entraînement l’identifiant calculé par `make_run_id`.
- Le YAML temporaire passe par `runs/_queue/` et la sortie de l’entraînement est conservée dans `runs/_logs/`.
- Le serveur suit les processus qu’il a lancés et leur envoie `SIGTERM`, puis `SIGKILL` après deux secondes si nécessaire.
- `/files/tracks`, `/files/runs` et `/files/results` servent les fichiers en lecture seule.
- Le WebSocket transmet les nouvelles lignes de progression et les checkpoints ainsi que les changements d’état.
- `watch_live` rejoue un checkpoint dans un processus dédié et transmet les frames du contrat à 20 images/s.

## Mission 10 — application (partie Codex)

- L’éditeur modifie la ligne centrale, la largeur et l’adhérence par portion, puis valide le circuit avant de télécharger `track.json`.
- L’analyse groupe les runs par condition et compare les graines aux pas d’évaluation communs.
- Les barres résument les épisodes filtrés par algorithme, en donnant le même poids à chaque graine.
- Le centre génère le YAML de la configuration et suit les entraînements et les checkpoints par WebSocket.
- En mode fixtures, la configuration reste disponible et le lancement exige le serveur FastAPI.

## Mission 10 — application (partie Claude)

- `app/` : React + Vite + Canvas 2D, une page par module, navigation latérale, thème sombre.
  Les données viennent du serveur (`/files/...`, `/runs`, `/tracks`) ; sans serveur, l'application lit
  les `fixture_*.json` (données synthétiques de `app/scripts/make_fixtures.py`) et affiche un bandeau
  « FIXTURE » sur toutes les pages.
- Race Simulator : circuit, voiture orientée, rayons des capteurs, trajectoire, vitesse, chrono, jauges
  direction / accélérateur / frein, lecture ×0,5 à ×8 et curseur temporel. Le replay choisi est partagé
  avec le Neural Network Explorer (même image affichée dans les deux modules).
- AI Championship : replays d'un même circuit superposés (voitures fantômes de couleurs fixes),
  classement par temps au tour, trajectoires affichables.
- Neural Network Explorer : 12 entrées nommées, couches cachées (couleur divergente bleu / gris / orange),
  sorties ; mention « représentation pédagogique, pas une explication causale ».
- Vérifié dans Chrome (captures) : Race Simulator et Championship sur les vrais replays du pilote
  classique, lancement d'un essai PPO de 4 000 pas depuis le Training Center et visionnage en direct.

## Q-Learning : `act()` et `update()` (écrits par Claude, à la demande de l'étudiant)

- `act()` : en évaluation (`greedy=True`), toujours argmax Q(s, ·) pour un résultat reproductible.
  En entraînement : avec probabilité ε(step) une action au hasard (exploration), sinon la meilleure
  action ; les égalités sont départagées au hasard, car au début toute la table vaut 0 et argmax
  choisirait toujours l'action 0 (« gauche + accélérer »).
- `update()` : cible de Bellman r + γ max_a' Q(s', a'), ou r seul si `terminated` (sortie de piste ou
  tour validé : il n'y a plus d'avenir). Une troncature (temps limite) n'est pas une vraie fin, l'état
  suivant garde sa valeur. Puis Q(s, a) ← Q(s, a) + α (cible − Q(s, a)).
- Vérification : sur le couloir 1D, la politique apprise va à droite depuis chaque case (test).
  Débit mesuré sur le vrai environnement : ≈ 4 000 pas/s, soit ≈ 5 min pour 1 M de pas.

## SARSA et Monte-Carlo (ajoutés le 21/11/2026, à la demande de l'étudiant)

- Deux nouvelles méthodes tabulaires, sur le même état discrétisé (768 états) et les mêmes actions
  `discrete9` que le Q-Learning. `agents/tabular.py` regroupe ce qu'elles partagent : table Q,
  ε-greedy, sauvegarde `.npy`, évaluation périodique. Seule la mise à jour de Q change :
  - Q-Learning (hors politique) : cible r + γ max_a' Q(s', a') — la meilleure action suivante ;
  - SARSA (sur politique) : cible r + γ Q(s', a') avec a' l'action ε-greedy réellement jouée ensuite.
    SARSA apprend la valeur de la politique qui explore, donc plus prudente près des bords ;
  - Monte-Carlo (première visite) : pas de bootstrap ; à la fin de l'épisode, Q(s, a) est corrigé vers
    le retour réellement obtenu G_t = r_t + γ r_{t+1} + … (moins biaisé, plus variable, apprentissage
    seulement en fin d'épisode ; un épisode tronqué a un retour coupé).
- Contrat de données passé en version 1.1 (config.yaml, replay.json) pour autoriser `sarsa` et
  `montecarlo` ; les fichiers 1.0 restent valides avec les anciens algorithmes (règle 5 de CLAUDE.md).
- Conditions `sarsa_mufixe` et `montecarlo_mufixe` × graines 0, 1, 2 : 24 configurations au total.
  Débit mesuré (20 000 pas, pendant qu'un PPO tournait) : ≈ 2 750 pas/s, soit ≈ 6 min pour 1 M de pas.

## Meilleur checkpoint (`tools/evaluate_all.py --checkpoint best`)

- Les courbes d'apprentissage oscillent : le dernier checkpoint n'est pas forcément le meilleur.
  On choisit donc, pour chaque run, le checkpoint de la meilleure évaluation faite pendant
  l'entraînement (taux de tours, puis récompense), sur les circuits d'entraînement seulement.
- Pourquoi pas sur les circuits de test : choisir sur le test puis y mesurer le résultat serait tricher
  (le score serait optimiste). Ici, le test reste une mesure indépendante.
- Résultats dans `results/eval_best.csv`, figures dans `results/figures_best/` ; les résultats du
  dernier checkpoint restent dans `results/eval.csv` et `results/figures/`.
