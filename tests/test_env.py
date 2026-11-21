"""Tests de l'environnement F1Env (env/f1_env.py).

Deux familles : les méthodes d'aide, testées une à une sur un état posé à la
main, puis reset()/step() sur des épisodes complets.
"""

import math

import numpy as np
import pytest
from gymnasium.utils.env_checker import check_env

from env.f1_env import DEFAULT_CONFIG, DISCRETE9, F1Env, load_tracks, merge_config, wrap_angle
from sim.car import CarState
from sim.track import N_CHECKPOINTS

OVAL = load_tracks(["demo_oval"])  # ovale : droite de 300 m en bas (y = -60), virages de rayon 60 m


def helper_env(config=None, tracks=OVAL) -> F1Env:
    """F1Env with its episode state set by hand, to test one helper at a time."""
    env = F1Env(config, tracks)
    _ = env.np_random  # premier accès : gymnasium initialise le générateur aléatoire
    env.track = tracks[0]
    env.car = env._start_state(env.track)
    env.pos = env.track.project(env.car.x, env.car.y)
    return env


def follow_centreline(env, target_speed=15.0) -> np.ndarray:
    """Simple controller used by the tests: steer towards the track heading and the centreline."""
    heading_error = wrap_angle(env.pos.heading - env.car.psi)
    steer = np.clip(3.0 * heading_error - 0.15 * env.pos.lateral, -1.0, 1.0)
    throttle = 0.6 if env.car.v < target_speed else 0.0
    return np.array([steer, throttle, 0.0], dtype=np.float32)


def config(**env_changes):
    return {"env": dict(DEFAULT_CONFIG["env"], **env_changes)}


# ======================================================================
# Méthodes d'aide
# ======================================================================


def test_spaces():
    env = F1Env(tracks=OVAL)
    assert env.observation_space.shape == (12,)
    assert env.action_space.shape == (3,)
    assert list(env.action_space.low) == [-1, 0, 0] and list(env.action_space.high) == [1, 1, 1]
    assert F1Env(config(observe_mu=True), OVAL).observation_space.shape == (13,)
    assert F1Env(config(action_space="discrete9"), OVAL).action_space.n == 9
    with pytest.raises(ValueError):
        F1Env(config(action_space="discrete5"), OVAL)


def test_merge_config_keeps_defaults():
    cfg = merge_config({"reward": {"lambda_steer": 0.0}, "algo": "ppo"})
    assert cfg["reward"]["lambda_steer"] == 0.0
    assert cfg["reward"]["b_lap"] == 50.0
    assert cfg["env"] == DEFAULT_CONFIG["env"]


def test_discrete9_table():
    env = helper_env(config(action_space="discrete9"))
    commands = [env._decode_action(a) for a in range(9)]
    assert len(set(commands)) == 9
    assert {c[0] for c in commands} == {-1.0, 0.0, 1.0}
    assert commands[0] == (1.0, 1.0, 0.0)  # gauche + accélérer
    assert commands[4] == (0.0, 0.0, 0.0)  # droit + roue libre
    assert commands[8] == (-1.0, 0.0, 1.0)  # droite + freiner
    assert np.all(DISCRETE9[:, 1] * DISCRETE9[:, 2] == 0)  # jamais accélérer et freiner ensemble


def test_continuous_action_is_clipped():
    env = helper_env()
    assert env._decode_action([2.0, -1.0, 3.0]) == (1.0, 0.0, 1.0)


def test_observation_at_start_of_the_straight():
    env = helper_env()
    obs = env._compute_obs(env.car, env.pos, 1.0)
    assert obs.dtype == np.float32 and obs.shape == (12,)
    assert env.observation_space.contains(obs)
    # 6 m / 100 m de chaque côté (à 1 cm près : le départ est à la jonction virage/droite)
    assert obs[0] == pytest.approx(0.06, abs=1e-4) and obs[6] == pytest.approx(0.06, abs=1e-4)
    assert obs[7] == 0.0  # à l'arrêt
    assert obs[8] == pytest.approx(0.0, abs=1e-6)  # cap aligné sur la piste
    assert obs[9] == pytest.approx(0.0, abs=1e-6)  # au centre
    assert obs[10] == pytest.approx(0.0, abs=1e-6) and obs[11] == pytest.approx(0.0, abs=1e-6)  # droite devant


