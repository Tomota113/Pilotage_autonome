# Circuits réels — source

Fichiers CSV copiés sans modification depuis la base publique **racetrack-database** de
l'Institut de technique automobile de l'Université technique de Munich (TUM FTM) :
https://github.com/TUMFTM/racetrack-database (dossier `tracks/`, branche `master`,
téléchargés le 21/11/2026), sous licence **LGPL-3.0** (voir `LICENSE`).

Colonnes : `x_m, y_m` (ligne centrale lissée, en mètres), `w_tr_right_m, w_tr_left_m`
(largeur de piste à droite et à gauche de la ligne centrale, extraite d'images satellite).

Ces fichiers sont convertis au format `track.json` du projet par
`python -m tools.import_f1_tracks`.

## Test (8 circuits, `tracks/f1_*.json`)

- `Budapest.csv`
- `Catalunya.csv`
- `Monza.csv`
- `Silverstone.csv`
- `Spa.csv`
- `Spielberg.csv`
- `Suzuka.csv`
- `Zandvoort.csv`

## Entraînement (17 circuits, `tracks/real_*.json`)

- `Austin.csv`
- `BrandsHatch.csv`
- `Hockenheim.csv`
- `IMS.csv`
- `Melbourne.csv`
- `MexicoCity.csv`
- `Montreal.csv`
- `MoscowRaceway.csv`
- `Norisring.csv`
- `Nuerburgring.csv`
- `Oschersleben.csv`
- `Sakhir.csv`
- `SaoPaulo.csv`
- `Sepang.csv`
- `Shanghai.csv`
- `Sochi.csv`
- `YasMarina.csv`
