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
