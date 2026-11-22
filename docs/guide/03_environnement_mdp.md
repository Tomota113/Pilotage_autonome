# 03 — L’environnement et le MDP

Un **processus de décision de Markov** (MDP) décrit des états, des actions, une loi de transition et une récompense. Avec l’état interne complet, on peut appliquer une action et calculer la suite à partir de la situation présente. L’agent de F1-RL Lab ne reçoit qu’une partie de cet état. Par exemple, l’adhérence de l’épisode et le braquage déjà appliqué peuvent influencer le prochain déplacement sans figurer dans le vecteur standard. Du point de vue de l’agent, le problème est donc **partiellement observable**. [`env/f1_env.py`](../../env/f1_env.py)

## Les 12 observations

Le vecteur est toujours dans le même ordre. Ses composantes sont bornées à $[-1,1]$.

| Position(s) dans le vecteur | Observation | Normalisation |
|---|---|---|
| 1 à 7 | Distances aux bords selon les angles −90°, −60°, −30°, 0°, +30°, +60°, +90° par rapport au cap. | On divise par la portée. Elle vaut 100 m en v1 et 200 m avec la F1. Une valeur de 1 signifie qu’aucun bord plus proche n’a été trouvé. |
| 8 | Vitesse. | On divise par 63 m/s en v1 et 96 m/s avec la F1. |
| 9 | Écart entre le cap de la voiture et celui du segment de piste. | Angle ramené à $[-\pi,\pi[$, puis divisé par $\pi$. |
| 10 | Écart latéral à la ligne centrale. | On divise par la demi-largeur locale. Le signe positif désigne la gauche. |
| 11 | Courbure proche, à 30 m en v1 et 50 m avec la F1. | Courbure signée multipliée par 10, puis bornée. |
| 12 | Courbure plus loin, à 80 m en v1 et 150 m avec la F1. | Même calcul. Les distances se mesurent le long de la ligne centrale. |

L’adhérence utilisée par la physique est le **facteur μ de l’épisode × l’adhérence locale du circuit**. Les pneus du modèle F1 ont leur propre coefficient, appliqué ensuite dans la physique. L’option `observe_mu` ajoute une 13e observation, l’adhérence route effective divisée par 1,5 puis bornée. Elle est désactivée par défaut. [`env/f1_env.py`](../../env/f1_env.py) · [`sim/car.py`](../../sim/car.py)

## Les actions

Le simulateur reçoit toujours un triplet **volant, gaz, frein**.

| Mode | Commande choisie par l’agent |
|---|---|
| `continuous` | Volant dans $[-1,1]$, gaz et frein séparés dans $[0,1]$. |
| `pedal` | Volant et pédale dans $[-1,1]$. Pédale positive pour accélérer, négative pour freiner, zéro pour laisser rouler. Les deux efforts sont exclusifs. |
| `discrete9` | Un entier de 0 à 8. C’est une combinaison parmi trois directions (gauche, tout droit, droite) et trois commandes longitudinales (gaz, roue libre, frein). |

Le volant positif commande la gauche. Par exemple, l’action discrète **5** signifie **tout droit + frein**. En v2, les agents à actions continues utilisent `pedal` et les agents à actions discrètes conservent `discrete9`. [`env/f1_env.py`](../../env/f1_env.py) · [`tools/make_configs.py`](../../tools/make_configs.py)

## La récompense, terme par terme

| Terme | Effet |
|---|---|
| $+0{,}1\,\Delta s$ | Récompense l’avance signée en mètres sur la ligne centrale. Un recul donne une contribution négative. |
| $-0{,}01$ | Coût de chaque décision, même à l’arrêt. |
| $-(10+k_v v^2)\,[\mathrm{sortie}]$ | Si la voiture sort, pénalité fixe en v1 ($k_v=0$). En v2, $k_v=0{,}01$ et la pénalité augmente avec la vitesse $v$ en m/s. |
| $+50\,[\mathrm{tour}]$ | Bonus lorsque les points de passage valident le tour. |
| $-0{,}05\,\lvert\Delta\delta\rvert$ | Pénalise les variations du braquage réel, mesurées en radians. Ce coefficient est mis à zéro dans l’ablation v1. |

Les crochets valent 1 si l’événement a lieu, 0 sinon. $\Delta s$ est la différence de position projetée, corrigée au passage de l’origine de la boucle. Le code la borne à $\pm(v\,dt+1\,\mathrm{m})$. Un grand saut de projection reçoit donc au plus le crédit d’avance plafonné. Les checkpoints ont un contrôle séparé. [`env/f1_env.py`](../../env/f1_env.py) · [`docs/CONTEXTE_POUR_CLAUDE.md`, § 6](../CONTEXTE_POUR_CLAUDE.md#6-le-mdp-envf1_envpy)

**Exemple de calcul.** Suppose une avance projetée égale à la marge de **1 m** du code, avec un volant stable, sans sortie ni tour validé. L’avance passe le plafonnement. La récompense vaut $0{,}1\times1 - 0{,}01 = 0{,}09$. Si ce même pas valide le tour, on ajoute 50 et on obtient $50{,}09$. Ce calcul applique les coefficients du code à un exemple pédagogique. [`env/f1_env.py`](../../env/f1_env.py)

## Un épisode, du départ à la fin

**`reset()`** choisit un circuit et un facteur μ, place la voiture à l’arrêt dans l’axe de la piste, prépare les checkpoints et remet les compteurs à zéro. Il renvoie la première observation et `info`. En v2, l’entraînement tire un point de la ligne centrale. Cela permet de découvrir les virages situés après celui où l’agent échoue souvent. Si le point tiré diffère de la ligne, les cibles sont réparties le long de la boucle à partir de ce point. En évaluation, le départ se fait sur la ligne.

**`step(action)`** décode la commande, avance la voiture, reprojette sa position, vérifie l’avance et les checkpoints, calcule la récompense, met à jour les compteurs puis renvoie `observation, reward, terminated, truncated, info`.

Les **20 checkpoints** doivent être franchis vers l’avant, dans l’ordre, au plus un par décision. Le dernier passage attendu est le retour au point de départ de l’épisode. Un franchissement pendant un saut de projection trop grand ne compte pas. La validation tolère jusqu’à **4 m** de dépassement du plafond et un petit écart d’arrondi. [`env/f1_env.py`](../../env/f1_env.py) · [`docs/CONTEXTE_POUR_CLAUDE.md`, § 12](../CONTEXTE_POUR_CLAUDE.md#12-défauts-trouvés-et-corrigés-à-savoir-expliquer)

- **`terminated`**. Sortie de piste ou tour validé. La sortie est détectée quand la distance au centre dépasse la demi-largeur locale.
- **`truncated`**. Limite de **3 000 décisions** par défaut (**6 000** pour l’évaluation sur les circuits F1), ou **100 décisions** sans dépasser le meilleur avancement de l’épisode. Osciller autour du même point ne remet donc pas le compteur à zéro. [`env/f1_env.py`](../../env/f1_env.py) · [`tools/evaluate_f1.py`](../../tools/evaluate_f1.py)
