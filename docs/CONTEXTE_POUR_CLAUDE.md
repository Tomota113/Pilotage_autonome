# F1-RL Lab — état complet du projet (à donner à Claude en conversation)

> **À l'attention de Claude.** Ce document décrit l'état du projet au **22/11/2026**. Tu as déjà
> expliqué à l'étudiant (L3 Intelligence Artificielle, projet en binôme) une **première version** très
> différente. Presque tout a changé depuis. Ton rôle : l'aider à **comprendre et défendre** le projet
> devant son professeur, en français simple et rigoureux. Règles absolues du projet : **aucun résultat
> inventé** (chaque chiffre vient d'un vrai run, noté dans `experiments/JOURNAL.md` avec son `run_id`,
> sa configuration et sa graine) ; si une expérience n'a pas encore été faite, dis-le. **La série v2
> (voiture F1 réaliste) est entraînée et évaluée** (22/11/2026) : résultats au § 13.
>
> **Dernière mise à jour : 23/11/2026.** Les nouveautés depuis la version précédente de ce
> document sont résumées au **§ 0** juste en dessous. Un guide débutant en 8 chapitres existe aussi
> (`docs/guide/`, version web `docs/guide/guide_web.html`) : tu peux t'en servir pour expliquer.
>
> Dépôt : https://github.com/Tomota113/Pilotage_autonome (branche `main`). Documents détaillés dans le
> dépôt : `docs/EXPLICATIONS.md` (mission par mission), `experiments/JOURNAL.md` (tous les runs et
> résultats), `CLAUDE.md` (règles et modèle physique), `README.md` (commandes).

---

## 0. Le point au 23/11/2026 (ce qui a changé depuis la version du 21/11)

1. **Série v2 terminée** (33 entraînements, 0 échec, nuit du 21 au 22/11 et journée du 22). Faute de temps de
   calcul, l'étudiant a choisi de réduire : 3 graines pour PPO (3 variantes), TQC (graine 0 : 1 M de pas ;
   graines 1 et 2 : 500 000), DQN, Deep Monte-Carlo et les tabulaires ; 1 graine pour SAC, TD3, QR-DQN et
   Deep SARSA. Résultats complets au § 13.
2. **Défaut trouvé grâce à l'application et corrigé** : la première évaluation v2 faisait partir les agents
   d'un point tiré au hasard (l'option `random_start` de l'entraînement restait active), alors que les pilotes
   de référence partaient de la ligne. L'évaluation force maintenant le départ sur la ligne (test ajouté) et
   la série v2 a été réévaluée : écarts minimes (PPO μ variable 22/72 au lieu de 23/72, Deep MC 7/72 au lieu
   de 5/72), conclusions inchangées. Ancien fichier conservé : `results/eval_f1_v2_depart_aleatoire.csv`.
3. **Nouveaux circuits de démonstration** : 6 circuits générés « à l'échelle F1 » (`gen_f1_20` à `gen_f1_25`,
   4,0–5,3 km, 14 m de large, rayon ≥ 30 m, jamais utilisés pour entraîner) + les 17 circuits réels
   d'entraînement. Les meilleurs agents y ont roulé pour l'application (`results/eval_showcase_v2.csv`) :
   tours bouclés (générés F1 /6 + réels /17) : classique 6 + 17, trajectoire idéale 6 + 16, PPO 2 × 64
   6 + 14, PPO 6 + 12, PPO μ variable 6 + 11, TQC 5 + 11, QR-DQN 5 + 2, Deep MC 1 + 4, SAC 3 + 1, SARSA 2 + 1,
   DQN 1 + 1, TD3 0 + 1, Deep SARSA / Monte-Carlo / Q-Learning 0. Ces circuits incluent des circuits
   d'entraînement : ce n'est **pas** une mesure de généralisation (la mesure reste le tableau du § 13).
4. **Circuits dessinés par l'étudiant** : dans le Track Designer, « Enregistrer et faire rouler les agents »
   enregistre `tracks/custom_<nom>.json` et fait rouler les 2 références + la meilleure graine de chaque
   algorithme (`tools/custom_race.py`, résultats dans `results/eval_custom.csv`). L'étudiant a dessiné un
   circuit « ovale » (`custom_ovale`).
