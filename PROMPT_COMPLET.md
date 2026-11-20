# F1-RL Lab — prompt complet pour Claude Code

Lis d'abord `CLAUDE.md` (règles, modèle physique, MDP). Ce fichier-ci donne
TOUT le travail, découpé en missions. Enchaîne-les dans l'ordre, sans attendre
de validation, SAUF aux trois points d'arrêt marqués « STOP ».

## Règles d'exécution

- Une mission = des fichiers + des tests pytest qui passent + un commit en français.
- Lance réellement les tests et montre leur résultat. Ne dis jamais qu'un test
  passe, qu'un entraînement a tourné ou qu'un chiffre a été mesuré sans l'avoir fait.
- Si un test échoue, explique la cause avant de modifier quoi que ce soit.
- Aucun résultat inventé : pas de faux chiffres, pas de fausses courbes.
  Les seules données factices autorisées sont les `fixture_*.json` de l'application.
- PC cible : Intel Core i3, sans GPU. Code NumPy vectorisé, aucun affichage pendant
  l'entraînement, réseaux 2 × 64. Ne lance JAMAIS d'entraînement long toi-même :
  seulement des essais courts (≤ 20 000 pas) pour vérifier que le code tourne.
- À la fin de chaque mission, ajoute 5 à 10 lignes en français dans
  `docs/EXPLICATIONS.md` : ce qui a été fait, pourquoi, et les points à comprendre.
- Fichiers que l'étudiant écrit lui-même : `agents/qlearning.py` (cœur de
  l'algorithme) et le corps de `reset()` / `step()` dans `env/f1_env.py`.
  Pour eux : prépare la structure, les signatures, des docstrings détaillées,
  des `raise NotImplementedError("À écrire par l'étudiant : ...")` et les tests.
  Tout le reste, tu l'écris.

---

## Mission 0 — squelette

- Arborescence de `CLAUDE.md`, plus `docs/`.
- `requirements.txt` : numpy, gymnasium, stable-baselines3, torch (CPU), pyyaml,
  pandas, matplotlib, pytest, fastapi, uvicorn[standard], websockets.
- `.gitignore` (Python, `.venv`, `runs/`, `results/`, `__pycache__`, `node_modules`).
- `README.md` en français : but, installation (venv, `pip install -r requirements.txt`,
  torch CPU), lancement des tests.
- `experiments/JOURNAL.md` : tableau date | run_id | configuration | graine | résultat | décision.
- `git init` + commit.

## Mission 1 — physique de la voiture (`sim/car.py`)

État : $x, y$ (m), $\psi$ (rad), $v$ (m/s), $\delta$ (rad).
`CarParams` (dataclass) : $L=3{,}6$ ; $l_r=1{,}8$ ; $a_{max}=10$ ; $b_{max}=15$ ;
$c_d=0{,}0025$ ; $\delta_{max}=0{,}4$ ; $\dot\delta_{max}=2{,}0$ ; $g=9{,}81$.

