# 04 — Les algorithmes

Une **méthode de valeur** apprend à noter les actions. Un **acteur-critique** apprend une politique (l’acteur) avec une estimation de valeur (le critique). Les **pilotes de référence** calculent leurs commandes à partir de la piste et de la physique. Le tableau rassemble les familles, puis les sections expliquent leurs mises à jour.

| Méthode | Actions | Apprentissage | Atout | Limite dans ce problème | Code |
|---|---|---|---|---|---|
| Q-Learning | `discrete9` | Table, hors politique | Mise à jour simple à chaque pas | La même case peut regrouper des virages différents | [`agents/qlearning.py`](../../agents/qlearning.py) |
| SARSA | `discrete9` | Table, sur politique | La cible tient compte de l’exploration réellement suivie | Même perte d’information avec les tranches | [`agents/sarsa.py`](../../agents/sarsa.py) |
| Monte-Carlo | `discrete9` | Table, retour de la politique suivie | Utilise les récompenses de la suite effectivement jouée | Retour variable et mise à jour en fin d’épisode | [`agents/monte_carlo.py`](../../agents/monte_carlo.py) |
| DQN | `discrete9` | Réseau Q, hors politique | Partage ce qu’il apprend entre observations proches | Commandes discrètes et risque de surestimation | [`agents/algorithms.py`](../../agents/algorithms.py) · SB3, `dqn/dqn.py` |
| QR-DQN | `discrete9` | Réseau de quantiles, hors politique | Représente la distribution des retours | Plus de calcul et sélection par la moyenne estimée | [`agents/algorithms.py`](../../agents/algorithms.py) · sb3-contrib, `qrdqn/qrdqn.py` |
| Deep SARSA | `discrete9` | Réseau Q, cible SARSA | Garde les observations fines et l’action suivante choisie | La mémoire peut contenir des actions d’une politique déjà modifiée | [`agents/deep_value.py`](../../agents/deep_value.py) |
| Deep Monte-Carlo | `discrete9` | Réseau Q, retour observé | Partage entre observations sans estimer la suite avec Q | Dépend d’épisodes complets ou tronqués et de retours variables | [`agents/deep_value.py`](../../agents/deep_value.py) |
| PPO | Continues | Acteur-critique, sur politique | Limite l’incitation à changer brutalement la politique | Renouvelle régulièrement les données | [`agents/algorithms.py`](../../agents/algorithms.py) · SB3, `ppo/ppo.py` |
| SAC | Continues | Acteur-critique stochastique, hors politique | Réutilise les expériences et encourage la diversité des actions | Plusieurs réseaux à entraîner | [`agents/algorithms.py`](../../agents/algorithms.py) · SB3, `sac/sac.py` |
| TD3 | Continues | Acteur-critique déterministe, hors politique | Cible prudente et politique mise à jour moins souvent | Requiert un bruit d’exploration ajouté à la collecte | [`agents/algorithms.py`](../../agents/algorithms.py) · SB3, `td3/td3.py` |
| TQC | Continues | Acteur-critique distributionnel, hors politique | Réduit l’optimisme dans la cible du critique | Plus de quantiles à calculer et possibilité de pessimisme | [`agents/algorithms.py`](../../agents/algorithms.py) · sb3-contrib, `tqc/tqc.py` |
| Pilote classique | Continues | Règles de direction et de vitesse | Référence lisible et déterministe | Suit la ligne centrale et utilise l’adhérence effective | [`agents/classic_driver.py`](../../agents/classic_driver.py) |
| Pilote trajectoire idéale | Continues | Calcul de ligne, profil et suivi | Anticipe les virages à partir d’un profil physique | Dépend du modèle, du profil et de la qualité du suivi | [`sim/raceline.py`](../../sim/raceline.py) · [`agents/raceline_driver.py`](../../agents/raceline_driver.py) |

Le code local choisit les classes SB3 et sb3-contrib et leur passe les réglages. Les algorithmes tabulaires et les deux réseaux Q marqués Deep SARSA et Deep Monte-Carlo ont leurs boucles dans le dépôt. [`agents/algorithms.py`](../../agents/algorithms.py) · [`agents/train.py`](../../agents/train.py)