5. **Application refaite pour la projection en soutenance** (détail au § 11) : lecture fluide, AI Championship
   façon retransmission TV, voiture fantôme et télémétrie, Performance Analytics en onglets, Neural Network
   Explorer avec le schéma animé des 256 neurones par couche, mode présentation (touche P), thème clair.
6. **Guide débutant** : `docs/guide/00_LIRE_D_ABORD.md` à `07_questions_du_professeur.md` (bases du RL,
   simulateur, MDP, algorithmes, protocole et résultats, code, 25 questions probables du professeur), chiffres
   vérifiés contre le journal ; version web générée par `python tools/build_guide.py`.
7. **Codex** (agent de code d'OpenAI, modèle gpt-6.2-sol) a écrit une bonne partie de l'interface et le premier
   jet du guide ; Claude Code a relu, testé et corrigé (ex. grille de départ hors piste, choix des replays,
   départ aléatoire). Deux commits (`2ed42bd`, `4ac0192`) ont été faits par un outil extérieur non identifié ;
   leur contenu a été vérifié.
8. **Valeurs Q dans les replays** (nuit du 22 au 23/11) : le format replay.json passe en **1.4** avec le champ
   `frames[].q_values` (les 9 valeurs Q, une par action discrète, ordre de DISCRETE9 ; pour QR-DQN, moyenne des
   quantiles). Les 243 replays de DQN, QR-DQN, Deep SARSA et Deep MC ont été rejoués : issue et temps au tour
   identiques aux évaluations d'origine, aucun résultat ne change. Le Neural Network Explorer affiche ces 9
   barres, action choisie surlignée. À savoir expliquer : un agent « à valeurs Q » note chaque action possible
   (la récompense future qu'il en attend) et joue celle qui a la meilleure note.

## 1. Le projet en une phrase

Des agents d'apprentissage par renforcement apprennent seuls à piloter une monoplace sur des circuits
2D ; on les compare entre eux et à deux pilotes programmés à la main, puis on mesure leur **robustesse à
une baisse d'adhérence** (piste humide μ × 0,8, glissante μ × 0,6) et leur **généralisation** à des
circuits jamais vus, dont **8 vrais circuits de Formule 1**.

## 2. Ce qui a changé depuis la première version (résumé)

| Avant (première version) | Maintenant |
|---|---|
| Une voiture simplifiée (≈ 228 km/h, pas d'aérodynamique) | Deux modèles : **v1** (inchangé) et **F1_2024** réaliste (343 km/h, appui aérodynamique, calibré sur les vraies poles 2024) |
| Circuits générés au hasard | + **25 vrais circuits** (base publique de l'Université technique de Munich) : 8 circuits F1 pour le test, 17 pour l'entraînement |
| PPO, DQN, SAC, Q-Learning | + SARSA, Monte-Carlo, **TD3, TQC, QR-DQN, Deep SARSA, Deep Monte-Carlo** |
| Un pilote classique | + **pilote « trajectoire idéale »** (ligne de courbure minimale + profil de vitesse optimal) |
| Étudiant devait écrire `reset()/step()` et le Q-Learning | **Tout est écrit** (à sa demande) ; il doit savoir l'expliquer |
| Interface minimale | Application React refaite (7 modules), serveur FastAPI, replays, course de tous les agents |
| — | Deux **défauts de l'environnement** trouvés et corrigés ; toutes les évaluations refaites |

## 3. Architecture du code

```
sim/        physique (sans RL) : car.py (modèles v1 et F1_2024), track.py (circuits), sensors.py
            (7 rayons), raceline.py (trajectoire idéale + profil de vitesse)
env/        f1_env.py : environnement Gymnasium F1Env (observation, action, récompense, fin)
agents/     train.py (entraînement), evaluate.py (évaluation, replays), algorithms.py (SB3/sb3-contrib),
            classic_driver.py, raceline_driver.py, tabular.py + qlearning.py / sarsa.py / monte_carlo.py,
            discretize.py (états discrets), deep_value.py (Deep SARSA, Deep Monte-Carlo)
tracks/     47 circuits .json (16 générés gen_*/demo_oval, 6 gen_f1_*, 8 f1_*, 17 real_*) + custom_* (dessinés)
configs/    63 configurations .yaml (24 série v1, 39 série v2)
tools/      generate_tracks, import_f1_tracks, validate, make_configs, run_night.sh, run_v2.sh,
            run_v2_reduced.sh, evaluate_all, evaluate_f1, make_showcase (--series v2), custom_race,
            plots, benchmark, build_guide, start_app.sh
server/     FastAPI : API des runs, fichiers, trajectoire idéale, replays, circuits dessinés et leur course
            (POST /custom-tracks, POST/GET /custom-tracks/{id}/race), WebSocket (Training Center)
app/        React + Vite + Canvas 2D : 7 modules (voir § 11)
runs/       un dossier par entraînement (config.yaml, progress.csv, checkpoints/, replays/) — pas dans git
results/    eval*.csv et figures — pas dans git (régénérables)
```

## 4. La physique

### 4.1 Modèle v1 (inchangé depuis la première version, reproductible au bit près)
Bicyclette cinématique, état (x, y, ψ, v, δ). β = atan((l_r/L) tan δ) ; ẋ = v cos(ψ+β) ; ẏ = v sin(ψ+β) ;
ψ̇ = (v/l_r) sin β ; v̇ = a_max·gaz − min(b_max·frein, μg) − c_d v². Si v²/R > μg : sous-virage, rayon
effectif R_eff = v²/(μg). L = 3,6 m, l_r = 1,8 m, a_max = 10 m/s², b_max = 15, c_d = 0,0025 /m.
Pas physique 0,01 s, décision toutes les 0,05 s. Vitesse de pointe √(a_max/c_d) ≈ 63 m/s (228 km/h).

### 4.2 Modèle F1_2024 (série v2, `sim/car.py`)
Même bicyclette, plus :
- **puissance** : 800 kg, ≈ 700 kW aux roues → accélération ≤ min(12 m/s², P/(m v)) ;
- **traînée** ½ρC_D A v² (C_D A ≈ 1,3 m²) et résistance au roulement ;
- **appui aérodynamique** : force normale m(g + k_L v²), k_L = ½ρC_L A/m (C_L A ≈ 4,5 m²) ; l'adhérence
  maximale μ·μ_pneu·(g + k_L v²) passe de ≈ 1,8 g à l'arrêt à ≈ 6 g à 300 km/h (pneus slicks μ_pneu = 1,8) ;
- **cercle de friction** : √(a_long² + a_lat²) ≤ adhérence → freiner fort en tournant réduit le virage possible.
- Mesures du modèle : 343 km/h en pointe, 0-100 km/h en 2,4 s, 300 → 100 km/h en 88 m.
- **Calibrage** (temps au tour sur la trajectoire idéale vs poles officielles 2024 lues dans les
  classements FIA) : Monza 81,9 s vs 1:19.327 (+3,2 %), Silverstone 86,8 vs 1:25.819 (+1,2 %), Suzuka
  88,9 vs 1:28.197 (+0,8 %), Hungaroring 80,0 vs 1:15.227 (+6,3 %), Red Bull Ring 67,9 vs 1:04.314
  (+5,5 %) : **≈ 3 % en moyenne**. Paramètres choisis dans des valeurs plausibles, sans sur-ajustement.

## 5. Les circuits

- **Générés** (`tools/generate_tracks.py`) : courbe polaire r(θ) = R0 + Σ a_k sin(kθ+φ_k), lissée,
  1,5–3 km, 12 m de large, rayon ≥ 15 m. gen_00–09 entraînement, gen_10–14 test (série v1).
- **Réels** (`tools/import_f1_tracks.py`, base TUM racetrack-database, licence LGPL-3.0, sources dans
  `data/f1_tracks_tum/`) : ligne centrale et largeurs mesurées sur images satellite, rééchantillonnées à 5 m.
  - **Test (jamais vus)** : Monza, Spa, Silverstone, Suzuka, Hungaroring, Barcelone, Red Bull Ring, Zandvoort
    (longueurs conformes aux vraies, ex. Monza 5 793 m, Spa 7 005 m).
  - **Entraînement série v2** : Austin, Brands Hatch, Hockenheim, Indianapolis, Melbourne, Mexico,
    Montréal, Moscou, Norisring, Nürburgring, Oschersleben, Bahreïn, Interlagos, Sepang, Shanghai,
    Sotchi, Yas Marina.
- **Générés à l'échelle F1** (démonstration seulement) : `gen_f1_20` à `gen_f1_25`, 4,0–5,3 km, 14 m, rayon ≥ 30 m.
- **Dessinés** dans le Track Designer : `custom_*` (ex. `custom_ovale`).

## 6. Le MDP (`env/f1_env.py`)

- **Observation** (12 valeurs dans [−1, 1]) : 7 distances aux bords (−90° à +90°) ; vitesse ; angle
  voiture/piste ; écart latéral ; courbure à 2 distances devant. v1 : capteurs 100 m, courbure à 30 et
  80 m. **F1 : capteurs 200 m, courbure à 50 et 150 m** (il faut ≈ 100 m pour freiner depuis 340 km/h).
  μ n'est pas observé (sauf ablation `observe_mu`).
- **Actions** : `continuous` (volant, gaz, frein) ; **`pedal`** (volant + pédale unique −1 frein … +1 gaz,
  série v2) ; `discrete9` (3 directions × gaz/roue libre/frein).
- **Récompense** : r = 0,1·Δs − 0,01 − (10 + k_v·v²)·[sortie] + 50·[tour] − 0,05·|Δδ|. Δs = progression
  projetée sur la ligne centrale, plafonnée à ±(v·dt + 1 m) (un saut plus grand = virage coupé).
  **Série v2 : k_v = 0,01** (sortie à 300 km/h ≈ −79 au lieu de −10, idée de Gran Turismo Sophy).
- **Checkpoints** : 20, validés un par un dans l'ordre ; le 20e (ligne d'arrivée) = tour validé.
- **Fin** : `terminated` (sortie de piste ou tour) ; `truncated` (3 000 pas, ou 100 pas sans progrès).
- **Série v2 : `random_start`** : l'épisode d'entraînement part d'un point au hasard (checkpoints répartis
  depuis ce point) pour travailler tous les virages ; l'évaluation part toujours de la ligne de départ.

## 7. Les pilotes de référence (sans apprentissage)

- **Pilote classique** (`agents/classic_driver.py`) : poursuite de cible (pure pursuit) sur la ligne
  centrale ; vitesse visée = 90 % (v1) ou 85 % (F1) de la vitesse limite des virages des 150 m à venir,
  avec anticipation du freinage. Connaît μ.
- **Pilote trajectoire idéale** (`sim/raceline.py`, `agents/raceline_driver.py`) : trajectoire de
  **courbure minimale** (problème quadratique sous bornes : décalage de chaque point le long de la normale
  sans sortir de la piste ; résolu exactement par une méthode à ensemble actif, itérée 3 fois avec
  rééchantillonnage) ; **profil de vitesse** optimal pour la voiture (vitesse limite en virage, passe avant
  en accélération, passe arrière en freinage, cercle de friction) ; il vise 99 % de ce profil. Connaît μ.
  Il boucle tous les tours testés et bat partout le pilote classique.

## 8. Les algorithmes

| Famille | Série v1 | Série v2 |
|---|---|---|
| Acteur-critique, actions continues | PPO, PPO μ aléatoire, PPO λ = 0, SAC | PPO, PPO μ variable, PPO 2×64 (ablation), SAC, **TD3**, **TQC** |
| Q-Learning profond | DQN | DQN, **QR-DQN** (distributionnel) |
| SARSA / Monte-Carlo profonds | — | **Deep SARSA**, **Deep Monte-Carlo** (même réseau que DQN, seule la cible change) |
| Tabulaires | Q-Learning, SARSA, Monte-Carlo (768 états) | les mêmes, **5 760 états** (vitesse jusqu'à 345 km/h, bords jusqu'à 200 m, courbure du virage à 150 m) |
| Réseaux | 2 × 64 | **2 × 256** (ablation PPO 2 × 64) ; γ = 0,995 |

Rappels utiles pour expliquer : Q-Learning (hors politique) vise r + γ max Q(s', a') ; SARSA (sur
politique) vise r + γ Q(s', a') avec a' l'action réellement jouée ; Monte-Carlo vise le retour complet
G_t ; DQN = Q-Learning avec un réseau de neurones à la place de la table ; TQC = SAC avec des critiques
distributionnels dont on retire les estimations les plus optimistes.

## 9. Protocole d'évaluation

- 3 graines (0, 1, 2) par condition ; évaluation **politique figée, déterministe**, 1 épisode par
  (circuit, μ) depuis la ligne de départ ; μ ∈ {1,0 ; 0,8 ; 0,6}.
- **Meilleur checkpoint** = meilleure évaluation faite **pendant l'entraînement**, sur les circuits
  d'entraînement uniquement (les circuits de test ne servent jamais à choisir).
- Fichiers : `results/eval.csv` (dernier checkpoint), `eval_best.csv` (meilleur), `eval_f1.csv`
  (série v1 sur circuits F1), `eval_f1_v2.csv` (série v2, à venir), `eval_showcase.csv` (replays de démo).

## 10. Résultats réels obtenus (série v1, modèle simplifié)

Tous viennent de vrais runs (1 M de pas chacun, nuit du 20 au 21/11/2026), détaillés dans `JOURNAL.md`.
Chiffres **après les corrections** de l'environnement (§ 12).

**Circuits générés de test** (taux de tours, moyenne des 3 graines, meilleur checkpoint) :

| Condition | μ 1,0 | μ 0,8 | μ 0,6 |
|---|---|---|---|
| Pilote classique / trajectoire idéale | 1,00 | 1,00 | 1,00 |
| SAC | 0,87 | 0,60 | 0,00 |
| PPO μ fixe | 0,60 | 0,13 | 0,00 |
| PPO λ = 0 | 0,60 | 0,27 | 0,00 |
| PPO μ aléatoire | 0,20 | **0,67** | **0,33** |
| DQN | 0,33 | 0,27 | 0,20 |
| Q-Learning / SARSA / Monte-Carlo | 0 | 0 | 0 |

Lecture : SAC est le meilleur à adhérence normale ; PPO entraîné avec μ aléatoire est le plus robuste
(la robustesse se paie en performance nominale) ; la pénalité de braquage λ ne change rien de net ;
les méthodes tabulaires (768 états) échouent ; variance entre graines très forte (3 graines = tendances).
Quand PPO boucle un tour, il est 4 à 5 % plus rapide que le pilote classique sur le même circuit et le
même μ (rapport moyen 0,951 au dernier checkpoint, 0,964 au meilleur), car le classique ne vise que 90 %
de la vitesse limite des virages.

**Vrais circuits F1** (série v1) : pilote trajectoire idéale 24/24 tours, pilote classique 23/24, mais
**aucun agent RL ne sait les piloter** (2 tours sur 576 essais ; ils parcourent 3 à 28 % du tour avant de
sortir). Échec de généralisation : circuits d'entraînement trop réguliers (12 m de large, virages ≥ 19 m,
pas de chicane) ; presque tous sortent à la 1re chicane de Monza (16 % du tour). → motivation de la série v2.

## 11. Application et serveur

- Lancer : `.venv/bin/uvicorn server.app:app --port 8000` puis http://localhost:8000 (application compilée ;
  après une modification de l'interface : `cd app && npm run build`) ou `tools/start_app.sh` (développement).
- **Accueil** : couverture de soutenance, 4 chiffres clés calculés depuis `results/eval_f1_v2.csv` (meilleur agent
  30,6 % = 22/72, pilote classique 100 %, trajectoire idéale 95,8 % = 23/24, 8 circuits de test), boucle
  « la voiture perçoit → le réseau décide → le simulateur avance → l'agent est récompensé ».
- **Race Simulator** : rejoue un épisode ; piste dessinée (vibreurs, secteurs, herbe, piste mouillée et pluie à
  μ 0,8 / 0,6) ; **voiture fantôme** (pilote classique ou trajectoire idéale) avec l'écart en secondes au même
  point du tour ; **télémétrie** (vitesse, volant, pédale selon la distance) ; tableau de bord ; plein écran (F).
- **AI Championship** : tous les agents sur un même circuit, départ avec 5 feux, grille en épi (décalage
  seulement visuel, le long du tracé, effacé 1,5 s après le départ), tour de chronométrage façon TV (écart au
  leader, gains de places, meilleur tour en violet, SORTIE / ARRÊT), caméra libre ou qui suit une voiture
  (clic dans le classement, flèches ↑ ↓, Échap), ralenti, podium final. Les circuits sont groupés : F1 de test,
  réels d'entraînement, générés F1, « Mes circuits », générés v1.
- **Performance Analytics** : série v2 par défaut (v1 au choix), encadré « Ce qu'il faut retenir » calculé, 7
  onglets : tours bouclés (point par graine), carte agent × circuit, fins d'essai (tour / sortie / arrêt / temps),
  chronos relatifs au pilote classique, robustesse à μ, circuits de démonstration, courbes d'apprentissage ;
  « Comment lire ce graphique », tableaux, glossaire.
- **Neural Network Explorer** : schéma animé 12 entrées (avec valeurs physiques) → 256 → 256 → sorties (volant
  et pédale pour la v2), neurones colorés par activation, liaisons des plus actifs, clic sur un neurone = sa
  courbe ; courbes de vitesse / volant / pédale ; pas à pas (Espace). Pour DQN / QR-DQN / Deep SARSA / Deep MC
  (9 actions), barres des 9 valeurs Q à chaque instant, action choisie surlignée (replay 1.4).
- **Track Designer** (dessiner un circuit, y faire rouler les agents) ; **Training Center** (lancer et suivre un
  entraînement).
- **Mode présentation** (bouton ou touche P) : textes agrandis, contrastes renforcés, ← → pour changer de page ;
  thème clair pour une salle éclairée.
- Sans serveur, l'application affiche des données factices `fixture_*.json` marquées « FIXTURE ».

## 12. Défauts trouvés et corrigés (à savoir expliquer)

1. **Checkpoint ignoré dans les virages serrés** : à l'intérieur d'un virage, la projection sur la ligne
   centrale (polyligne) avance par sauts de 2 à 4 m à chaque sommet ; un checkpoint franchi pendant un saut
   était pris pour un virage coupé → tolérance de 4 m (la récompense ne change pas).
2. **Checkpoint posé sur un sommet** : à l'extérieur d'une courbe, la projection reste collée au sommet et
   la position tombe pile sur le checkpoint ; le test strict « distance restante > 0 » avec l'arrondi des
   flottants ne le comptait jamais → tolérance d'arrondi.
   Les deux ont été trouvés en testant le pilote trajectoire idéale ; toutes les évaluations ont été refaites
   (effet faible sur les agents, conclusions inchangées).
3. **Départ aléatoire à l'évaluation (série v2)** : vu dans AI Championship (voitures qui ne partaient pas
   ensemble) ; l'évaluation héritait de `random_start: true` ; corrigé, série v2 réévaluée (§ 0, § 13).
