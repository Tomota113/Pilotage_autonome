"""Tests des capteurs de distance (sim/sensors.py), comparés au calcul exact rayon-cercle."""

import math

import numpy as np
import pytest

from sim.sensors import SENSOR_ANGLES, SENSOR_RANGE, read_sensors
from sim.track import Track
from tests.conftest import circle_track_dict


def ray_circle_distance(x, y, angle, radius):
    """Smallest t >= 0 with |(x, y) + t (cos a, sin a)| = radius, or inf."""
    dx, dy = math.cos(angle), math.sin(angle)
    b = x * dx + y * dy
    c = x * x + y * y - radius * radius
    disc = b * b - c
    if disc < 0:
        return math.inf
    roots = [t for t in (-b - math.sqrt(disc), -b + math.sqrt(disc)) if t >= 0]
    return min(roots) if roots else math.inf


def expected_distances(x, y, psi, r_in, r_out):
    return np.array([
        min(ray_circle_distance(x, y, psi + a, r_in), ray_circle_distance(x, y, psi + a, r_out), SENSOR_RANGE)
        for a in SENSOR_ANGLES
    ])


@pytest.mark.parametrize("radius", [100.0, 300.0])
@pytest.mark.parametrize("lateral", [0.0, 2.5])
def test_sensors_match_exact_circle_distances(radius, lateral):
    track = Track(circle_track_dict(radius=radius, width=12.0))
    # Voiture à l'angle theta, décalée vers l'intérieur, cap tangent légèrement tourné
    theta = 0.4
    r = radius - lateral
    x, y, psi = r * math.cos(theta), r * math.sin(theta), theta + math.pi / 2 + 0.1
    got = read_sensors(track, x, y, psi)
    want = expected_distances(x, y, psi, radius - 6.0, radius + 6.0)
    # Les bords sont des polygones inscrits : écart de l'ordre de quelques centimètres
    np.testing.assert_allclose(got, want, atol=0.3)


def test_side_sensors_at_centre_measure_half_width():
    track = Track(circle_track_dict(width=12.0))
    x, y, psi = track.start_pose()
    d = read_sensors(track, x, y, psi)
    assert d[0] == pytest.approx(6.0, abs=1e-6)  # -90° : bord droit (extérieur)
    assert d[-1] == pytest.approx(6.0, abs=1e-6)  # +90° : bord gauche (intérieur)
    # Rayon droit devant : corde jusqu'au bord extérieur, sqrt((R+6)² - R²) ≈ 35,2 m
    assert d[3] == pytest.approx(math.sqrt(106.0**2 - 100.0**2), abs=0.3)


def test_sensors_are_capped_at_range():
    # Grand cercle : la corde vers le bord extérieur (≈ 110 m) dépasse la portée
    track = Track(circle_track_dict(radius=1000.0, width=12.0))
    d = read_sensors(track, *track.start_pose())
    assert d[3] == SENSOR_RANGE
    assert np.all(d <= SENSOR_RANGE)
    assert len(d) == 7


# --- Ligne droite de l'ovale de démonstration (bas : y = -60, largeur 12 m, sens +x) ---


@pytest.fixture
def oval():
    from tools.generate_tracks import demo_oval

    return Track(demo_oval(straight=300.0, radius=60.0))


def test_side_sensors_on_a_straight_measure_half_width(oval):
    pos = oval.project(0.0, -60.0)
    d = read_sensors(oval, 0.0, -60.0, 0.0, index=pos.index)
    assert d[0] == pytest.approx(6.0, abs=1e-6)  # -90° : bord droit, y = -66
    assert d[-1] == pytest.approx(6.0, abs=1e-6)  # +90° : bord gauche, y = -54
    # ±30° et ±60° touchent les bords à 6 / sin(angle)
    assert d[1] == pytest.approx(6.0 / math.sin(math.radians(60)), abs=1e-6)
    assert d[2] == pytest.approx(6.0 / math.sin(math.radians(30)), abs=1e-6)


def test_front_sensor_hits_the_outer_wall_of_the_next_bend(oval):
    # Depuis (100, -60) cap +x, le rayon avant touche le bord extérieur du virage
    # (cercle de centre (150, 0) et de rayon 66) en x = 150 + sqrt(66² - 60²)
    x, y = 100.0, -60.0
    pos = oval.project(x, y)
    d = read_sensors(oval, x, y, 0.0, index=pos.index)
    assert d[3] == pytest.approx(50.0 + math.sqrt(66.0**2 - 60.0**2), abs=0.3)


def test_windowed_sensors_equal_full_search_on_generated_tracks():
    from tools.generate_tracks import generate_track

    for seed in (0, 5, 11):
        track = Track(generate_track(seed, "train"))
        for i in range(0, len(track.points), 7):
            x, y = track.points[i] + 0.3 * (track.left_border[i] - track.points[i])
            psi = track.seg_heading[i] + 0.2
            pos = track.project(x, y)
            np.testing.assert_allclose(read_sensors(track, x, y, psi, index=pos.index), read_sensors(track, x, y, psi))


def test_off_track_detected_at_the_right_step(oval):
    from sim.car import CarState, DEFAULT_PARAMS, step

    # Voiture au centre, cap -0,1 rad (vers le bord droit), 20 m/s maintenus.
    # Elle s'écarte de 20 sin(0,1) * 0,05 m par pas : sortie après 6 / 0,0998 ≈ 60,1 pas.
    v, psi = 20.0, -0.1
    state = CarState(x=0.0, y=-60.0, psi=psi, v=v)
    throttle = DEFAULT_PARAMS.c_d * v**2 / DEFAULT_PARAMS.a_max
    index, first_off = None, None
    for k in range(1, 100):
        state, _ = step(state, (0.0, throttle, 0.0), mu=1.0)
        pos = oval.project(state.x, state.y, hint_index=index)
        index = pos.index
        if oval.is_off_track(pos):
            first_off = k
            break
    expected = math.floor(6.0 / (v * math.sin(-psi) * 0.05)) + 1
    assert expected == 61
    assert first_off == expected
