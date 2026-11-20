"""Reference implementation of ``F1Env.reset()`` and ``F1Env.step()``.

À NE LIRE QU'APRÈS AVOIR ÉCRIT SA PROPRE VERSION de ``reset()`` / ``step()``
dans ``env/f1_env.py``. Ce module n'est importé nulle part par défaut : seuls
les tests lancés avec ``pytest --reference-env`` l'utilisent, pour vérifier
que les méthodes d'aide et les tests eux-mêmes sont corrects.
"""

from __future__ import annotations

from env.f1_env import F1Env
from sim.car import step as car_step
from sim.track import N_CHECKPOINTS


class ReferenceF1Env(F1Env):
    def reset(self, *, seed=None, options=None):
        super(F1Env, self).reset(seed=seed)  # gymnasium.Env.reset : graine de self.np_random
        self.track = self._select_track(options)
        self.mu_factor = self._sample_mu_factor(options)
        self.car = self._start_state(self.track)
        self.pos = self.track.project(self.car.x, self.car.y, hint_index=self.track.start_index)
        self.checkpoint = 0
        self.progress_m = self.best_progress = 0.0
        self.stall = self.steps = 0
        mu = self._effective_mu(self.pos)
        return self._compute_obs(self.car, self.pos, mu), self._info(False, False, False)

    def step(self, action):
        command = self._decode_action(action)
        old_delta = self.car.delta
        self.car, slip = car_step(self.car, command, self._effective_mu(self.pos), self.dt, self.substeps)

        pos = self.track.project(self.car.x, self.car.y, hint_index=self.pos.index)
        ds_raw, ds = self._progress(self.pos.s, pos.s, self.car.v)
        self.checkpoint = self._check_checkpoints(self.checkpoint, self.pos.s, ds_raw, ds)
        lap = self.checkpoint == N_CHECKPOINTS
        off_track = self.track.is_off_track(pos)
        reward = self._compute_reward(ds, off_track, lap, self.car.delta - old_delta)

        self.pos = pos
        self.steps += 1
        self.progress_m += ds
        if self.progress_m > self.best_progress:
            self.best_progress, self.stall = self.progress_m, 0
        else:
            self.stall += 1

        terminated = off_track or lap
        truncated = not terminated and self._is_truncated(self.steps, self.stall)
        obs = self._compute_obs(self.car, pos, self._effective_mu(pos))
        return obs, reward, terminated, truncated, self._info(slip, off_track, lap)
