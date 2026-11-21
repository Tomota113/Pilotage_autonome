#!/usr/bin/env bash
# Série v2 : lance les entraînements en 3 files parallèles (4 cœurs, 1 thread PyTorch par
# processus), puis l'évaluation sur les 8 circuits F1. Reprend là où il s'était arrêté
# (fichiers .done de tools/run_night.sh).
#
# Usage : tools/run_v2.sh            (toutes les graines : 0, 1, 2)
#         tools/run_v2.sh 0          (graine 0 seulement, pour une première nuit)
# Journaux : runs/_logs/v2_A.log, v2_B.log, v2_C.log, v2_eval.log
set -u
cd "$(dirname "$0")/.."
SEEDS="${1:-0 1 2}"

list() {  # list <conditions...> : configs de ces conditions pour les graines choisies
    for seed in $SEEDS; do for c in "$@"; do echo "configs/${c}_s${seed}.yaml"; done; done
}

# Files équilibrées d'après les débits mesurés (≈ 5 h 30 chacune pour une graine, voir JOURNAL.md)
QUEUE_A=$(list tqc_f1 dqn_f1 qlearning_f1 sarsa_f1 montecarlo_f1)        # ≈ 4 h 10 + 20 min + 3 × 20 min
QUEUE_B=$(list sac_f1 qrdqn_f1 deep_sarsa_f1)                            # ≈ 2 h 10 + 2 h 20 + 1 h
QUEUE_C=$(list ppo_f1 ppo_f1_mualea ppo_f1_net64 td3_f1 deep_mc_f1)      # ≈ 3 × 35 min + 1 h 30 + ≈ 45 min

INHIBIT=(systemd-inhibit --what=sleep:idle:handle-lid-switch --who="F1-RL Lab" --why="série v2")
mkdir -p runs/_logs
"${INHIBIT[@]}" tools/run_night.sh $QUEUE_A > runs/_logs/v2_A.log 2>&1 &
"${INHIBIT[@]}" tools/run_night.sh $QUEUE_B > runs/_logs/v2_B.log 2>&1 &
"${INHIBIT[@]}" tools/run_night.sh $QUEUE_C > runs/_logs/v2_C.log 2>&1 &
wait
echo "$(date '+%F %T') évaluation sur les circuits F1" > runs/_logs/v2_eval.log
.venv/bin/python -m tools.evaluate_f1 --series v2 >> runs/_logs/v2_eval.log 2>&1
.venv/bin/python -m tools.plots --series v2 >> runs/_logs/v2_eval.log 2>&1
echo "$(date '+%F %T') SÉRIE V2 FINIE" >> runs/_logs/v2_eval.log