def test_observation_is_clipped_and_observe_mu():
    env = helper_env(config(observe_mu=True))
    car = CarState(x=0.0, y=-80.0, psi=math.pi, v=80.0)  # hors piste, à contresens, trop vite
    pos = env.track.project(car.x, car.y)
    obs = env._compute_obs(car, pos, 0.6)
    assert obs.shape == (13,) and env.observation_space.contains(obs)
    assert obs[7] == 1.0 and obs[9] == -1.0  # vitesse et écart latéral bornés
    assert abs(obs[8]) == pytest.approx(1.0)  # angle de pi
    assert obs[12] == pytest.approx(0.6 / 1.5)


def test_progress_is_clipped_and_signed():
    env = helper_env()
    assert env._progress(10.0, 12.0, 20.0) == (pytest.approx(2.0), pytest.approx(2.0))
    assert env._progress(12.0, 10.0, 20.0)[1] == pytest.approx(-2.0)  # marche arrière : Δs < 0
    ds_raw, ds = env._progress(10.0, 60.0, 20.0)  # saut de 50 m en un pas
    assert ds_raw == pytest.approx(50.0) and ds == pytest.approx(20.0 * 0.05 + 1.0)


def test_checkpoints_are_validated_in_order():
    env = helper_env()
    cp = env.track.checkpoint_s
    # Franchissement normal du checkpoint 1
    assert env._check_checkpoints(0, cp[1] - 0.5, 1.0, 1.0) == 1
    # Pas encore atteint
    assert env._check_checkpoints(0, cp[1] - 2.0, 1.0, 1.0) == 0
    # Le checkpoint 2 ne compte pas tant que le 1 n'est pas validé
    assert env._check_checkpoints(0, cp[2] - 0.5, 1.0, 1.0) == 0
    # Marche arrière à travers le checkpoint : rien
    assert env._check_checkpoints(0, cp[1] + 0.5, -1.0, -1.0) == 0
    # Saut de la projection (Δs plafonné) : rien, même si le checkpoint est dans l'intervalle
    assert env._check_checkpoints(0, cp[1] - 10.0, 30.0, 2.0) == 0
    # Petit saut de projection dans un virage serré (2,5 m pour un plafond de 1,7 m) : validé
    assert env._check_checkpoints(0, cp[1] - 1.0, 2.5, 1.7) == 1
    # Après le 19e, la ligne d'arrivée (checkpoint 0, s = 0) valide le tour
    assert env._check_checkpoints(N_CHECKPOINTS - 1, env.track.length - 0.5, 1.0, 1.0) == N_CHECKPOINTS
    assert env._check_checkpoints(N_CHECKPOINTS, 10.0, 1.0, 1.0) == N_CHECKPOINTS


def test_reward_formula():
    env = helper_env()
    # Valeurs par défaut : k = 0,1 ; c = 0,01 ; P = 10 ; B = 50 ; λ = 0,05
    assert env._compute_reward(2.0, False, False, 0.0) == pytest.approx(0.1 * 2.0 - 0.01)
    assert env._compute_reward(2.0, True, False, 0.0) == pytest.approx(0.2 - 0.01 - 10.0)
    assert env._compute_reward(2.0, False, True, 0.0) == pytest.approx(0.2 - 0.01 + 50.0)
    assert env._compute_reward(0.0, False, False, -0.1) == pytest.approx(-0.01 - 0.05 * 0.1)
    assert env._compute_reward(-1.0, False, False, 0.0) < 0.0  # reculer coûte


def test_mu_factor_sampling():
    env = helper_env()
    assert env._sample_mu_factor(None) == 1.0
    assert env._sample_mu_factor({"mu_factor": 0.6}) == 0.6
    env = helper_env({"mu": {"mode": "uniform", "range": [0.5, 1.1]}})
    draws = [env._sample_mu_factor(None) for _ in range(200)]
    assert 0.5 <= min(draws) and max(draws) <= 1.1 and np.std(draws) > 0.1
    with pytest.raises(ValueError):
        F1Env({"mu": {"mode": "random"}}, OVAL)


def test_track_selection():
    tracks = load_tracks(["demo_oval", "gen_00", "gen_01"])
    env = helper_env(tracks=tracks)
    assert env._select_track({"track_id": "gen_01"}).id == "gen_01"
    assert {env._select_track(None).id for _ in range(100)} == {"demo_oval", "gen_00", "gen_01"}


def test_truncation_rule():
    env = helper_env()
    assert not env._is_truncated(10, 5)
    assert env._is_truncated(3000, 0)
    assert env._is_truncated(10, 100)


# ======================================================================
# reset() / step()
# ======================================================================


@pytest.mark.parametrize("action_space", ["continuous", "discrete9"])
def test_gymnasium_check_env(make_env, action_space):
    env = make_env(config(action_space=action_space), load_tracks(["demo_oval", "gen_00"]))
    check_env(env, skip_render_check=True)