## Les tables et leurs trois cibles

Une ligne correspond à un état discrétisé et contient **9 valeurs Q**, une par commande. Pour trouver la ligne, le code recalcule trois distances aux angles −45°, 0°, +45° et les place dans des tranches. Il ajoute la tranche de vitesse et celle de l’écart de cap, puis encode le tout en un entier.

- **v1**. Quatre tranches par distance, quatre pour la vitesse et trois pour le cap. $4^3\times4\times3=768$ états.
- **v2**. Quatre tranches par distance avec une portée de 200 m, six pour la vitesse, trois pour le cap et cinq pour la courbure à 150 m. $4^3\times6\times3\times5=5\,760$ états. [`agents/discretize.py`](../../agents/discretize.py)

Pour $s$ et $a$, la case est corrigée d’une fraction $\alpha$ de l’écart entre sa valeur et la cible $y$.

$$
Q(s,a)\gets Q(s,a)+\alpha\bigl(y-Q(s,a)\bigr).
$$

| Méthode | Cible $y$ | Le choix à expliquer |
|---|---|---|
| Q-Learning | $r+\gamma\max_b Q(s',b)$ | Suppose la meilleure action au pas suivant, même si la collecte explore. |
| SARSA | $r+\gamma Q(s',a')$ | Utilise l’action $a'$ déjà choisie par la politique qui explore. En cours d’épisode, cette action est bien jouée au prochain pas. |
| Monte-Carlo | $G_t=r_t+\gamma G_{t+1}$ | Calcule le retour à rebours en fin d’épisode et corrige la première visite de chaque couple état-action. |

Pour Q-Learning et SARSA, une vraie terminaison donne $y=r$. Une troncature conserve l’estimation de la suite. Monte-Carlo, lui, s’arrête au dernier pas observé et n’ajoute aucune valeur finale. La table applique ensuite les mêmes choix ε-greedy décrits au [chapitre 01](01_apprentissage_par_renforcement.md). [`agents/tabular.py`](../../agents/tabular.py) · [`agents/qlearning.py`](../../agents/qlearning.py) · [`agents/sarsa.py`](../../agents/sarsa.py) · [`agents/monte_carlo.py`](../../agents/monte_carlo.py)

## Les réseaux qui apprennent la valeur des actions

Un réseau reçoit le vecteur d’observation et permet de noter les neuf commandes. Dans les formules, $Q^-$ désigne un **réseau cible**, copie actualisée moins souvent pour fournir une cible plus stable. Les réseaux sont ajustés par descente de gradient. Une perte de Huber réduit l’influence des grandes erreurs par rapport à une erreur purement quadratique.

- **DQN**. Prend des transitions dans une mémoire d’expériences et minimise la perte de Huber entre $Q(s,a)$ et $y=r+\gamma\max_b Q^-(s',b)$, hors transition terminale.
- **QR-DQN**. Apprend plusieurs quantiles $z_j(s,a)$. Un quantile est un seuil de retour associé à une proportion de résultats situés en dessous de ce seuil. Il choisit $a^*$ par la plus grande moyenne des quantiles cibles en $s'$, puis ajuste les quantiles de l’action jouée vers les cibles $y_j=r+\gamma z^-_j(s',a^*)$ via une perte de Huber pondérée par quantile. La politique choisit donc une action par sa moyenne estimée.
- **Deep SARSA**. Dans une mémoire récente, garde aussi l’action suivante choisie $a'$. Le réseau apprend avec la cible $y=r+\gamma Q^-(s',a')$ et une perte de Huber. Le terme futur disparaît si `terminated` vaut vrai. À une troncature l’action suivante est calculée pour la cible.
- **Deep Monte-Carlo**. À la fin de l’épisode ou à sa troncature, calcule les $G_t$ observés, puis ajuste par perte de Huber chaque transition vers $y_t=G_t$. Chaque visite est utilisée dans ce code. Le réseau Q, Adam et l’exploration ε-greedy sont partagés avec Deep SARSA. [`agents/deep_value.py`](../../agents/deep_value.py) · [`agents/algorithms.py`](../../agents/algorithms.py)

Dans QR-DQN, sur une transition terminale, tous les quantiles cibles valent $r$. Dans DQN, la cible vaut $r$.

## Les mises à jour des acteurs-critiques

Les formules ci-dessous donnent le cœur de la mise à jour. Pour SAC, TD3 et TQC, les termes après $r$ disparaissent en cas de vraie terminaison. La politique de v1 utilise les commandes continues à trois composantes. En v2, les commandes sont le volant et la pédale.

**PPO.** La politique collecte des trajectoires récentes. Le critique prédit la valeur de l’état et aide à calculer l’avantage estimé $\hat A$, qui indique si l’action a fait mieux que prévu. L’acteur maximise l’objectif borné ci-dessous, où $\rho=\pi_{\theta}(a\mid s)/\pi_{\rm collecte}(a\mid s)$ est le rapport des probabilités ou densités. Le critique ajuste $V(s)$ vers une cible de retour estimée.

$$
\mathbb{E}\left[\min\left(\rho\hat A,\,
\operatorname{clip}(\rho,1-\epsilon,1+\epsilon)\hat A\right)\right]
$$

**SAC.** L’acteur tire $a'$ de sa politique et les critiques apprennent la cible

$$
y=r+\gamma\left[\min_i Q^-_i(s',a')-\alpha_{\rm ent}\log\pi(a'\mid s')\right].
$$

L’acteur maximise en moyenne $\min_i Q_i(s,a)-\alpha_{\rm ent}\log\pi(a\mid s)$ pour des actions tirées de sa politique. L’entropie favorise une politique qui garde de la diversité. $\alpha_{\rm ent}$ règle son poids.

**TD3.** Une politique cible déterministe donne $a'$, à laquelle on ajoute un petit bruit borné et on applique les bornes de l’action. Les deux critiques sont ajustés vers $y=r+\gamma\min_i Q^-_i(s',a')$. L’acteur est optimisé moins souvent et maximise en moyenne $Q_1(s,\pi(s))$. À la collecte, `train.py` ajoute aussi un bruit d’exploration.

**TQC.** Les critiques cibles renvoient des quantiles pour une action $a'$ tirée de la politique. Le code rassemble et trie ces valeurs, écarte les plus hautes, puis forme $y_j=r+\gamma[z^-_j-\alpha_{\rm ent}\log\pi(a'\mid s')]$ pour chaque valeur retenue. Les critiques apprennent par perte de Huber pondérée par quantile. Pour l’acteur, on maximise la moyenne des quantiles prédits par les critiques courants, avec le terme d’entropie comme dans SAC. [`agents/algorithms.py`](../../agents/algorithms.py) · [`agents/train.py`](../../agents/train.py)

## Les pilotes de référence appliquent une formule de commande

Les deux pilotes visent un point en avant. Si $d_{\rm visée}$ est la distance de visée et $\phi$ l’angle entre le cap et la direction du point, la formule de poursuite est $\delta_{\rm cible}=\arctan(2L\sin\phi/d_{\rm visée})$. Du gaz est ajouté si la voiture roule sous sa vitesse cible, du frein si elle roule au-dessus. Ils lisent l’adhérence effective dans l’environnement.

- **Classique**. Vise la ligne centrale. Pour chaque courbe de l’horizon, calcule une vitesse de passage avec marge $v_{\rm virage}$. La vitesse compatible avec le freinage à distance $d$ vaut environ $\sqrt{v_{\rm virage}^2+2a_{\rm frein}d}$. Le pilote retient le minimum de l’horizon. [`agents/classic_driver.py`](../../agents/classic_driver.py)
- **Trajectoire idéale**. Cherche une ligne de faible courbure et calcule un profil avec une passe d’accélération et une passe de freinage. La vitesse cible est $0{,}99$ fois le minimum du profil sur une courte fenêtre devant la voiture. Il n’y a pas de mise à jour de poids pour ces deux pilotes. [`sim/raceline.py`](../../sim/raceline.py) · [`agents/raceline_driver.py`](../../agents/raceline_driver.py)
