#!/usr/bin/env bash
# Lance une file d'entraînements à la suite (une nuit sur le PC).
#
# Usage :
#   systemd-inhibit --what=sleep tools/run_night.sh                 # toutes les configs configs/*_s<graine>.yaml
#   systemd-inhibit --what=sleep tools/run_night.sh configs/sac_*.yaml   # une partie seulement
#
# - un journal par config dans runs/_logs/<config>.log ;
# - une config terminée est marquée runs/_logs/<config>.done : relancer le script
#   après une coupure reprend là où il s'était arrêté (supprimer le .done pour refaire un run) ;
# - un échec n'arrête pas la file ; le récapitulatif final liste les échecs.
# systemd-inhibit empêche la mise en veille pendant la nuit.

set -u
cd "$(dirname "$0")/.."
PYTHON="${PYTHON:-.venv/bin/python}"
LOGS=runs/_logs
mkdir -p "$LOGS"

if [ "$#" -gt 0 ]; then
    configs=("$@")
else
    # Ordre : du plus rapide au plus lent (SAC en dernier, ≈ 1 h 30 par run)
    configs=()
    for pattern in qlearning_ ppo_ dqn_ sac_; do
        for f in configs/${pattern}*_s[0-9]*.yaml; do
            [ -e "$f" ] && configs+=("$f")
        done
    done
fi

failed=()
echo "$(date '+%F %T') début : ${#configs[@]} configs"
for cfg in "${configs[@]}"; do
    name=$(basename "$cfg" .yaml)
    if [ -e "$LOGS/$name.done" ]; then
        echo "$(date '+%T') déjà fait : $name"
        continue
    fi
    echo "$(date '+%T') lance    : $name"
    if "$PYTHON" -m agents.train "$cfg" > "$LOGS/$name.log" 2>&1; then
        tail -n 1 "$LOGS/$name.log" > "$LOGS/$name.done"
        echo "$(date '+%T') terminé  : $name — $(tail -n 1 "$LOGS/$name.log")"
    else
        failed+=("$name")
        echo "$(date '+%T') ÉCHEC    : $name (voir $LOGS/$name.log)"
    fi
done
echo "$(date '+%F %T') fin : ${#failed[@]} échec(s) ${failed[*]:-}"
[ "${#failed[@]}" -eq 0 ]