4. **Premier essai de la série v2 (arrêté)** : PPO avait appris « plein gaz » (frein moyen 0,03), entrant
   dans les virages à 230–290 km/h pour une limite de 50–160 km/h. Causes : horizon trop court (γ = 0,99 ≈
   5 s), sortie trop peu chère à grande vitesse, gaz et frein séparés et bruités. Corrections : γ = 0,995,
   sortie −(10 + 0,01 v²), action « pédale ».

## 13. Série v2 : résultats réels (voiture F1, circuits réels)

**Entraînement** (nuit du 21 au 22/11/2026 et journée du 22, sur le PC i3) : 33 runs, 0 échec. En parallèle
sur 2 cœurs, tout allait 2 à 3 fois moins vite que prévu (TQC ≈ 20 pas/s) ; l'étudiant a choisi de réduire :
3 graines pour PPO (3 variantes), TQC (graine 0 : 1 M de pas ; graines 1 et 2 : 500 000), DQN, Deep MC et
les tabulaires ; 1 graine pour SAC, TD3, QR-DQN, Deep SARSA. Entraînement sur 17 circuits réels, départs
aléatoires.

**Évaluation sur les 8 circuits F1 jamais vus** (meilleur checkpoint, départ sur la ligne, 1 épisode par circuit et par μ ; une première
évaluation partait par erreur d'un point au hasard, corrigée le 22/11 au soir, écarts minimes) —
tours bouclés :

| Condition | Graines | μ 1,0 | μ 0,8 | μ 0,6 | Total | Par graine |
|---|---|---|---|---|---|---|
| Pilote classique | — | 8/8 | 8/8 | 8/8 | 24/24 | — |
| Pilote trajectoire idéale | — | 8/8 | 8/8 | 7/8 | 23/24 | sortie à Suzuka, μ 0,6 |
| PPO μ variable | 3 | 13/24 | 9/24 | 0/24 | **22/72** | 9 / 5 / 8 |
| PPO 2 × 64 | 3 | 10/24 | 5/24 | 0/24 | 15/72 | 10 / 3 / 2 |
| PPO 2 × 256 | 3 | 7/24 | 4/24 | 0/24 | 11/72 | 0 / 11 / 0 |
| TQC | 3 | 6/24 | 5/24 | 0/24 | 11/72 | 10 / 1 / 0 |
| Deep Monte-Carlo | 3 | 3/24 | 4/24 | 0/24 | 7/72 | 4 / 3 / 0 |
| DQN, Q-Learning, SARSA, Monte-Carlo | 3 | 0 | 0 | 0 | 0/72 | — |
| SAC, TD3, QR-DQN, Deep SARSA | 1 | 0 | 0 | 0 | 0/24 | — |

Temps au tour des agents (tours bouclés, rapport au pilote classique, même circuit et même μ) : PPO 2 × 64
× 1,43 ; PPO μ variable × 1,48 ; PPO × 1,52 ; TQC × 1,85 ; Deep MC × 2,81. Aucun tour d'agent n'est plus
rapide que le pilote classique (0 sur 66). Monte-Carlo tabulaire et Deep SARSA échouent surtout par arrêt
(voiture immobile, coupée après 100 pas sans progrès) ; les autres par sortie de piste.

**Ce qu'il faut en retenir** :
1. La série v2 généralise : 5 conditions bouclent des tours sur des circuits F1 jamais vus (série v1 :
   2 tours sur 576 essais). Entraîner sur de vrais circuits avec des départs aléatoires a été décisif.
2. Meilleur agent : PPO entraîné avec adhérence variable, seul dont les 3 graines bouclent des tours, et
   meilleur à μ 0,8 (même conclusion qu'en série v1 : la variété à l'entraînement rend robuste).
3. À μ 0,6, aucun agent ne boucle un tour ; les pilotes de référence, qui connaissent μ, si.
4. Le grand réseau n'aide pas PPO ici (2 × 64 : 15/72 ; 2 × 256 : 11/72) ; 3 graines ne suffisent pas à
   conclure.
5. Les agents sont prudents (≈ 40–50 % plus lents que le pilote classique), loin de la trajectoire idéale.
6. Une bonne note à l'entraînement ne garantit pas la généralisation : TQC graine 2, le meilleur TQC à
   l'entraînement, boucle 0/24 ; TQC graine 0 en boucle 10/24.
7. Les méthodes tabulaires (même à 5 760 états), DQN, SAC, TD3, QR-DQN et Deep SARSA ne bouclent aucun tour.

Figures : `results/figures_v2/` (courbes d'apprentissage, taux de tours, robustesse à μ, temps au tour).
Détail : `experiments/JOURNAL.md`, `results/eval_f1_v2.csv`.

## 14. Limites à dire honnêtement

3 graines seulement, voire 1 en série v2 pour SAC, TD3, QR-DQN, Deep SARSA (forte variance) ; budgets
TQC différents selon la graine ; un épisode déterministe par circuit et μ (départ fixe) ; modèle de
voiture simplifié malgré l'aéro (pas de transfert de charge, pas de modèle de pneu détaillé, pas d'usure) ;
trajectoire de courbure minimale ≠ trajectoire de temps minimal exacte ; tracés TUM de ~2019 (Barcelone et
Zandvoort ont changé depuis) ; les pilotes de référence connaissent μ, pas les agents.

## 15. Format des fichiers (contrat de données)

`track.json` (f1rl.track/1.0), `config.yaml` (f1rl.config/**1.3** : 1.1 = SARSA/Monte-Carlo, 1.2 =
`env.car` et `env.random_start`, 1.3 = action `pedal`, `reward.k_offtrack_speed`, nouveaux algorithmes),
`replay.json` (f1rl.replay/**1.4** : 1.4 = `frames[].q_values`, 9 valeurs Q des agents à valeurs Q ; QR-DQN :
moyenne des quantiles), `progress.csv`, `eval.csv`. Les anciennes versions restent valides tant
qu'elles n'utilisent pas les nouveautés. Validation : `python tools/validate.py <fichiers>`.
