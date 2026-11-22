# 01 — Apprentissage par renforcement

## D’abord, imagine un virage

La monoplace roule vite. La piste se resserre et tourne. Si l’agent continue d’accélérer, il avance vite pendant quelques instants et risque une sortie. S’il freine maintenant, il avance moins vite tout de suite et peut continuer après le virage.

Pendant l’entraînement, l’agent essaie des commandes, observe leurs effets et reçoit des récompenses. Il cherche une suite de décisions qui rapporte sur la durée. Aucune commande de pilotage à imiter ne lui est fournie. [`env/f1_env.py`](../../env/f1_env.py) · [`agents/train.py`](../../agents/train.py)

| Notion | Exemple |
|---|---|
| **Agent** | Le programme qui décide du freinage. |
| **Environnement** | La voiture, la piste et les règles qui répondent à la commande. |
| **État** | La situation complète dans le simulateur. Elle comprend par exemple la position, le cap, le braquage et l’adhérence locale. |
| **Observation** | Ce que l’agent reçoit. Par exemple, les rayons mesurant les bords et la vitesse. Deux situations différentes peuvent produire des observations proches. |
| **Action** | Freiner et braquer dans le même pas. |
| **Récompense** | Une note immédiate qui dépend notamment de l’avance et de la sortie éventuelle. |
| **Épisode** | Un essai qui s’arrête après un tour, une sortie, une limite de durée ou un manque de progression. |
| **Politique** | La règle qui associe une décision, ou une distribution de décisions, à une observation. |
| **Valeur** | Une estimation de ce que les décisions vont rapporter à partir de maintenant. |

## Explorer et exploiter

**Exploiter**, c’est préférer l’action qui semble la meilleure d’après l’expérience actuelle. **Explorer**, c’est essayer une autre action et recueillir de l’information. Si l’agent essaie uniquement d’accélérer, il ne découvre jamais à quel moment un freinage l’aiderait.

Avec la règle **ε-greedy**, l’agent tire une action au hasard avec la probabilité ε. Sinon, il prend une action qui maximise sa valeur estimée. Dans la table du projet, ε diminue pendant l’apprentissage et les égalités sont tirées au sort à l’entraînement. L’évaluation gloutonne prend un maximum avec un départage déterministe. [`agents/tabular.py`](../../agents/tabular.py)

## Sur politique et hors politique

- **Sur politique** (*on-policy*). L’agent apprend à partir de la politique qu’il est en train de suivre. SARSA utilise l’action suivante choisie par cette politique. Si cette action est exploratoire, sa valeur entre dans le calcul.
- **Hors politique** (*off-policy*). La politique qui fournit les expériences peut différer de celle visée par l’apprentissage. Q-Learning peut explorer dans un virage et calculer sa cible comme si, au pas suivant, il choisissait toujours l’action qui a la meilleure valeur estimée. [`agents/sarsa.py`](../../agents/sarsa.py) · [`agents/qlearning.py`](../../agents/qlearning.py)

## Avec les formules

À l’instant $t$, l’agent choisit $a_t$. Il reçoit $r_t$ sur la transition suivante. Une politique stochastique se note $\pi(a\mid o)$, la probabilité de choisir $a$ quand l’agent observe $o$.

Le **retour** $G_t$ est le cumul pondéré des récompenses jusqu’au dernier pas de l’épisode.

$$
G_t = r_t + \gamma r_{t+1} + \gamma^2 r_{t+2} + \cdots
$$

**γ** est le facteur d’actualisation. Plus γ est proche de 1, plus les récompenses lointaines pèsent dans la décision. Pour un freinage, cela change le poids de la sortie que l’on pourrait éviter ou du tour que l’on pourrait finir. En v2, γ vaut **0,995** dans les configurations expérimentales. [`tools/make_configs.py`](../../tools/make_configs.py)

En notation d’état complète, $V^\pi(s)$ est le retour moyen attendu si l’on part de $s$ et suit $\pi$. $Q^\pi(s,a)$ est le retour moyen attendu si l’on joue d’abord $a$ depuis $s$, puis suit $\pi$.

$$
V^\pi(s) = \mathbb{E}_{\pi}[G_t \mid s_t=s],
\qquad
Q^\pi(s,a) = \mathbb{E}_{\pi}[G_t \mid s_t=s, a_t=a].
$$

Dans le projet, la table indexe une observation discrétisée et un réseau Q utilise un vecteur d’observation. Le symbole $s$ dans les mises à jour du [chapitre 04](04_algorithmes.md) désigne l’entrée que l’agent utilise en pratique. Le [chapitre 03](03_environnement_mdp.md) détaille les informations qui lui manquent.
