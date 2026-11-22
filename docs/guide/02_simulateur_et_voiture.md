# 02 — Simulateur et voiture

## La voiture comme une bicyclette

Vu du dessus, on remplace les deux roues avant par une roue directrice au milieu de l’essieu. On fait pareil à l’arrière avec une roue fixe. L’état de la voiture contient la position $(x,y)$, le cap $\psi$, la vitesse $v$ et le braquage réel $\delta$. Le volant de l’agent fixe une cible. Le braquage réel s’en rapproche à vitesse limitée.

Sans limitation d’adhérence, la géométrie donne

$$
\beta=\arctan\!\left(\frac{l_r}{L}\tan\delta\right),
\qquad \kappa=\frac{\sin\beta}{l_r}.
$$

$L$ est la distance entre les essieux. $l_r$ est la distance entre le centre de gravité et l’essieu arrière. La voiture se déplace dans la direction $\psi+\beta$ et son cap tourne à la vitesse $v\kappa$. Le rayon du virage demandé vaut $1/|\kappa|$ lorsque $\kappa$ est non nulle.

Une décision dure **0,05 s** par défaut. La même commande est appliquée pendant **5 sous-pas de 0,01 s**. À chaque sous-pas, le simulateur met à jour la vitesse, puis la position et le cap avec cette nouvelle vitesse. C’est l’intégration d’Euler semi-implicite. [`sim/car.py`](../../sim/car.py)

## Tourner et freiner avec une adhérence limitée

Pour suivre un virage de rayon $R$, la voiture demande une accélération latérale $v^2/R$. Une vitesse plus élevée augmente vite cette demande. Quand elle dépasse l’adhérence, le simulateur réduit la courbure effective et la voiture prend un rayon plus large. C’est le sous-virage signalé par `slip`.

Avec le **cercle de friction combiné**, la F1 partage le budget d’adhérence $A(v)$ entre le virage et l’effort longitudinal transmis par les pneus.

$$
a_{\mathrm{long}}^2+a_{\mathrm{lat}}^2 \le A(v)^2,
\qquad
A(v)=\mu_{\mathrm{route}}\,\mu_{\mathrm{pneu}}\,(g+k_Lv^2).
$$

Imagine un pilote qui freine en entrant dans une chicane. Plus les pneus sont occupés à faire tourner la voiture, moins il reste de marge pour freiner. Le code calcule ce budget longitudinal au début du sous-pas, puis borne la courbure avec la vitesse mise à jour. [`sim/car.py`](../../sim/car.py)

| Propriété | Modèle v1 | Modèle `F1_2024` |
|---|---|---|
| Moteur | Accélération maximale constante multipliée par le gaz. | Limite de motricité et de puissance. À vitesse $v>0$, la limite moteur est $\min(a_{\max},P/(mv))$, avant le budget des pneus. |
| Résistances | Traînée proportionnelle à $v^2$. | Traînée proportionnelle à $v^2$ et résistance au roulement. |
| Adhérence | $\mu_{\mathrm{route}}g$. Le frein et la courbure sont limités séparément. | Pneus slicks et appui aérodynamique proportionnel à $v^2$. Un budget commun limite le virage et l’effort longitudinal. |
| Réglage | `env.car: v1`. | `env.car: f1_2024`, masse de 800 kg et environ 700 kW aux roues dans le modèle. |

