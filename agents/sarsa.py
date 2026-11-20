"""Tabular SARSA agent and training loop (on-policy temporal difference).

SARSA tire son nom de la transition utilisée : (S, A, R, S', A'). Comme le
Q-Learning, il corrige Q(s, a) vers une cible r + gamma * Q(s', a'), mais a'
est l'action que la politique epsilon-greedy va VRAIMENT jouer en s', et non
la meilleure action. SARSA apprend donc la valeur de la politique qui explore :
il évite davantage les états où une exploration malheureuse coûte cher (près
des bords de piste), alors que le Q-Learning apprend la politique optimale
en ignorant le coût de sa propre exploration.
"""

from pathlib import Path

import gymnasium as gym

from agents.tabular import Evaluator, TabularAgent


class SarsaAgent(TabularAgent):
    """SARSA: bootstrap on the next action chosen by the epsilon-greedy policy itself."""

    def update(self, state: int, action: int, reward: float, next_state: int, next_action: int,
               terminated: bool) -> None:
        """Q(s,a) <- Q(s,a) + alpha [r + gamma Q(s',a') - Q(s,a)], with no future term if terminated."""
        target = reward if terminated else reward + self.gamma * float(self.q[next_state, next_action])
        self.q[state, action] += self.alpha * (target - self.q[state, action])


def train(
    agent: SarsaAgent,
    env: gym.Env,
    eval_env: gym.Env,
    total_steps: int,
    eval_every: int,
    eval_episodes: int,
    progress_path: str | Path,
    meta: dict,
) -> SarsaAgent:
    """Train for the given step budget, with greedy evaluations logged to progress.csv."""
    evaluator = Evaluator(agent, eval_env, total_steps, eval_every, eval_episodes, progress_path, meta)
    state, _ = env.reset(seed=meta["seed"])
    action = agent.act(state, 0)
    for step in range(1, total_steps + 1):
        next_state, reward, terminated, truncated, _ = env.step(action)
        # a' est choisi AVANT la mise à jour, par la même politique epsilon-greedy, puis joué au pas suivant
        next_action = agent.act(next_state, step)
        agent.update(state, action, reward, next_state, next_action, terminated)
        if (terminated or truncated) and step < total_steps:
            state, _ = env.reset()
            action = agent.act(state, step)
        else:
            state, action = next_state, next_action
        evaluator.after_step(step)
    return agent
