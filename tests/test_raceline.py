"""Tests de la trajectoire idéale (sim/raceline.py) et du pilote qui la suit (agents/raceline_driver.py)."""

import math

import numpy as np
import pytest

from agents.raceline_driver import RacelineDriver
from env.f1_env import DEFAULT_CONFIG, F1Env, load_tracks
from sim.raceline import MARGIN, RacingLine, _geometry, racing_line, speed_profile
from sim.track import Track
from tests.conftest import circle_track_dict
from tools.generate_tracks import demo_oval


@pytest.mark.parametrize("track_id", ["demo_oval", "gen_10", "f1_monza"])
def test_racing_line_stays_inside_the_track(track_id):
    track = load_tracks([track_id])[0]
    line = racing_line(track)
    for x, y in line.points:
        pos = track.project(x, y)
        # bornes calculées le long des normales : au plus quelques dizaines de cm dans la marge de 1,6 m
        assert abs(pos.lateral) <= pos.half_width - MARGIN + 0.5


@pytest.mark.parametrize("track_id", ["gen_10", "f1_monza", "f1_silverstone"])
def test_racing_line_widens_bends_and_is_faster_than_the_centreline(track_id):
    track = load_tracks([track_id])[0]
    line = racing_line(track)
    s, k, length = _geometry(track.points)
    centre = RacingLine(track.points, s, k, length)
    assert np.abs(line.curvature).max() < np.abs(centre.curvature).max()  # virages plus larges
    assert speed_profile(line, 1.0).lap_time < 0.95 * speed_profile(centre, 1.0).lap_time


def test_speed_profile_on_a_circle_is_the_grip_limit():
    # Sur un cercle, la ligne idéale est le cercle lui-même : v = sqrt(mu g R) partout
    track = Track(circle_track_dict(radius=100.0))
    s, k, length = _geometry(track.points)
    profile = speed_profile(RacingLine(track.points, s, k, length), mu=0.8)
    np.testing.assert_allclose(profile.speed, math.sqrt(0.8 * 9.81 * 100.0), rtol=0.02)
    assert profile.lap_time == pytest.approx(length / math.sqrt(0.8 * 9.81 * 100.0), rel=0.02)


def test_less_grip_means_slower_ideal_lap():
    line = racing_line(Track(demo_oval()))
    times = [speed_profile(line, mu).lap_time for mu in (1.0, 0.8, 0.6)]
    assert times[0] < times[1] < times[2]


@pytest.mark.parametrize("track_id", ["demo_oval", "f1_spielberg"])
def test_racing_line_driver_laps_and_beats_classic(track_id):
    from agents.classic_driver import ClassicDriver

    env = F1Env({"env": dict(DEFAULT_CONFIG["env"], max_steps=6000)}, load_tracks([track_id]))

    def lap(driver):
        env.reset(seed=0, options={"mu_factor": 1.0})
        while True:
            _, _, terminated, truncated, info = env.step(driver.act(env))
            if terminated or truncated:
                return info["lap_time"]

    t_line, t_classic = lap(RacelineDriver()), lap(ClassicDriver())
    assert t_line is not None and t_classic is not None
    assert t_line < t_classic
