# 08 — Bilan de la série v2

Ce chapitre rassemble tout ce qu’il faut savoir sur la série v2 pour présenter les diapositives 10 à 17. Il reprend le journal d’expériences dans l’ordre où les choses se sont passées, puis détaille les résultats circuit par circuit et la manière dont les agents échouent. Tous les chiffres viennent de `results/eval_f1_v2.csv`, l’évaluation corrigée, depuis la ligne de départ. [`experiments/JOURNAL.md`, « Correction : évaluation v2 refaite depuis la ligne de départ »](../../experiments/JOURNAL.md#correction--évaluation-v2-refaite-depuis-la-ligne-de-départ-22112026-soir)

## En une phrase

Avec une voiture de F1 réaliste et 17 circuits réels pour s’entraîner, 5 conditions sur 13 bouclent des tours sur 8 circuits de F1 jamais vus : **66 tours** en tout, contre 2 sur 576 essais en série v1. Le meilleur agent est PPO entraîné avec une adhérence variable, mais aucun agent ne boucle un tour sur piste glissante, et tous restent plus lents que le pilote classique.

## Ce qui s’est passé, dans l’ordre

| Date | Étape | Ce qui s’est passé |
|---|---|---|
| 21/11 | Premier essai v2 | PPO, 2,4 millions de pas : 0 tour. Diagnostic : plein gaz (gaz moyen 0,96, frein 0,03), entrée en virage à 230–290 km/h pour une limite de 50 à 160 km/h. Essai arrêté. |
| 21/11 | Trois corrections | Pédale unique (−1 frein … +1 gaz), sortie qui coûte −(10 + 0,01 v²), γ porté de 0,99 à 0,995. Les trois en même temps. |
| 21/11, 20 h 39 | Lancement | 13 conditions × 3 graines, en 3 files parallèles sur l’Intel Core i3. |
| 22/11, 8 h 50 | Budget réduit | En parallèle, les débits chutent (SAC 42 pas/s au lieu de 131, TQC ≈ 21 au lieu de 66). Les 3 graines complètes auraient demandé ≈ 38 h de plus. Décision : réduire les graines. |
| 22/11, 17 h 52 | Fin des entraînements | Tous les entraînements prévus sont terminés, sans échec. |
| 22/11, 17 h 59 | Première évaluation | 8 circuits de test × 3 adhérences, meilleur checkpoint de chaque entraînement. |
| 22/11, soir | Défaut repéré, évaluation refaite | Dans AI Championship, les voitures ne partaient pas ensemble : l’évaluation gardait le départ aléatoire de l’entraînement. Départ sur la ligne forcé, tout réévalué. Conclusions inchangées. |

[`experiments/JOURNAL.md`, « Série v2 — préparation », « nuit du 21 au 22/11 », « fin des entraînements » et « Correction »](../../experiments/JOURNAL.md)

## Pourquoi certains algorithmes n’ont qu’une graine

Les trois files tournent en même temps sur un processeur à 2 cœurs. Les algorithmes qui réutilisent beaucoup de transitions passées (SAC, TD3, TQC, QR-DQN) sont les plus lents. Le budget a donc été réparti ainsi :

| Graines | Conditions |
|---|---|
| 3 graines | PPO (3 variantes), TQC, DQN, Deep Monte-Carlo, Q-Learning, SARSA, Monte-Carlo |
| 1 graine | SAC, TD3, QR-DQN, Deep SARSA |

TQC a **1 million** de pas en graine 0 et **500 000** en graines 1 et 2. Les résultats à une graine sont les moins sûrs : un 0 peut venir d’un mauvais tirage. [`experiments/JOURNAL.md`, « Série v2 — nuit du 21 au 22/11/2026 »](../../experiments/JOURNAL.md)

## Le résultat principal

Chaque graine est testée sur 8 circuits × 3 adhérences, soit 24 essais. Trois graines font donc 72 essais. Les pilotes de référence ne s’entraînent pas : ils sont testés une fois, sur 24 essais.

| Condition | μ 1,0 | μ 0,8 | μ 0,6 | Total | Par graine (0 / 1 / 2) |
|---|---|---|---|---|---|
| Pilote classique | 8/8 | 8/8 | 8/8 | 24/24 | — |
| Pilote trajectoire idéale | 8/8 | 8/8 | 7/8 | 23/24 | — |
| PPO adhérence variable | 13/24 | 9/24 | 0/24 | **22/72** | 9 / 5 / 8 |
| PPO petit réseau 2 × 64 | 10/24 | 5/24 | 0/24 | 15/72 | 10 / 3 / 2 |
| TQC | 6/24 | 5/24 | 0/24 | 11/72 | 10 / 1 / 0 |
| PPO 2 × 256 | 7/24 | 4/24 | 0/24 | 11/72 | 0 / 11 / 0 |
| Deep Monte-Carlo | 3/24 | 4/24 | 0/24 | 7/72 | 4 / 3 / 0 |
| DQN, Q-Learning, SARSA, Monte-Carlo | 0 | 0 | 0 | 0/72 chacun | — |
| SAC, TD3, QR-DQN, Deep SARSA | 0 | 0 | 0 | 0/24 chacun | — |

Ce qu’il faut savoir lire :

- **PPO adhérence variable** est le seul agent dont les trois graines bouclent des tours. C’est lui qui a le plus de tours au total et sur piste humide.
- **PPO 2 × 256** dépend beaucoup de la graine : 0, 11, puis 0. Ses 11 tours viennent tous de la graine 1.
- Sur piste glissante (μ 0,6), **aucun agent** ne boucle un tour. Les deux pilotes de référence y arrivent, mais ils connaissent l’adhérence, ce que les agents ne savent pas.

## Circuit par circuit

Le tableau répartit les 66 tours bouclés par des agents (toutes conditions, graines et adhérences). Ce décompte a été calculé le 24/11/2026 à partir de `results/eval_f1_v2.csv`.

| Circuit de test | Tours bouclés par des agents | Dont PPO adhérence variable |
|---|---:|---:|
| Zandvoort | 15 | 6 |
| Hungaroring | 14 | 5 |
| Silverstone | 12 | 5 |
| Suzuka | 8 | 1 |
| Red Bull Ring | 7 | 2 |
| Barcelone | 5 | 3 |
| Spa | 3 | 0 |
| Monza | 2 | 0 |

Par adhérence, les 66 tours se répartissent en **39** à μ 1,0, **27** à μ 0,8 et **0** à μ 0,6.

Monza et Spa sont les plus difficiles pour les agents : 2 et 3 tours seulement. Monza est aussi le circuit où les agents de la série v1 sortaient à la première chicane. Le tableau ne dit pas pourquoi certains circuits sont plus durs ; une piste à creuser serait de comparer les vitesses d’entrée dans les chicanes.

## Comment les agents échouent

Un épisode sans tour se termine de trois façons : **sortie de piste**, **arrêt** (100 pas sans progresser : la voiture s’est presque immobilisée) ou **temps écoulé** (6 000 pas sans finir le tour). Décompte calculé le 24/11/2026 à partir de `results/eval_f1_v2.csv` :

| Condition | Essais | Tours | Sorties | Arrêts | Temps écoulé |
|---|---:|---:|---:|---:|---:|
| PPO adhérence variable | 72 | 22 | 46 | 4 | 0 |
| PPO 2 × 64 | 72 | 15 | 52 | 3 | 2 |
| PPO 2 × 256 | 72 | 11 | 53 | 6 | 2 |
| TQC | 72 | 11 | 55 | 6 | 0 |
| Deep Monte-Carlo | 72 | 7 | 27 | 3 | 35 |
| DQN | 72 | 0 | 70 | 2 | 0 |
| Q-Learning | 72 | 0 | 72 | 0 | 0 |
| SARSA | 72 | 0 | 48 | 24 | 0 |
| Monte-Carlo | 72 | 0 | 2 | 70 | 0 |
| SAC | 24 | 0 | 24 | 0 | 0 |
| TD3 | 24 | 0 | 19 | 5 | 0 |
| QR-DQN | 24 | 0 | 20 | 4 | 0 |
| Deep SARSA | 24 | 0 | 7 | 17 | 0 |

Trois comportements différents :

- **La plupart sortent de piste** : ils vont trop vite pour le virage.
- **Monte-Carlo tabulaire et Deep SARSA s’arrêtent** : la voiture s’immobilise, ce que le journal a vérifié pour Monte-Carlo. Explication plausible : à l’arrêt, on ne sort jamais, donc on évite la grosse pénalité de sortie.
- **Deep Monte-Carlo roule trop lentement** : la moitié de ses essais (35 sur 72) dépassent 6 000 pas sans finir le tour.

Ces décomptes viennent de l’évaluation corrigée. Le journal cite des nombres un peu différents (67 arrêts pour Monte-Carlo, 37 temps écoulés pour Deep Monte-Carlo) : ils datent de la première évaluation, avec départ aléatoire.

## Le temps au tour

Pour chaque tour bouclé, on divise le temps de l’agent par celui du pilote classique, sur le même circuit et à la même adhérence. Un rapport de 1,48 veut dire 48 % plus lent.

| Agent | Rapport moyen |
|---|---:|
| PPO 2 × 64 | × 1,43 |
| PPO adhérence variable | × 1,48 |
| PPO 2 × 256 | × 1,52 |
| TQC | × 1,85 |
| Deep Monte-Carlo | × 2,81 |

**Aucun des 66 tours** n’est plus rapide que le pilote classique, qui ne vise pourtant que 85 % de la vitesse limite des virages. Les agents ont appris à ne pas sortir plutôt qu’à aller vite.

Pour donner un ordre de grandeur, voici les temps des deux pilotes de référence à μ 1,0 :

| Circuit | Pilote classique (s) | Trajectoire idéale (s) |
|---|---:|---:|
| Monza | 100,50 | 91,45 |
| Spa | 128,35 | 113,70 |
| Silverstone | 120,65 | 95,70 |
| Suzuka | 113,70 | 98,50 |
| Hungaroring | 102,45 | 89,50 |
| Barcelone | 101,80 | 88,65 |
| Red Bull Ring | 83,20 | 76,15 |
| Zandvoort | 94,20 | 83,35 |

Valeurs tirées de `results/eval_f1_v2.csv`. [`experiments/JOURNAL.md`, « fin des entraînements »](../../experiments/JOURNAL.md)

## Bien apprendre n’est pas bien généraliser

Deux exemples tirés du journal montrent qu’un bon score à l’entraînement ne prédit pas le test :

- **TQC** : la graine 2, la meilleure à l’entraînement, boucle **0/24** au test. La graine 0, qui n’avait bouclé aucun tour pendant ses évaluations d’entraînement, en boucle **10/24**.
- **PPO 2 × 256** : la graine 0 est restée bloquée pendant tout l’entraînement (récompense finale 33,5, contre 386,3 pour la graine 1). Au test, elle boucle 0 tour et la graine 1 en boucle 11.

C’est pour cela que le protocole teste sur des circuits séparés, et qu’il faut plusieurs graines avant de conclure. [`experiments/JOURNAL.md`, « nuit du 21 au 22/11 » et « fin des entraînements »](../../experiments/JOURNAL.md)

## Ce qu’on peut affirmer, et ce qu’on ne peut pas

| On peut dire | On ne peut pas dire |
|---|---|
| La série v2 généralise mieux que la v1 : 66 tours contre 2. | Laquelle des modifications (voiture, circuits réels, départs aléatoires, récompense, γ, pédale) a fait la différence : elles ont changé ensemble. |
| PPO adhérence variable est le meilleur agent de cette expérience, et ses 3 graines bouclent des tours. | Que PPO est le meilleur algorithme en général : SAC, TD3, QR-DQN et Deep SARSA n’ont qu’une graine. |
| Sur ces essais, le petit réseau 2 × 64 fait mieux que le 2 × 256 (15 contre 11). | Qu’un petit réseau est meilleur : les écarts entre graines sont plus grands que l’écart entre les deux. |
| Aucun agent ne boucle un tour à μ 0,6. | Que les agents ne pourront jamais rouler sur piste glissante : ils n’observent pas μ, une estimation de l’adhérence pourrait changer cela. |

## Questions à préparer

**Pourquoi n’avoir pas fait 3 graines partout ?** Le calcul se fait sur un seul PC portable sans carte graphique. En parallèle, les algorithmes les plus lents tournaient entre 20 et 60 pas par seconde : les 3 graines complètes auraient demandé environ 38 heures de plus.

**Pourquoi les méthodes tabulaires font-elles 0 ?** Q-Learning sort de piste à chaque essai. SARSA et surtout Monte-Carlo s’arrêtent souvent. La table regroupe des situations qui demandent des freinages différents, et 9 actions limitent la finesse. C’est une explication plausible, pas démontrée.

**Les chiffres ont-ils changé après la correction du départ ?** Très peu : PPO adhérence variable passe de 23 à 22 tours, Deep Monte-Carlo de 5 à 7, les autres ne bougent pas. Les conclusions sont les mêmes.

**Pourquoi Monza est-il si difficile ?** On constate que les agents y bouclent 2 tours seulement, mais l’expérience ne mesure pas la cause. Le journal de la série v1 avançait une hypothèse : des chicanes après de longues lignes droites, qui demandent de freiner très fort et au bon moment.
