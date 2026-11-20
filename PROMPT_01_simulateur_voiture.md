# Mission 1 — squelette du dépôt et physique de la voiture

Lis d'abord `CLAUDE.md` à la racine : il contient les règles du projet, le modèle
physique et les valeurs de départ. Respecte-le strictement.

## Périmètre de cette mission (rien de plus)

Fais uniquement :
1. le squelette du dépôt ;
2. la physique de la voiture (`sim/car.py`) avec ses tests.

Ne fais PAS : la piste, les capteurs, l'environnement Gymnasium, les agents,
le serveur, l'application. On les fera dans les missions suivantes, après que
j'aie compris chaque partie.

## 1. Squelette

- Arborescence décrite dans `CLAUDE.md` (dossiers vides avec un `.gitkeep` si besoin).
- `requirements.txt` : numpy, pytest (rien d'autre pour l'instant).
- `.gitignore` adapté (Python, `runs/`, `results/`, `__pycache__`, `.venv`).
- `README.md` court en français : but du projet, comment installer, comment lancer les tests.
- `experiments/JOURNAL.md` avec un en-tête et un tableau vide (date, run_id, configuration, graine, résultat, décision).
- `git init` et un premier commit.

## 2. `sim/car.py`

Une classe ou des fonctions pures (au choix, à justifier en une phrase) avec :

- un état : x, y (m), psi (rad), v (m/s), delta (rad) ;
- des paramètres regroupés dans un `dataclass` `CarParams` avec les valeurs de
  départ de `CLAUDE.md` (L = 3,6 ; l_r = 1,8 ; a_max = 10 ; b_max = 15 ; c_d = 0,0025 ;
  delta_max = 0,4 ; delta_rate_max = 2,0 ; g = 9,81) ;
- une fonction `step(state, command, mu, dt)` où `command = (steer, throttle, brake)`,
  steer dans [-1, 1], throttle et brake dans [0, 1] ;
- `step` fait `action_repeat` sous-pas de 0,01 s (Euler semi-implicite : mettre à
  jour v puis la position) ;
- le braquage visé est steer * delta_max ; delta se rapproche de la cible à une
  vitesse limitée par delta_rate_max ;
- la vitesse suit dv/dt = throttle*a_max - brake*b_max - c_d*v², avec le freinage
  plafonné par mu*g, et v ne devient jamais négatif ;
- la courbure demandée est limitée par l'adhérence : si v²/R dépasse mu*g, le
  rayon effectif devient R_eff = v²/(mu*g) (sous-virage) ; la fonction renvoie
  aussi un booléen `slip` ;
- aucun import hors numpy et la bibliothèque standard ; déterministe ; pas d'aléatoire.

Écris chaque formule avec un commentaire en français qui cite le symbole
(beta, psi, R_eff...) pour que je puisse faire le lien avec mon cours.

## 3. Tests (`tests/test_car.py`, pytest)

Ces tests doivent passer, avec des tolérances raisonnables :

1. Vitesse de pointe : en gardant throttle = 1 assez longtemps, v tend vers
   sqrt(a_max / c_d) ≈ 63,2 m/s (à 1 % près).
2. Pas de rotation à l'arrêt : avec v = 0 et steer = 1, psi ne change pas.
3. Virage : avec v constante de 20 m/s (throttle réglé pour la maintenir, ou
   test direct de la formule), delta = 0,05 rad donne dpsi/dt ≈ 0,278 rad/s.
4. Sous-virage : à mu = 1,0 et R visé = 50 m, v = 30 m/s donne `slip = True`
   et v = 20 m/s donne `slip = False`.
5. Freinage : avec mu = 0,6, la distance pour passer de 60 à 22 m/s est plus
   longue qu'avec mu = 1,0 (ordre de grandeur : environ 265 m contre 159 m).
6. Limite de braquage : delta ne dépasse jamais delta_max et ne varie pas plus
   que delta_rate_max * dt par pas.
7. Déterminisme : deux exécutions identiques donnent exactement le même état.

## 4. Livraison

- Lance `pytest` et montre le résultat réel (ne dis jamais que ça passe sans l'avoir lancé).
- Si un test échoue, explique pourquoi avant de modifier le test ou la formule.
- Termine par un résumé en français : ce qu'est chaque fichier, ce que fait chaque
  fonction, et les points qui méritent mon attention.
- Commit en français, puis arrête-toi et attends ma validation.
