# 07 — 25 questions du professeur

### 1. Quel problème votre projet étudie-t-il ?

Apprendre à piloter une monoplace en 2D, puis mesurer si la politique sait terminer un tour sur des circuits inédits et quand l’adhérence diminue. [Introduction au projet](00_LIRE_D_ABORD.md)

### 2. Qu’est-ce qui distingue l’apprentissage par renforcement de l’apprentissage supervisé ici ?

Le simulateur renvoie les conséquences et le score des commandes essayées. Il ne fournit aucune commande correcte à imiter. [Chapitre 01](01_apprentissage_par_renforcement.md)

### 3. Où passe la frontière entre le simulateur et l’environnement ?

Le simulateur calcule le déplacement et la géométrie. `F1Env` assemble ces calculs, présente les observations à l’agent, attribue la récompense et décide quand l’épisode s’arrête. [Chapitre 03](03_environnement_mdp.md)

### 4. Pourquoi l’agent ne voit-il qu’une partie de l’état ?

Il reçoit notamment sept distances, la vitesse, le cap relatif, l’écart latéral et deux courbures. Le braquage actuel et μ influencent le prochain pas et sont absents des entrées standard. [Chapitre 03](03_environnement_mdp.md)

### 5. Pourquoi parlons-nous de modèle bicyclette ?

Les deux roues de chaque essieu sont représentées par une seule roue. La roue avant dirige la monoplace. Cette géométrie donne une courbure à partir du braquage. [Chapitre 02](02_simulateur_et_voiture.md)

### 6. Pourquoi la voiture élargit-elle dans un virage ?

L’accélération latérale demandée vaut $v^2/R$. Si elle dépasse l’adhérence, le code limite la courbure et le rayon augmente. [Chapitre 02](02_simulateur_et_voiture.md)

### 7. Qu’ajoute la voiture F1 et comment l’avez-vous calibrée ?