`step(state, command, mu, dt=0.05, substeps=5)` avec `command = (steer, throttle, brake)`,
steer ∈ [-1, 1], throttle et brake ∈ [0, 1]. Sous-pas de 0,01 s, Euler semi-implicite
(v d'abord, puis la position). Renvoie le nouvel état et `slip` (bool).

- Braquage visé $\delta^* = \text{steer}\cdot\delta_{max}$ ; $\delta$ s'en approche à vitesse ≤ $\dot\delta_{max}$.
- $\dot v = \text{throttle}\cdot a_{max} - \text{brake}\cdot b_{max} - c_d v^2$ ; décélération de freinage
  plafonnée à $\mu g$ ; $v \ge 0$.
- $\beta = \arctan\left(\frac{l_r}{L}\tan\delta\right)$, $R = \frac{l_r}{\sin\beta}$.
- Si $\frac{v^2}{R} > \mu g$ : $R_{eff} = \frac{v^2}{\mu g}$, `slip = True` (on recalcule β à partir de $R_{eff}$).
- $\dot x = v\cos(\psi+\beta)$, $\dot y = v\sin(\psi+\beta)$, $\dot\psi = \frac{v}{l_r}\sin\beta$.

Tests (`tests/test_car.py`) :
1. throttle = 1 longtemps → $v \to \sqrt{a_{max}/c_d} \approx 63{,}2$ m/s (à 1 %).
2. v = 0, steer = 1 → ψ inchangé.
3. δ = 0,05 rad, v = 20 m/s → $\dot\psi \approx 0{,}278$ rad/s.
4. μ = 1, R visé = 50 m : v = 30 → slip ; v = 20 → pas de slip.
5. Distance de freinage de 60 à 22 m/s plus longue à μ = 0,6 qu'à μ = 1,0.
6. |δ| ≤ δ_max et |Δδ| ≤ δ̇_max·dt.
7. Déterminisme.

## Mission 2 — pistes (`sim/track.py`, `tools/generate_tracks.py`, `tools/validate.py`)

Format `track.json` (schema `f1rl.track/1.0`) :
```json
{"schema":"f1rl.track/1.0","id":"gen_00","name":"Générée 00","split":"train","seed":0,
 "centerline":[[x,y],...],"width":[12.0,...],"mu":[1.0,...],
 "start":{"index":0,"heading":0.0},"checkpoints":[0,...],"length":2150.4}
```
- `centerline`, `width`, `mu` : même longueur (≥ 50 points, espacés d'environ 5 m), boucle fermée.
- 20 checkpoints, indices croissants, le premier = `start.index`.

Classe `Track` : chargement + validation ; abscisse curviligne cumulée $s_i$ ; bords
gauche/droit (segments) ; courbure signée en chaque point (lissée) ; méthode
`project(x, y, hint_index)` → (index du segment, s, écart latéral signé, angle de la piste),
cherchée dans une fenêtre autour de `hint_index` pour rester rapide ; `curvature_ahead(s, d)`.

Générateur : circuit fermé aléatoire à partir d'une graine (rayon polaire
$r(\theta) = R_0 + \sum_k a_k\sin(k\theta+\varphi_k)$, lissé, rééchantillonné tous les 5 m),
longueur 1,5 à 3 km, largeur 12 m, rayon de courbure minimal ≥ 15 m, sans
auto-intersection (sinon on rejette et on retire). Produit `gen_00`…`gen_09` (train),
`gen_10`…`gen_14` (test), et un circuit `demo_oval` simple.

`tools/validate.py <fichier>` : vérifie track.json, replay.json, config.yaml, eval.csv
selon ce document ; code de sortie ≠ 0 si invalide.

Tests : longueur calculée cohérente, projection exacte sur un cercle de rayon connu,
courbure ≈ 1/R sur un cercle, circuits générés valides et déterministes par graine.

## Mission 3 — capteurs et sortie de piste (`sim/sensors.py`)

- 7 rayons à −90°, −60°, −30°, 0°, +30°, +60°, +90° par rapport à ψ, portée 100 m.
- Intersection rayons × segments des bords, vectorisée NumPy, limitée aux segments
  proches (fenêtre autour de l'index courant). Renvoie les distances en m.
- Sortie de piste : |écart latéral| > demi-largeur locale.
- `tools/benchmark.py` : mesure les pas de simulation par seconde (voiture + capteurs + projection)
  et l'affiche. Objectif indicatif : > 2 000 pas/s sur un i3 ; si c'est moins, profile et optimise.

Tests : sur une ligne droite de largeur 12 m centrée, rayons latéraux = 6 m ;
rayon avant sur un mur connu ; sortie détectée au bon moment.

## Mission 4 — environnement Gymnasium (`env/f1_env.py`)

`F1Env(gymnasium.Env)` construit depuis un dict de config (section `env` + `reward` + `mu`
de config.yaml) et une liste de circuits.

- Observation (12 floats, `Box(-1, 1)`) : 7 capteurs / 100 ; v / 63 ; angle cap-piste / π ;
  écart latéral / demi-largeur (clip) ; courbure à 30 m et à 80 m × 10 (clip).
  Si `observe_mu: true`, ajoute μ (13 floats).
- Actions : `continuous` → `Box([-1,0,0],[1,1,1])` ; `discrete9` → `Discrete(9)` =
  {gauche, droit, droite} × {accélérer, roue libre, freiner}, table de correspondance explicite.
- `reset(seed)` : tire un circuit (aléatoire parmi la liste), tire μ (`fixed` ou uniforme dans
  `range`), place la voiture au départ à v = 0.
- `step(action)` : applique la commande via `sim.car.step`, calcule l'observation,
  la récompense, la fin :
  $r_t = k\,\Delta s - c - P_{sortie}\,\mathbb{1}_{sortie} + B_{tour}\,\mathbb{1}_{tour} - \lambda\,|\Delta\delta|$
  avec Δs = progression projetée, plafonnée à $v\,dt + 1$ m, négative si marche arrière ;
  checkpoints franchis dans l'ordre ; tour valide = tous franchis + retour à la ligne.
  `terminated` : sortie de piste ou tour valide. `truncated` : `max_steps` ou `stall_steps` sans progression.
  `info` : progress, checkpoint, slip, off_track, lap_time, mu.
- Valeurs par défaut : k = 0,1 ; c = 0,01 ; P = 10 ; B = 50 ; λ = 0,05.
- Rappel : corps de `reset()` / `step()` = squelette commenté + `NotImplementedError`
  pour l'étudiant. Écris toutes les fonctions d'aide (`_compute_obs`, `_compute_reward`,
  `_check_checkpoints`...) avec leurs tests, pour que `step()` se résume à les appeler.
  Fournis aussi `env/reference_impl.py` NON importé par défaut, que l'étudiant ne lira
  qu'après avoir essayé (dis-le dans la docstring).

Tests : `gymnasium.utils.env_checker.check_env` passe (avec l'implémentation de référence
activée par une option de test) ; marche arrière non récompensée ; couper un virage ne
valide pas de checkpoint ; un épisode d'actions aléatoires finit toujours.

### STOP 1
Résume l'état du projet, la vitesse mesurée par `benchmark.py`, et attends que
l'étudiant ait écrit `reset()` / `step()` et que les tests passent avec SON code.

## Mission 5 — pilote classique et évaluation

`agents/classic_driver.py` : poursuite de cible (*pure pursuit*) sur la ligne centrale,
distance de visée $L_d = \max(10, 0{,}8\,v)$ ; vitesse cible = min sur les 150 m à venir
de $0{,}9\sqrt{\mu g R}$, avec anticipation du freinage ($d = \frac{v^2 - v_{cible}^2}{2\mu g}$).
Il connaît μ et la géométrie : c'est la référence non-RL.

`agents/evaluate.py` : charge un agent (classic, qlearning, ou checkpoint SB3), le fait rouler
politique figée sur une liste de circuits × facteurs μ × N épisodes, écrit :
- `replay.json` (schema `f1rl.replay/1.0`) :
```json
{"schema":"f1rl.replay/1.0","run_id":"...","agent":{"algo":"ppo","checkpoint":"step_1000000","train_steps":1000000},
 "track_id":"gen_10","mu_factor":0.6,"seed":0,"dt":0.05,
 "network":{"layers":[12,64,64,3],"activation":"tanh"},
 "frames":[{"t":0.05,"x":0,"y":0,"psi":0,"v":0,"delta":0,
            "action":{"steer":0,"throttle":0,"brake":0},
            "obs":[...],"sensors_m":[...],"progress":0.0,"checkpoint":0,
            "reward":0.0,"slip":false,"off_track":false,
            "activations":[[...],[...]]}],
 "summary":{"outcome":"lap","lap_time":52.4,"total_reward":131.7,"steps":1048,"off_tracks":0}}
```
  `outcome` ∈ lap | off_track | timeout | stalled ; `lap_time` = null sans tour valide ;
  `activations` seulement avec `--with-activations` (hooks PyTorch sur les couches cachées
  de la politique SB3), absent pour classic et qlearning.
- `results/eval.csv` (ajout de lignes) : run_id, algo, seed, mu_mode, checkpoint, track_id,
  split, mu_factor, episode, outcome, lap_time, total_reward, steps, offtracks, replay_path.

Test réel : le pilote classique boucle `demo_oval` à μ = 1. Produit son replay dans
`runs/classic_demo/` : c'est le premier vrai replay pour l'application.

## Mission 6 — Q-Learning tabulaire (préparé pour l'étudiant)

- `agents/discretize.py` (écrit par toi) : état réduit = 3 capteurs (−45°, 0°, +45°) en 4 tranches,
  vitesse en 4 tranches, angle cap-piste en 3 tranches → 4³·4·3 = 768 états ; actions `discrete9`.
- `agents/qlearning.py` : squelette (table Q en NumPy, ε-greedy, mise à jour
  $Q(s,a) \leftarrow Q(s,a) + \alpha\,[r + \gamma \max_{a'} Q(s',a') - Q(s,a)]$) avec
  `NotImplementedError` aux endroits clés ; boucle d'entraînement, sauvegarde `.npy`,
  écriture de `progress.csv` déjà faites par toi.
- Tests sur un mini-environnement jouet (couloir 1D) que tu écris, pour que l'étudiant
  vérifie son algorithme avant de l'utiliser sur la voiture.

## Mission 7 — entraînement Deep RL (`agents/train.py`)

`python -m agents.train configs/<fichier>.yaml` :
- lit config.yaml (format ci-dessous), copie la config dans `runs/<run_id>/` ;
  `run_id = <algo>_<circuit ou "multi">_<mufixe|mualea>_s<graine>_<AAAAMMJJ-HHMM>` ;
- crée l'environnement (`DummyVecEnv`, 1 ou 2 copies selon `n_envs`, normalisation des
  observations inutile car déjà dans [−1, 1]) ;
- PPO/SAC en actions continues, DQN en `discrete9`, politique MLP 2 × 64 ;
  hyperparamètres SB3 par défaut sauf `hyperparams` ;
- callback : checkpoint tous les `checkpoint_every` pas ; évaluation tous les `eval_every` pas
  sur `eval_episodes` épisodes (politique déterministe) → ligne dans `runs/<run_id>/progress.csv` :
  run_id, algo, seed, mu_mode, step, wall_time_s, mean_reward, std_reward, lap_rate,
  mean_lap_time, offtracks_per_ep ;
- `--steps N` pour surcharger `total_steps` (essais courts).

Format config.yaml (schema `f1rl.config/1.0`) :
```yaml
schema: f1rl.config/1.0
algo: ppo            # qlearning | dqn | ppo | sac | classic
seed: 0
total_steps: 1000000
n_envs: 1
tracks: {train: [gen_00, ..., gen_09], test: [gen_10, ..., gen_14]}
mu: {mode: fixed, value: 1.0, range: [0.5, 1.1]}
env: {dt: 0.05, action_repeat: 5, action_space: continuous, max_steps: 3000, stall_steps: 100, observe_mu: false}
reward: {k_progress: 0.1, c_time: 0.01, p_offtrack: 10.0, b_lap: 50.0, lambda_steer: 0.05}
hyperparams: {}
checkpoint_every: 50000
eval_every: 50000
eval_episodes: 5
```

Vérification : un essai PPO de 20 000 pas sur `demo_oval` tourne de bout en bout et écrit
progress.csv + un checkpoint. Mesure et note le débit réel (pas/s) de l'entraînement PPO.

### STOP 2
Montre le débit mesuré et calcule, pour chaque algorithme, la durée estimée d'un
entraînement de 1 million de pas sur ce PC. Propose le budget de pas et la répartition
PC / PC de Youmah / Colab. Attends la validation avant la mission 8.

## Mission 8 — expériences et résultats

- `configs/` : une config par condition : ppo_mufixe, ppo_mualea, dqn_mufixe, sac_mufixe,
  qlearning_mufixe ; graines 0, 1, 2 générées par `tools/make_configs.py`.
- `tools/run_night.sh` (et `.ps1` pour Windows) : lance une file d'entraînements à la suite.
- `notebooks/colab_sac.ipynb` : clone le dépôt, installe, lance SAC, renvoie `runs/` vers Drive.
- `tools/evaluate_all.py` : évalue chaque run final sur les circuits de test × μ ∈ {1,0 ; 0,8 ; 0,6}
  + le pilote classique, remplit `results/eval.csv`, enregistre les replays de démo.
- `tools/plots.py` (matplotlib) : courbes d'apprentissage moyenne ± écart-type entre graines ;
  temps au tour et taux de tours par algorithme ; robustesse selon μ ; train vs test.
  PNG dans `results/figures/`. Chaque figure lit uniquement des fichiers réels.
- Ablation : config `ppo_mufixe_nolambda` (λ = 0).

## Mission 9 — serveur (`server/`)

FastAPI + WebSockets, uniquement pour le Training Center :
- `POST /runs` (corps = config.yaml) → lance `agents.train` dans un sous-processus, renvoie run_id ;
- `GET /runs` ; `POST /runs/{run_id}/stop` ; `GET /runs/{run_id}/checkpoints` ;
- sert aussi en lecture `tracks/`, `runs/`, `results/` (fichiers statiques) ;
- `WS /ws/runs/{run_id}` : messages `{"type":"status"|"progress"|"checkpoint"|"frame"|"episode_end"|"error", ...}`,
  `status.state` ∈ queued | running | stopping | finished | failed ;
  le client peut envoyer `{"type":"watch_live","checkpoint":"latest","track_id":"...","mu_factor":1.0}`
  → évaluation dans un processus séparé, images `frame` (même format qu'un frame de replay)
  à 20 images/s ; `{"type":"stop_watch"}`. L'entraînement n'est jamais ralenti par l'affichage.
- Tests avec le client de test FastAPI.

## Mission 10 — application (`app/`, React + Vite + Canvas 2D)

Lit les fichiers du contrat (via le serveur statique, ou dossier local en développement).
Données de développement : uniquement `app/public/fixtures/fixture_*.json`, marquées
« FIXTURE » à l'écran ; jamais utilisées dans une démo.

1. **Race Simulator** : circuit, voiture orientée, rayons des capteurs, trajectoire,
   vitesse, chrono, jauges direction/accélérateur/frein ; lecture, pause, vitesse ×0,5 à ×8, curseur temporel.
2. **AI Championship** : plusieurs replays superposés sur le même circuit (voitures fantômes
   colorées), classement par temps au tour, superposition des trajectoires.
3. **Track Designer** : édition des points de la ligne centrale, largeur et μ par portion,
   export `track.json` valide.
4. **Performance Analytics** : courbes depuis progress.csv (moyenne ± écart-type), tableaux
   et graphiques depuis eval.csv, filtres par algo / condition / circuit / μ.
5. **Neural Network Explorer** : entrées (12 valeurs nommées), couches cachées (activations),
   sorties, synchronisés avec le Race Simulator ; mention visible « représentation
   pédagogique, pas une explication causale ».
6. **Training Center** : formulaire de config.yaml, lancement, suivi en direct
   (WebSocket), liste des checkpoints, bouton « regarder en direct ».

Style sobre et lisible, thème sombre, une page par module, navigation latérale.

### STOP 3
Résume ce qui fonctionne, ce qui reste, et liste précisément les commandes pour lancer
les entraînements de nuit, l'évaluation, les figures et l'application.
