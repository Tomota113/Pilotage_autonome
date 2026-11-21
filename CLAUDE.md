# F1-RL Lab — instructions pour Claude Code

Projet universitaire de L3 Intelligence Artificielle, en binôme.
Des agents de Deep Reinforcement Learning apprennent à piloter une monoplace
sur des circuits 2D. Le projet compare plusieurs algorithmes à un pilote
classique et mesure leur robustesse à une baisse d'adhérence.

Documents de référence (les lire avant tout changement de conception) :
- « F1-RL Lab — Dossier de conception » : simulateur, MDP, algorithmes, protocole, planning.
- « F1-RL Lab — Contrat de données » : formats de track.json, replay.json,
  config.yaml, progress.csv, eval.csv et messages WebSocket.

## Langue

- Code, noms de variables et docstrings : anglais.
- Commentaires d'explication, README, JOURNAL.md, messages à l'utilisateur : français.

## Règles absolues

1. Ne jamais inventer un résultat. Aucun chiffre, aucune courbe, aucun replay
   présenté comme expérimental sans provenir d'un vrai entraînement, rattaché
   à son `run_id`, sa configuration et sa graine.
2. Ne jamais prétendre avoir entraîné ou évalué un agent sans l'avoir fait.
   Si un entraînement n'a pas été lancé, le dire.
3. Les fichiers de test de l'interface s'appellent `fixture_*.json`, vivent
   dans `app/public/fixtures/` et n'apparaissent dans aucune démo.
4. À la demande de l'étudiant (20/11/2026), Claude écrit aussi les parties qui
   lui étaient réservées : `act()` / `update()` de `agents/qlearning.py` et la
   boucle `reset()` / `step()` de `env/f1_env.py`. Elles restent commentées en
   français et expliquées dans `docs/EXPLICATIONS.md` : l'étudiant doit pouvoir
   les défendre devant son professeur.
5. Ne pas modifier un format du contrat de données sans le signaler ; toute
   modification incrémente `schema` (1.0 → 1.1 ou 2.0).
6. Une étape ne commence que lorsque la précédente passe ses tests.

## Contraintes matérielles

PC principal : Intel Core i3, pas de GPU utile. Donc :
- simulateur en NumPy vectorisé, aucune boucle Python par capteur ;
- aucun affichage pendant l'entraînement ;
- petits réseaux (2 couches de 64) ;
- mesurer le débit (pas/seconde) avant de fixer un budget d'entraînement ;
- entraînements longs lancés la nuit sur ce PC uniquement (`tools/run_night.sh`),
  SAC compris (≈ 1 h 30 pour 1 M de pas) ; ni Colab ni le PC du binôme.
  Claude peut les lancer lui-même quand tout est prêt.

Débits mesurés sur l'i3-1115G4 (20 000 pas) : simulateur seul ≈ 10 000 pas/s,
Q-Learning ≈ 4 000, SARSA et Monte-Carlo ≈ 2 750 (mesurés pendant un PPO),
PPO ≈ 1 240, DQN ≈ 1 210, SAC ≈ 190 pas/s.

Circuits F1 réels : `tracks/f1_*.json` (source TUM racetrack-database, LGPL-3.0,
`data/f1_tracks_tum/`), split « test », jamais utilisés pour entraîner. Référence non-RL
supplémentaire : pilote trajectoire idéale (`sim/raceline.py`, `agents/raceline_driver.py`,
run_id `raceline_ref`, algo `classic`).

Contrat de données : version 1.1 de config.yaml et replay.json (ajout de
`sarsa` et `montecarlo`) ; les fichiers 1.0 restent valides avec les
algorithmes de la 1.0.

## Pile technique