Elle ajoute notamment la limite de puissance, l’appui, le roulement et le partage de l’adhérence entre freinage et virage. Le projet a comparé les temps théoriques sur la trajectoire idéale aux poles FIA 2024. [`docs/CONTEXTE_POUR_CLAUDE.md`, § 4](../CONTEXTE_POUR_CLAUDE.md#4-la-physique)

### 8. Pourquoi une pédale unique en v2 ?

Son signe impose soit le gaz, soit le frein. Cela simplifie les commandes explorées et empêche d’appuyer simultanément sur les deux. [Chapitre 03](03_environnement_mdp.md)

### 9. Quel est le rôle de γ ?

Il fixe le poids des récompenses futures. En v2, **γ = 0,995** rend les conséquences plus lointaines plus importantes, par exemple une sortie qu’un freinage précoce pourrait éviter. [`experiments/JOURNAL.md`, « Série v2 — préparation »](../../experiments/JOURNAL.md)

### 10. Pourquoi la récompense augmente-t-elle la pénalité avec la vitesse ?

Le premier essai v2 a appris à rouler plein gaz. Une sortie rapide coûte davantage avec le terme proportionnel à $v^2$, ce qui donne plus d’intérêt à ralentir avant un virage. La pénalité, la pédale et γ ont changé ensemble. [`experiments/JOURNAL.md`, « Série v2 — préparation »](../../experiments/JOURNAL.md)

### 11. Comment validez-vous un tour ?

L’environnement exige le franchissement des checkpoints dans l’ordre, vers l’avant et avec une avance plausible. Le dernier passage ramène la voiture au point de départ de l’épisode. [Chapitre 03](03_environnement_mdp.md)

### 12. Quelle différence entre `terminated` et `truncated` ?

Une sortie ou un tour valide termine l’épisode. Une limite de durée ou un manque de progrès le tronque. Pour Q-Learning et SARSA, la cible conserve une valeur future à la troncature. [Chapitres 03](03_environnement_mdp.md) et [04](04_algorithmes.md)

### 13. Qu’est-ce qui change entre SARSA et Q-Learning ?

SARSA utilise la valeur de l’action suivante que sa politique a choisie. Q-Learning utilise la valeur de la meilleure action suivante estimée. C’est la différence entre leurs cibles sur politique et hors politique. [Chapitre 04](04_algorithmes.md)

### 14. Que fait Monte-Carlo à la fin d’un épisode ?

Il reconstitue le retour de chaque pas à partir des récompenses observées. La table corrige la première visite de chaque couple état-action. La version profonde utilise toutes les transitions. [Chapitre 04](04_algorithmes.md)

### 15. Pourquoi les méthodes tabulaires échouent-elles ici ?

Sur les tests finaux v2, elles ne bouclent aucun tour. Une explication plausible est la discrétisation. Les vitesses, distances et courbures regroupées peuvent masquer des situations qui demandent des freinages différents. Les commandes discrètes limitent aussi la finesse du pilotage. [`experiments/JOURNAL.md`, correction v2](../../experiments/JOURNAL.md#correction--évaluation-v2-refaite-depuis-la-ligne-de-départ-22112026-soir) · [Chapitre 04](04_algorithmes.md)

### 16. Qu’est-ce que DQN change par rapport à Q-Learning ?

Il remplace la table par un réseau qui estime les valeurs des commandes à partir des observations. Il garde une cible qui utilise le maximum, calculé avec un réseau cible. Dans le Neural Network Explorer, les 9 barres d’un agent DQN sont exactement ces valeurs Q, une par action, et la voiture joue l’action dont la barre est la plus haute (pour QR-DQN, chaque barre est la moyenne de ses quantiles). [Chapitre 04](04_algorithmes.md) · [Chapitre 06](06_code_et_application.md)

### 17. Comment résumer PPO, SAC, TD3 et TQC ?

PPO ajuste sa politique avec un objectif borné sur des trajectoires récentes. SAC réutilise les transitions et favorise l’entropie. TD3 utilise deux critiques et retarde la mise à jour de son acteur. TQC reprend l’idée de SAC avec des quantiles et retire les cibles les plus hautes. [Chapitre 04](04_algorithmes.md)

### 18. Pourquoi imposer le départ sur la ligne au test, mais varier les départs à l’entraînement ?

À l’entraînement, varier les départs expose l’agent aux virages tardifs même s’il sort souvent au premier virage. Au test, la ligne impose le même point de départ aux agents et aux pilotes de référence. [`experiments/JOURNAL.md`, correction v2](../../experiments/JOURNAL.md#correction--évaluation-v2-refaite-depuis-la-ligne-de-départ-22112026-soir) · [Chapitre 03](03_environnement_mdp.md)

### 19. Pourquoi utiliser trois graines ?

Elles donnent une première idée de la sensibilité au hasard de l’entraînement. Avec trois graines, une politique chanceuse peut encore peser lourd dans la moyenne. Certaines conditions v2 n’ont qu’une graine pour des raisons de budget. [`experiments/JOURNAL.md`, bilan v2](../../experiments/JOURNAL.md)

### 20. Comment choisissez-vous le meilleur checkpoint ?

Parmi les sauvegardes disponibles, on privilégie le taux de tours en évaluation d’entraînement, puis la récompense moyenne. Les circuits de test restent réservés à la mesure finale. [Chapitre 05](05_protocole_et_resultats.md)

### 21. Pourquoi PPO à μ variable est-il plus robuste dans votre test ?

Il rencontre plusieurs niveaux d’adhérence à l’entraînement. Cela peut favoriser des commandes qui restent efficaces sur une piste plus glissante. À μ 0,8, il boucle **9/24** tours en v2, le meilleur score des agents. À μ 0,6, il n’en boucle aucun. [`experiments/JOURNAL.md`, correction v2](../../experiments/JOURNAL.md#correction--évaluation-v2-refaite-depuis-la-ligne-de-départ-22112026-soir)

### 22. Pourquoi le grand réseau n’aide-t-il pas PPO ici ?

À μ fixe, **2 × 64** boucle **15/72** tours et **2 × 256** en boucle **11/72**. La capacité du réseau ne suffit donc pas à expliquer le succès. Les différences entre graines sont fortes et l’essai ne détermine pas la cause de l’écart. [`experiments/JOURNAL.md`, correction v2](../../experiments/JOURNAL.md#correction--évaluation-v2-refaite-depuis-la-ligne-de-départ-22112026-soir)

### 23. Pourquoi garder deux pilotes de référence ?

Le classique suit le milieu de la piste avec des marges. Le second suit une trajectoire calculée et un profil de vitesse. Ils donnent deux repères déterministes et connaissent tous deux l’adhérence effective. [Chapitres 02](02_simulateur_et_voiture.md) et [04](04_algorithmes.md)

### 24. Quel défaut l’application vous a-t-elle permis de repérer ?

Dans AI Championship, les départs des agents v2 étaient décalés. L’évaluation héritait du départ aléatoire de l’entraînement. Le code force désormais le départ sur la ligne et les résultats v2 ont été recalculés. [`experiments/JOURNAL.md`, correction v2](../../experiments/JOURNAL.md#correction--évaluation-v2-refaite-depuis-la-ligne-de-départ-22112026-soir)

### 25. Un beau replay suffit-il à prouver la généralisation ?

Pour la mesurer, je cite le tableau qui rassemble toutes les graines disponibles sur les circuits réservés. Un replay de démonstration v2 illustre la conduite d’une graine sélectionnée sur un épisode. Les tracés de démonstration comprennent aussi des circuits d’entraînement. [`experiments/JOURNAL.md`, « Replays de démonstration série v2 »](../../experiments/JOURNAL.md#replays-de-démonstration-série-v2-22112026-soir)
