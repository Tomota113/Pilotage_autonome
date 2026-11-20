"""Tests de la piste (sim/track.py) : chargement, projection, sortie, progression, courbure."""

import json
import math

import pytest

from sim.track import Track
from tests.conftest import circle_track_dict

R = 100.0  # rayon du cercle de test (m)


def polygon_length(n: int, radius: float = R) -> float:
    """Perimeter of the regular n-gon inscribed in the circle."""
    return n * 2 * radius * math.sin(math.pi / n)


# --- Chargement et validation du contrat ---


def test_load_valid_track(circle_dict):
    track = Track(circle_dict)
    n = len(circle_dict["centerline"])
    # La longueur est recalculée au chargement (polygone inscrit, un peu < 2 pi R)
    assert track.length == pytest.approx(polygon_length(n))
    assert track.start_pose() == pytest.approx((R, 0.0, math.pi / 2))
    assert len(track.checkpoint_s) == 20 and track.checkpoint_s[0] == 0.0


def test_load_from_json_file(tmp_path, circle_dict):
    path = tmp_path / "circle.json"
    path.write_text(json.dumps(circle_dict), encoding="utf-8")
    assert Track.from_json(path).length == pytest.approx(Track(circle_dict).length)


@pytest.mark.parametrize(
    "corrupt",
    [
        lambda d: d.update(schema="f1rl.track/2.0"),
        lambda d: d.pop("mu"),
        lambda d: d.update(id="Monza 2D"),
        lambda d: d.update(split="valid"),
        lambda d: d.update(width=d["width"][:-1]),
        lambda d: d.update(mu=[0.2] * len(d["mu"])),
        lambda d: d.update(width=[0.0] * len(d["width"])),
        lambda d: d.update(checkpoints=d["checkpoints"][:19]),
        lambda d: d.update(checkpoints=d["checkpoints"][::-1]),
        lambda d: d.update(start={"index": 3, "heading": 0.0}),
        lambda d: d.update(centerline=d["centerline"][:40], width=d["width"][:40], mu=d["mu"][:40]),
    ],
    ids=["schema", "missing_mu", "id", "split", "lengths", "mu_range", "width", "n_checkpoints",
         "checkpoint_order", "start_not_first_checkpoint", "too_few_points"],
)
def test_invalid_track_is_rejected(circle_dict, corrupt):
    corrupt(circle_dict)
    with pytest.raises(ValueError):
        Track(circle_dict)


def test_duplicate_points_are_rejected(circle_dict):
    circle_dict["centerline"][1] = circle_dict["centerline"][0]
    with pytest.raises(ValueError):
        Track(circle_dict)


# --- Projection sur la ligne centrale ---


@pytest.mark.parametrize("theta", [0.0, 0.7, 2.0, 3.5, 6.0])
@pytest.mark.parametrize("offset", [-4.0, 0.0, 3.0])
def test_projection_on_circle(circle_dict, theta, offset):
    track = Track(circle_dict)
    # Sur un cercle parcouru dans le sens trigonométrique, la gauche est vers le centre :
    # un point au rayon R - offset est décalé de +offset (à gauche).
    r = R - offset
    pos = track.project(r * math.cos(theta), r * math.sin(theta))
    assert pos.s == pytest.approx(R * theta, abs=0.5)  # polygone ≈ cercle
    assert pos.lateral == pytest.approx(offset, abs=0.1)
    assert pos.half_width == pytest.approx(6.0)
    assert pos.mu == pytest.approx(1.0)
    # Cap de la piste = tangente au cercle = theta + pi/2
    assert math.cos(pos.heading - (theta + math.pi / 2)) == pytest.approx(1.0, abs=1e-3)


@pytest.mark.parametrize("offset, off", [(5.9, False), (-5.9, False), (6.1, True), (-6.1, True), (30.0, True)])
def test_off_track_when_distance_exceeds_half_width(circle_dict, offset, off):
    track = Track(circle_dict)
    r = R - offset
    pos = track.project(r * math.cos(1.0), r * math.sin(1.0))
    assert track.is_off_track(pos) is off


def test_width_and_mu_are_interpolated():
    d = circle_track_dict()
    n = len(d["centerline"])
    d["width"] = [10.0 if k % 2 == 0 else 14.0 for k in range(n)]
    d["mu"] = [0.6 if k % 2 == 0 else 1.0 for k in range(n)]
    track = Track(d)
    # Milieu du segment [P_0, P_1] : moyenne des deux points
    mid = (track.points[0] + track.points[1]) / 2
    pos = track.project(*mid)
    assert pos.index == 0
    assert pos.half_width == pytest.approx(6.0)
    assert pos.mu == pytest.approx(0.8)


# --- Progression le long de la ligne centrale ---


def test_progress_delta_unwraps_finish_line(circle_dict):
    track = Track(circle_dict)
    L = track.length
    assert track.progress_delta(10.0, 13.0) == pytest.approx(3.0)
    assert track.progress_delta(13.0, 10.0) == pytest.approx(-3.0)  # marche arrière
    assert track.progress_delta(L - 2.0, 1.0) == pytest.approx(3.0)  # passage de la ligne
    assert track.progress_delta(1.0, L - 2.0) == pytest.approx(-3.0)


def test_progress_along_a_lap_sums_to_length(circle_dict):
    track = Track(circle_dict)
    s_prev, total = track.project(*track.start_pose()[:2]).s, 0.0
    for k in range(1, 361):
        theta = math.radians(k)
        s = track.project(R * math.cos(theta), R * math.sin(theta)).s
        total += track.progress_delta(s_prev, s)
        s_prev = s
    assert total == pytest.approx(track.length, rel=1e-6)


# --- Courbure ---


@pytest.mark.parametrize("radius", [50.0, 100.0, 300.0])
def test_curvature_of_circle_is_one_over_radius(radius):
    track = Track(circle_track_dict(radius=radius))
    for s in (0.0, 17.0, track.length / 2, track.length + 30.0):
        assert track.curvature_at(s) == pytest.approx(1.0 / radius, rel=1e-2)


def test_curvature_sign_clockwise_is_negative():
    d = circle_track_dict()
    d["centerline"] = d["centerline"][::-1]  # sens horaire : virages à droite
    d["start"]["heading"] = -math.pi / 2
    track = Track(d)
    assert track.curvature_at(10.0) == pytest.approx(-1.0 / R, rel=1e-2)
