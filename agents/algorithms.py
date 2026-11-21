"""Deep RL algorithms available for training: Stable-Baselines3 and sb3-contrib classes.

- PPO, SAC, DQN, TD3 : Stable-Baselines3 ;
- TQC (Truncated Quantile Critics) et QR-DQN (DQN distributionnel) : sb3-contrib.
TQC prolonge SAC avec des critiques « distributionnels » dont on retire les estimations les plus
optimistes : c'est l'un des algorithmes les plus performants pour les actions continues.
QR-DQN apprend toute la distribution des retours au lieu de leur seule moyenne (DQN amélioré).
"""

from __future__ import annotations

SB3_ALGOS = ("ppo", "sac", "dqn", "td3", "tqc", "qrdqn")


def sb3_class(algo: str):
    """Stable-Baselines3 (or sb3-contrib) class of an algorithm name."""
    if algo in ("tqc", "qrdqn"):
        import sb3_contrib

        return {"tqc": sb3_contrib.TQC, "qrdqn": sb3_contrib.QRDQN}[algo]
    import stable_baselines3 as sb3

    return {"ppo": sb3.PPO, "sac": sb3.SAC, "dqn": sb3.DQN, "td3": sb3.TD3}[algo]


def hidden_network(algo: str, policy):
    """Sub-network whose hidden layers are recorded as activations in the replays."""
    return {
        "ppo": lambda p: p.mlp_extractor.policy_net,
        "sac": lambda p: p.actor.latent_pi,
        "tqc": lambda p: p.actor.latent_pi,
        "td3": lambda p: p.actor.mu,
        "dqn": lambda p: p.q_net.q_net,
        "qrdqn": lambda p: p.quantile_net.quantile_net,
    }[algo](policy)
