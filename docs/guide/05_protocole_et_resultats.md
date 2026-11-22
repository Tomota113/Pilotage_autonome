# 05 — Protocole et résultats

## Comment on construit une comparaison

1. **Entraîner une condition avec des graines différentes.** Une condition fixe l’algorithme, les circuits et les réglages étudiés. Une graine initialise des tirages comme la sélection du circuit, l’exploration ou les poids du réseau. Les graines usuelles sont **0, 1 et 2**. En v2, SAC, TD3, QR-DQN et Deep SARSA n’ont qu’une graine. TQC a **1 M de pas** en graine 0 et **500 000** en graines 1 et 2. [`experiments/JOURNAL.md`, bilan de l’entraînement v2](../../experiments/JOURNAL.md#série-v2--fin-des-entraînements-et-évaluation-sur-les-8-circuits-f1-22112026)
2. **Choisir une sauvegarde par run.** On trie les évaluations de `progress.csv` par taux de tours, puis par récompense moyenne, puis par pas le plus récent. On prend le premier checkpoint correspondant qui existe. À défaut, on prend le dernier. Les tabulaires ne sauvegardent que la table finale. Les évaluations de `progress.csv` utilisent les circuits d’entraînement. [`tools/evaluate_all.py`](../../tools/evaluate_all.py) · [`agents/train.py`](../../agents/train.py)
3. **Figer la politique et tester.** On impose le circuit, le facteur μ et le départ arrêté sur la ligne. La politique choisit ses actions de façon déterministe, sans exploration. On joue un épisode par couple (circuit, μ) pour chaque graine disponible. Les facteurs **1,0**, **0,8**, **0,6** représentent l’adhérence nominale, réduite et fortement réduite. [`agents/evaluate.py`](../../agents/evaluate.py) · [`docs/CONTEXTE_POUR_CLAUDE.md`, § 9](../CONTEXTE_POUR_CLAUDE.md#9-protocole-dévaluation)
4. **Réserver les circuits de test.** En v1, on apprend sur `gen_00` à `gen_09` et on teste sur `gen_10` à `gen_14`, puis sur les circuits réels F1. En v2, l’apprentissage utilise **17** autres tracés réels. Les **8** circuits `f1_*` restent réservés au test. [`tools/make_configs.py`](../../tools/make_configs.py) · [`tools/evaluate_f1.py`](../../tools/evaluate_f1.py)

**Robustesse** signifie ici continuer à boucler des tours quand l’adhérence baisse. **Généralisation** signifie boucler sur des tracés réservés au test. L’adhérence variable tire un facteur par épisode d’entraînement. La plage est **[0,5 ; 1,1]** pour le PPO variable v1 et **[0,6 ; 1,1]** en v2. Le test applique les mêmes facteurs imposés aux différentes conditions. [`tools/make_configs.py`](../../tools/make_configs.py)

## Série v1 — voiture simplifiée

### Circuits générés

Les triplets sont dans l’ordre **μ 1,0 / 0,8 / 0,6**. Le taux sur les **5 circuits de test** est moyenné sur les graines pour les agents. La dernière colonne inclut les circuits d’entraînement et de test. Les références déterministes sont évaluées une fois par couple et ont chacune **45** essais. [`experiments/JOURNAL.md`, « Réévaluation de la série v1 après les deux corrections des checkpoints »](../../experiments/JOURNAL.md#réévaluation-de-la-série-v1-après-les-deux-corrections-des-checkpoints-21112026)

| Condition | Dernier checkpoint, taux de test | Meilleur checkpoint, taux de test | Tours /135 (dernier / meilleur) |
|---|---|---|---|
| Pilote classique | 1,00 / 1,00 / 1,00 | — | 45 |
| Pilote trajectoire idéale | 1,00 / 1,00 / 1,00 | — | 45 |
| SAC | 0,67 / 0,67 / 0,00 | 0,87 / 0,60 / 0,00 | 66 / 67 |
| PPO μ fixe | 0,47 / 0,20 / 0,00 | 0,60 / 0,13 / 0,00 | 26 / 27 |
| PPO sans pénalité (λ = 0) | 0,40 / 0,20 / 0,00 | 0,60 / 0,27 / 0,00 | 28 / 37 |
| PPO μ aléatoire | 0,20 / 0,40 / 0,20 | 0,20 / 0,67 / 0,33 | 34 / 59 |
| DQN | 0,13 / 0,07 / 0,00 | 0,33 / 0,27 / 0,20 | 15 / 34 |
| Q-Learning / SARSA / Monte-Carlo | 0 / 0 / 0 | 0 / 0 / 0 | 2 / 6 / 0 |

Au meilleur checkpoint, SAC a le meilleur taux des agents à μ 1,0. PPO à μ aléatoire a le meilleur taux à μ 0,8 et μ 0,6, avec un taux nominal plus faible que PPO à μ fixe. La comparaison de PPO fixe avec et sans pénalité de braquage ne donne pas d’effet net sur ce petit échantillon. [`experiments/JOURNAL.md`, réévaluation v1](../../experiments/JOURNAL.md#réévaluation-de-la-série-v1-après-les-deux-corrections-des-checkpoints-21112026) · [`docs/CONTEXTE_POUR_CLAUDE.md`, § 10](../CONTEXTE_POUR_CLAUDE.md#10-résultats-réels-obtenus-série-v1-modèle-simplifié)

### Circuits F1 jamais vus avec la voiture v1

La distance moyenne se rapporte à la meilleure graine. Le nombre de tours regroupe toutes les graines de la condition. [`experiments/JOURNAL.md`, « Circuits de F1 réels », après correction des checkpoints](../../experiments/JOURNAL.md)

| Agent | Tours bouclés | Distance moyenne avant l’arrêt (meilleure graine, 24 épisodes) |
|---|---|---|
| Pilote trajectoire idéale | 24 / 24 | 99,9 % |
| Pilote classique | 23 / 24 (sortie à Monza, μ 0,6) | 96,5 % |
| PPO μ aléatoire | 0 / 72 | 27,9 % |
| SAC | 1 / 72 | 25,5 % |
| Q-Learning | 1 / 72 (Red Bull Ring, μ 1,0) | 21,0 % |
| DQN | 0 / 72 | 18,6 % |
| SARSA | 0 / 72 | 16,6 % |
| PPO sans pénalité (λ = 0) | 0 / 72 | 15,6 % |
| PPO μ fixe | 0 / 72 | 15,5 % |
| Monte-Carlo | 0 / 72 | 3,2 % |

Les agents bouclent **2 tours sur 576 essais**. Le journal pointe des changements de largeur, des virages plus serrés et des chicanes après de longues lignes droites. Ce sont des explications plausibles de la difficulté à transférer ce qui a été appris sur les circuits générés. [`experiments/JOURNAL.md`, « Circuits de F1 réels »](../../experiments/JOURNAL.md) · [`docs/CONTEXTE_POUR_CLAUDE.md`, § 10](../CONTEXTE_POUR_CLAUDE.md#10-résultats-réels-obtenus-série-v1-modèle-simplifié)

## Série v2 — voiture F1 sur les circuits F1 jamais vus

Ce tableau reproduit la réévaluation **depuis la ligne de départ**, après correction. Les nombres entre parenthèses sont les totaux de la première évaluation v2, avec départ aléatoire. [`experiments/JOURNAL.md`, « Correction : évaluation v2 refaite depuis la ligne de départ »](../../experiments/JOURNAL.md#correction--évaluation-v2-refaite-depuis-la-ligne-de-départ-22112026-soir)

| Condition | μ 1,0 | μ 0,8 | μ 0,6 | Total (avant correction) | Par graine |
|---|---|---|---|---|---|
| Pilote classique | 8/8 | 8/8 | 8/8 | 24/24 | — |
| Pilote trajectoire idéale | 8/8 | 8/8 | 7/8 | 23/24 | — |
| PPO μ variable | 13/24 | 9/24 | 0/24 | **22/72** (23) | 9 / 5 / 8 |
| PPO 2 × 64 | 10/24 | 5/24 | 0/24 | 15/72 (15) | 10 / 3 / 2 |
| TQC | 6/24 | 5/24 | 0/24 | 11/72 (11) | 10 / 1 / 0 |
| PPO 2 × 256 | 7/24 | 4/24 | 0/24 | 11/72 (11) | 0 / 11 / 0 |
| Deep Monte-Carlo | 3/24 | 4/24 | 0/24 | 7/72 (5) | 4 / 3 / 0 |
| Autres (DQN, QR-DQN, SAC, TD3, Deep SARSA, tabulaires) | 0 | 0 | 0 | 0 | — |

Par exemple, **9/24** à μ 0,8 pour PPO μ variable signifie neuf tours sur huit circuits essayés par chacune des trois graines. La colonne « Par graine » additionne les circuits et les facteurs μ pour chaque run, de la graine 0 à la graine 2.

Voici les rapports moyens **temps de l’agent / temps du pilote classique**, sur les tours bouclés et pour le même circuit et le même μ. Un rapport supérieur à 1 indique un temps au tour plus long. **Aucun des 66 tours** bouclés par les agents n’est plus rapide que la référence classique. [`experiments/JOURNAL.md`, correction de l’évaluation v2](../../experiments/JOURNAL.md#correction--évaluation-v2-refaite-depuis-la-ligne-de-départ-22112026-soir)

| Agent | Rapport moyen |
|---|---:|
| PPO 2 × 64 | × 1,43 |
| PPO μ variable | × 1,48 |
| PPO 2 × 256 | × 1,52 |
| TQC | × 1,85 |
| Deep Monte-Carlo | × 2,81 |

- Cinq conditions v2 bouclent des tours sur les circuits réservés au test. Plusieurs changements séparent les séries, dont la voiture, les circuits d’entraînement, les départs et la récompense. La comparaison ne permet pas d’isoler l’effet de chacun.
- PPO μ variable a le plus de tours et ses trois graines en bouclent. À μ 0,6, seuls les pilotes de référence réussissent des tours. Ces pilotes connaissent l’adhérence effective.
- À μ fixe, le petit PPO boucle plus de tours que le grand sur ces essais. Avec trois graines et de fortes variations entre runs, ce résultat vaut pour cette expérience. Un bon score d’entraînement peut aussi mal se transférer. TQC graine 2, meilleur TQC à l’entraînement, boucle **0/24**, et la graine 0 boucle **10/24**. [`docs/CONTEXTE_POUR_CLAUDE.md`, § 13](../CONTEXTE_POUR_CLAUDE.md#13-série-v2--résultats-réels-voiture-f1-circuits-réels)

## Replays de démonstration v2

Chaque condition est représentée par la graine ayant bouclé le plus de tours sur les circuits F1 de test, au meilleur checkpoint de cette graine. À **μ 1,0**, les replays sont joués sur les **6** tracés générés à l’échelle F1 du lot `demo` et sur les **17** tracés réels d’entraînement. La sélection d’une graine et les circuits utilisés donnent un autre sens aux chiffres que dans le tableau de test. Le journal donne les comptes suivants pour `results/eval_showcase_v2.csv`. [`experiments/JOURNAL.md`, « Replays de démonstration série v2 »](../../experiments/JOURNAL.md#replays-de-démonstration-série-v2-22112026-soir)

| Condition | Générés F1 (/6) | Réels d’entraînement (/17) |
|---|---:|---:|
| Pilote classique | 6 | 17 |
| Pilote trajectoire idéale | 6 | 16 |
| PPO 2 × 64 | 6 | 14 |
| PPO 2 × 256 | 6 | 12 |
| PPO μ variable | 6 | 11 |
| TQC | 5 | 11 |
| QR-DQN | 5 | 2 |
| Deep Monte-Carlo | 1 | 4 |
| SAC | 3 | 1 |
| SARSA | 2 | 1 |
| DQN | 1 | 1 |
| TD3 | 0 | 1 |
| Deep SARSA, Monte-Carlo tabulaire, Q-Learning | 0 | 0 |

QR-DQN, par exemple, boucle des tours dans cette démonstration. Son résultat sur les huit circuits F1 réservés au test reste celui du tableau précédent. [`experiments/JOURNAL.md`, correction v2 et replays de démonstration](../../experiments/JOURNAL.md)

## Défauts repérés et corrigés

| Défaut | Ce qui se passait | Correction |
|---|---|---|
| Saut de projection dans un virage serré | La projection sur la ligne centrale pouvait sauter au sommet de deux segments pendant une conduite normale. Un checkpoint sur le saut était ignoré. | La validation du checkpoint accepte un dépassement du plafond de **4 m**. Le plafond utilisé pour la récompense reste le même. |
| Projection exactement sur un checkpoint | La projection pouvait rester sur un sommet et le test strict excluait une distance nulle. | Le franchissement accepte une tolérance d’arrondi, y compris au bouclage. |
| Départs différents en évaluation v2 | AI Championship a révélé que les agents ne partaient pas ensemble. L’évaluation héritait de `random_start: true`, alors que les références partaient de la ligne. | Le départ sur la ligne est forcé et l’évaluation finale a été refaite. Les courbes `progress.csv` des anciens runs tabulaires v2 gardent leurs départs aléatoires. |
| Premier essai v2, stratégie plein gaz | La pénalité de sortie était fixe et les commandes de gaz et de frein étaient séparées. Le projet a aussi identifié un horizon d’actualisation trop court. | Pédale unique, pénalité de sortie dépendante de la vitesse et γ porté à **0,995**. Les trois changements ont été appliqués ensemble. |

Sources des corrections. [`docs/CONTEXTE_POUR_CLAUDE.md`, § 12](../CONTEXTE_POUR_CLAUDE.md#12-défauts-trouvés-et-corrigés-à-savoir-expliquer) · [`experiments/JOURNAL.md`, « Série v2 — préparation » et correction v2](../../experiments/JOURNAL.md)

## Limites à dire à l’oral

- Peu de graines et des budgets différents en v2. Les résultats donnent des tendances pour les configurations essayées. Une condition à une seule graine ne renseigne pas sur sa variabilité.
- Un épisode déterministe par circuit et par μ. Cela standardise la comparaison, avec une couverture limitée des conditions de départ et de l’adhérence.
- Le chronomètre ne porte que sur les tours terminés. La récompense d’entraînement, le taux de tours et le temps au tour répondent à des questions différentes.
- Les références connaissent μ et la géométrie que les agents perçoivent par leurs observations. La voiture modélise l’aéro de façon simplifiée et omet notamment le transfert de charge et l’usure. Les tracés TUM datent d’environ 2019 et certains ont évolué. [`docs/CONTEXTE_POUR_CLAUDE.md`, § 14](../CONTEXTE_POUR_CLAUDE.md#14-limites-à-dire-honnêtement)
