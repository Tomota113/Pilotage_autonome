#!/usr/bin/env bash
# Série v2, suite réduite (22/11/2026, choix de l'étudiant) : la graine 0 de tout, puis les graines 1
# et 2 des seuls algorithmes rapides ou prometteurs (PPO × 3, TQC à 500 000 pas, DQN, Deep Monte-Carlo,
# tabulaires). SAC, TD3, QR-DQN et Deep SARSA gardent une seule graine. Puis évaluation F1 et figures.
#
# Usage : tools/run_v2_reduced.sh [pid_tqc_s0 pid_qrdqn_s0]
#   les PID sont ceux des runs de la graine 0 déjà en cours : on attend leur fin avant de lancer TQC.
set -u
cd "$(dirname "$0")/.."
LOGS=runs/_logs

wait_pid() {  # wait_pid <pid> <config> : attend un run lancé ailleurs et pose son .done s'il a réussi
    [ -n "$1" ] || return 0
    while kill -0 "$1" 2>/dev/null; do sleep 60; done
    if grep -q "^terminé" "$LOGS/$2.log"; then
        tail -n 1 "$LOGS/$2.log" > "$LOGS/$2.done"
        echo "$(date '+%T') terminé  : $2 — $(tail -n 1 "$LOGS/$2.log")"
    else
        echo "$(date '+%T') ÉCHEC    : $2 (voir $LOGS/$2.log)"
    fi
}

c() { for n in "$@"; do echo "configs/$n.yaml"; done; }
QUEUE_X=$(c dqn_f1_s0 deep_sarsa_f1_s0 dqn_f1_s1 dqn_f1_s2 ppo_f1_s2 ppo_f1_mualea_s2 ppo_f1_net64_s2)
QUEUE_Y=$(c qlearning_f1_s0 sarsa_f1_s0 montecarlo_f1_s0 deep_mc_f1_s1 deep_mc_f1_s2 \
            qlearning_f1_s1 sarsa_f1_s1 montecarlo_f1_s1 qlearning_f1_s2 sarsa_f1_s2 montecarlo_f1_s2)

tools/run_night.sh $QUEUE_X > $LOGS/v2r_X.log 2>&1 &
tools/run_night.sh $QUEUE_Y > $LOGS/v2r_Y.log 2>&1 &
{ wait_pid "${1:-}" tqc_f1_s0; tools/run_night.sh configs/tqc_f1_s1.yaml; } > $LOGS/v2r_T1.log 2>&1 &
{ wait_pid "${2:-}" qrdqn_f1_s0; tools/run_night.sh configs/tqc_f1_s2.yaml; } > $LOGS/v2r_T2.log 2>&1 &
wait
echo "$(date '+%F %T') évaluation sur les circuits F1" > $LOGS/v2_eval.log
.venv/bin/python -m tools.evaluate_f1 --series v2 >> $LOGS/v2_eval.log 2>&1
.venv/bin/python -m tools.plots --series v2 >> $LOGS/v2_eval.log 2>&1
echo "$(date '+%F %T') SÉRIE V2 FINIE" >> $LOGS/v2_eval.log