Le contexte donne une vitesse de pointe d’environ **228 km/h** en v1 et **343 km/h** avec la F1. [`docs/CONTEXTE_POUR_CLAUDE.md`, § 4](../CONTEXTE_POUR_CLAUDE.md#4-la-physique) · [`sim/car.py`](../../sim/car.py)

## Calibrage sur les poles 2024

Le projet compare un temps simulé sur la trajectoire idéale aux temps de pole des classements FIA 2024. Les paramètres ont été choisis dans des plages plausibles. Ce contrôle vérifie l’ordre de grandeur des temps. Il porte sur un profil théorique en tour lancé, distinct des essais des agents depuis l’arrêt. Le contexte rapporte un écart moyen d’environ **3 %**. [`docs/CONTEXTE_POUR_CLAUDE.md`, § 4.2](../CONTEXTE_POUR_CLAUDE.md#42-modèle-f1_2024-série-v2-simcarpy)

| Circuit | Temps simulé (s) | Pole 2024 | Écart |
|---|---:|---:|---:|
| Monza | 81,9 | 1:19.327 | +3,2 % |
| Silverstone | 86,8 | 1:25.819 | +1,2 % |
| Suzuka | 88,9 | 1:28.197 | +0,8 % |
| Hungaroring | 80,0 | 1:15.227 | +6,3 % |
| Red Bull Ring | 67,9 | 1:04.314 | +5,5 % |

Source du tableau. [`docs/CONTEXTE_POUR_CLAUDE.md`, section « La physique »](../CONTEXTE_POUR_CLAUDE.md#4-la-physique)

## Circuits et capteurs

- **Circuits générés.** On fait varier le rayon autour d’un point avec une somme de sinusoïdes, puis on lisse et on rééchantillonne la boucle. Le générateur rejette les tracés trop courts, trop longs, trop serrés ou dont des portions éloignées le long du tour passent trop près. Les `gen_00` à `gen_09` servent à apprendre en v1, les `gen_10` à `gen_14` à tester. Les `gen_f1_*` du lot de démonstration ont des dimensions adaptées à la F1. [`tools/generate_tracks.py`](../../tools/generate_tracks.py)
- **Circuits réels.** Les données viennent de la base publique **racetrack-database** de l’Université technique de Munich (TUM FTM, licence LGPL-3.0). L’import utilise les largeurs gauche et droite issues d’images satellite pour reconstruire le milieu de la piste et sa largeur totale. La boucle est rééchantillonnée à environ 5 m. En v2, les `real_*` servent à apprendre et les `f1_*` sont réservés au test. [Source TUM](../../data/f1_tracks_tum/SOURCE.md) · [`tools/import_f1_tracks.py`](../../tools/import_f1_tracks.py)
- **Géométrie et capteurs.** La piste stocke une ligne centrale fermée, des largeurs et une adhérence locale. La projection fournit $s$, la distance parcourue le long de cette ligne depuis son origine. Elle donne aussi la distance au centre. Les capteurs cherchent, pour chaque rayon, la première intersection avec un bord, dans la limite de leur portée. Le calcul des intersections se fait en bloc avec NumPy. [`sim/track.py`](../../sim/track.py) · [`sim/sensors.py`](../../sim/sensors.py)

## La trajectoire idéale

1. On part de la ligne centrale et on autorise un décalage latéral de chaque point, avec des bornes liées aux bords et une marge.
2. On minimise une approximation de la somme des courbures au carré. Le solveur quadratique fixe ou libère des points sur les bornes. Le rééchantillonnage rend de nouveau les points régulièrement espacés entre les optimisations.
3. Sur cette ligne, on calcule la vitesse limite des virages. Une passe vers l’avant impose ce que le moteur permet d’atteindre. Une passe vers l’arrière réduit les vitesses qui empêcheraient de freiner à temps.
4. Le pilote de référence vise un point en avant sur la ligne et lit le profil de vitesse pour corriger ses commandes. Il vise **99 %** de la vitesse du profil retenue localement.

La courbure minimale fournit une trajectoire de référence. La recherche conjointe de la ligne et du temps minimal serait un autre problème d’optimisation. [`sim/raceline.py`](../../sim/raceline.py) · [`agents/raceline_driver.py`](../../agents/raceline_driver.py) · [`docs/CONTEXTE_POUR_CLAUDE.md`, § 14](../CONTEXTE_POUR_CLAUDE.md#14-limites-à-dire-honnêtement)