- Simulateur : Python 3.11+, NumPy.
- Environnement : Gymnasium (valider avec `gymnasium.utils.env_checker.check_env`).
- Agents : PyTorch + Stable-Baselines3 (DQN, PPO, SAC) ; méthodes tabulaires
  (Q-Learning, SARSA, Monte-Carlo, sur l'état discrétisé à 768 états) et pilote
  classique écrits à la main.
- Serveur : FastAPI + WebSockets, uniquement pour le Training Center.
- Application : React + Canvas 2D ; lit les fichiers du contrat de données.
- Tests : pytest.

## Arborescence

```
sim/            simulateur physique (sans dépendance au RL)
env/            F1Env (Gymnasium)
agents/         tabular.py, qlearning.py, sarsa.py, monte_carlo.py, discretize.py,
                classic_driver.py, train.py, evaluate.py
tracks/         circuits (track.json)
configs/        configurations (config.yaml)
runs/<run_id>/  config.yaml, progress.csv, checkpoints/, replays/
results/        eval.csv agrégé
tools/          validate.py, generate_tracks.py, benchmark.py, make_configs.py,
                run_night.sh, evaluate_all.py, plots.py
server/         FastAPI + WebSockets (uvicorn server.app:app)
app/            React + Vite + Canvas 2D (fixtures : app/public/fixtures/)
tests/          pytest
docs/EXPLICATIONS.md   ce qui a été fait à chaque mission, et pourquoi
experiments/JOURNAL.md
```

## Modèle physique (version 1)

Bicyclette cinématique + cercle de friction. État : x, y (m), psi (rad),
v (m/s), delta (rad).

- beta = atan((l_r / L) * tan(delta))
- dx/dt = v cos(psi + beta) ; dy/dt = v sin(psi + beta)
- dpsi/dt = (v / l_r) sin(beta)
- dv/dt = u_acc * a_max - u_brake * b_max - c_d * v²  (freinage plafonné par mu*g)
- sqrt(a_long² + a_lat²) <= mu * g ; au-delà, rayon effectif R_eff = v² / (mu g)
- braquage limité en angle (0,4 rad) et en vitesse de variation (2,0 rad/s)
- Euler semi-implicite (v puis position), pas physique 0,01 s ;
  décision de l'agent tous les 0,05 s (action repeat = 5)

Valeurs de départ : L = 3,6 m ; l_r = 1,8 m ; a_max = 10 m/s² ;
c_d = 0,0025 1/m ; mu = 1,0 ; g = 9,81 m/s².

Modèle F1 réaliste (série v2, `sim/car.py` : `F1_2024`, option `env.car: f1_2024`) : 800 kg,
≈ 700 kW, traînée C_D A ≈ 1,3 m², appui C_L A ≈ 4,5 m² (adhérence mu (g + k_L v²)), slicks
mu ≈ 1,8, cercle de friction combiné ; 343 km/h ; calibré à ~3 % des poles 2024 (FIA).

Le simulateur doit être déterministe pour une graine donnée et couvert par
des tests unitaires (vitesse de pointe ≈ sqrt(a_max / c_d), pas de rotation
à l'arrêt, sous-virage quand v²/R > mu*g, sortie de piste détectée).

## MDP

- Observation (12 valeurs normalisées dans [-1, 1]) : 7 capteurs de distance
  (-90° à +90°, portée 100 m), vitesse, angle cap/piste, écart latéral,
  courbure à 30 m et à 80 m. mu n'est pas observé (sauf ablation `observe_mu`).
- Actions : continues (direction [-1,1], accélérateur [0,1], frein [0,1]) ou
  discrètes `discrete9` (3 directions × 3 commandes longitudinales).
- Récompense : r = k*Δs − c − P_sortie*[sortie] + B_tour*[tour] − λ*|Δδ| ;
  Δs par projection sur la ligne centrale, plafonné, 20 checkpoints dans l'ordre.
- Fin : `terminated` (sortie, tour validé) ; `truncated` (3000 pas ou
  100 pas sans progression).

## Méthode de travail

- Petits changements, testés, un sujet à la fois.
- Après chaque étape : expliquer en français ce qui a été fait et pourquoi,
  pour que l'étudiant puisse le défendre.
- Chaque expérience est notée dans `experiments/JOURNAL.md` :
  date, run_id, configuration, graine, résultat mesuré, décision.
- Commits en français, messages courts et précis.
- Codex (`codex exec -m gpt-6.2-sol -s workspace-write ... < /dev/null` : sans
  `< /dev/null`, il attend son entrée standard et reste bloqué) peut recevoir des
  tâches délimitées, sur des fichiers séparés, sans commande git d'écriture.
  Claude relit et teste tout son code avant de le commiter.