def test_reset_places_car_at_rest_on_start_line(make_env):
    env = make_env(tracks=OVAL)
    obs, info = env.reset(seed=3, options={"mu_factor": 0.8})
    x, y, psi = OVAL[0].start_pose()
    assert (env.car.x, env.car.y, env.car.psi, env.car.v) == (x, y, psi, 0.0)
    assert env.observation_space.contains(obs)
    assert info["checkpoint"] == 0 and info["mu"] == pytest.approx(0.8) and info["lap_time"] is None
    assert set(info) >= {"progress", "checkpoint", "slip", "off_track", "lap_time", "mu"}


def test_reset_is_deterministic_for_a_seed(make_env):
    env = make_env({"mu": {"mode": "uniform", "range": [0.5, 1.1]}}, load_tracks(["demo_oval", "gen_00", "gen_01"]))

    def episode(seed):
        obs, info = env.reset(seed=seed)
        traj = [obs]
        for _ in range(50):
            obs, *_ = env.step(follow_centreline(env))
            traj.append(obs)
        return info["track_id"], info["mu_factor"], np.array(traj)

    a, b = episode(7), episode(7)
    assert a[:2] == b[:2]
    np.testing.assert_array_equal(a[2], b[2])


def test_driving_backwards_is_not_rewarded(make_env):
    env = make_env(tracks=OVAL)
    env.reset(seed=0)
    env.car = CarState(x=env.car.x, y=env.car.y, psi=env.car.psi + math.pi)  # demi-tour sur la ligne
    rewards, infos = [], []
    for _ in range(60):
        heading_error = wrap_angle(env.pos.heading + math.pi - env.car.psi)
        obs, r, terminated, truncated, info = env.step(np.array([np.clip(3 * heading_error, -1, 1), 0.6, 0.0]))
        rewards.append(r)
        infos.append(info)
        assert not terminated
    assert all(r < 0 for r in rewards)
    assert infos[-1]["progress"] < 0 and infos[-1]["checkpoint"] == 0


def test_cutting_a_corner_does_not_validate_checkpoints(make_env):
    env = make_env(tracks=OVAL)
    env.reset(seed=0)
    track = env.track
    # Téléportation au-delà des checkpoints 1 et 2, sur la piste
    i = track.checkpoints[2] + 2
    env.car = CarState(x=track.points[i][0], y=track.points[i][1], psi=float(track.seg_heading[i]), v=15.0)
    _, r, terminated, _, info = env.step(follow_centreline(env))
    assert not terminated
    assert info["checkpoint"] == 0
    assert r <= 0.1 * (15.0 * 0.05 + 1.0)  # Δs plafonné : pas de gros gain de progression
    # En continuant, les checkpoints suivants ne sont pas validés : le 1 manque
    for _ in range(150):
        *_, info = env.step(follow_centreline(env))
    assert info["checkpoint"] == 0


def test_stalled_car_is_truncated(make_env):
    env = make_env(tracks=OVAL)
    env.reset(seed=0)
    for k in range(1, 200):
        _, _, terminated, truncated, _ = env.step(np.array([0.0, 0.0, 1.0]))  # frein serré, à l'arrêt
        if terminated or truncated:
            break
    assert truncated and not terminated
    assert k == DEFAULT_CONFIG["env"]["stall_steps"]


@pytest.mark.parametrize("action_space", ["continuous", "discrete9"])
def test_random_episodes_always_end(make_env, action_space):
    env = make_env(config(action_space=action_space), load_tracks(["demo_oval", "gen_03"]))
    env.action_space.seed(0)
    for episode in range(5):
        env.reset(seed=episode)
        for k in range(1, env.max_steps + 1):
            _, r, terminated, truncated, _ = env.step(env.action_space.sample())
            assert math.isfinite(r)
            if terminated or truncated:
                break
        assert terminated or truncated
        assert k <= env.max_steps


def test_full_lap_on_demo_oval(make_env):
    env = make_env(tracks=OVAL)
    env.reset(seed=0)
    total = 0.0
    for _ in range(env.max_steps):
        _, r, terminated, truncated, info = env.step(follow_centreline(env))
        total += r
        if terminated or truncated:
            break
    assert terminated and not info["off_track"]
    assert info["checkpoint"] == N_CHECKPOINTS
    assert info["lap_time"] == pytest.approx(env.steps * env.dt)
    assert r > 50.0 - 1.0  # bonus de tour sur le dernier pas
    assert info["progress"] == pytest.approx(1.0, abs=0.01)
    assert total > 50.0
