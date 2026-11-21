"""Check tabular state encoding and the Gymnasium wrapper on the demo oval."""

from itertools import product
from math import sin, radians

import numpy as np
import pytest
from gymnasium.utils.env_checker import check_env

from agents.discretize import SENSOR_ANGLES, DiscreteStateWrapper, decode, discrete_state, encode
from env.f1_env import F1Env, load_tracks
from sim.sensors import SENSOR_RANGE, read_sensors


@pytest.fixture
def oval_env():
    return F1Env({"env": {"action_space": "discrete9"}}, load_tracks(["demo_oval"]))


def test_encode_decode_cover_all_states(oval_env):
    wrapper = DiscreteStateWrapper(oval_env)
    assert wrapper.observation_space.n == 768
    states = set()
    for bins in product(range(4), range(4), range(4), range(4), range(3)):
        state = encode(bins)
        assert decode(state) == bins
        states.add(state)
    assert states == set(range(768))


def test_demo_oval_start_bins(oval_env):
    wrapper = DiscreteStateWrapper(oval_env)
    state, _ = wrapper.reset(seed=0)
    car, pos = oval_env.car, oval_env.pos
    np.testing.assert_allclose(SENSOR_ANGLES, np.radians([-45, 0, 45]))
    distances = read_sensors(oval_env.track, car.x, car.y, car.psi, index=pos.index, angles=SENSOR_ANGLES)
    # La piste fait 12 m de large et la ligne droite se poursuit au-delà de la portée avant.
    diagonal = 6.0 / sin(radians(45))
    np.testing.assert_allclose(distances, [diagonal, SENSOR_RANGE, diagonal])
    assert state == discrete_state(oval_env) == discrete_state(wrapper)
    assert decode(state) == (1, 3, 1, 0, 1)


def test_wrapper_preserves_transition_during_random_episode(oval_env):
    wrapper = DiscreteStateWrapper(oval_env)
    reference = F1Env({"env": {"action_space": "discrete9"}}, oval_env.tracks)
    rng = np.random.default_rng(42)
    state, info = wrapper.reset(seed=0)
    _, reference_info = reference.reset(seed=0)
    assert wrapper.observation_space.contains(state)
    assert info == reference_info

    for _ in range(oval_env.max_steps):
        action = int(rng.integers(wrapper.action_space.n))
        state, reward, terminated, truncated, info = wrapper.step(action)
        assert wrapper.observation_space.contains(state)
        assert (reward, terminated, truncated, info) == reference.step(action)[1:]
        if terminated or truncated:
            break
    else:
        pytest.fail("the episode did not end")


def test_gymnasium_check(oval_env):
    check_env(DiscreteStateWrapper(oval_env), skip_render_check=True)


def test_f1_scheme_has_more_states_and_sees_the_next_bend():
    from agents.discretize import SCHEMES, decode, scheme_of
    from env.f1_env import DEFAULT_CONFIG, F1Env, load_tracks

    assert SCHEMES["v1"].n_states == 768  # série v1 inchangée
    assert SCHEMES["f1_2024"].n_states == 5760
    cfg = {"env": dict(DEFAULT_CONFIG["env"], car="f1_2024", action_space="discrete9")}
    env = DiscreteStateWrapper(F1Env(cfg, load_tracks(["demo_oval"])))
    assert env.observation_space.n == 5760 and scheme_of(env) is SCHEMES["f1_2024"]
    state, _ = env.reset(seed=0)
    bins = decode(state, SCHEMES["f1_2024"].shape)
    assert bins[3] == 0 and bins[4] == 1  # à l'arrêt, aligné sur la piste
    assert bins[5] == 2  # 150 m devant le départ de l'ovale : ligne droite (tranche du milieu)
