# Circuits de F1 réels — source

Fichiers CSV copiés sans modification depuis la base publique **racetrack-database** de
l'Institut de technique automobile de l'Université technique de Munich (TUM FTM) :
https://github.com/TUMFTM/racetrack-database (dossier `tracks/`, branche `master`,
téléchargés le 21/11/2026), sous licence **LGPL-3.0** (voir `LICENSE`).

Colonnes : `x_m, y_m` (ligne centrale lissée, en mètres), `w_tr_right_m, w_tr_left_m`
(largeur de piste à droite et à gauche de la ligne centrale, extraite d'images satellite).

Ces fichiers sont convertis au format `track.json` du projet par
`python -m tools.import_f1_tracks` (sortie : `tracks/f1_*.json`).
