"""Tests du générateur de circuits (tools/generate_tracks.py) et des fichiers de tracks/."""

import json
from pathlib import Path

import numpy as np
import pytest

from sim.track import Track
from tools.generate_tracks import (
    LENGTH_RANGE, MIN_GAP, MIN_RADIUS, demo_oval, generate_track, max_curvature, min_gap,
)

TRACKS_DIR = Path(__file__).resolve().parent.parent / "tracks"


@pytest.mark.parametrize("seed", [0, 7, 12])
def test_generated_track_respects_constraints(seed):
    track = Track(generate_track(seed, "train"))
    assert LENGTH_RANGE[0] <= track.length <= LENGTH_RANGE[1]
    assert max_curvature(track.points) <= 1.0 / MIN_RADIUS
    assert min_gap(track.points) >= MIN_GAP
    # Points espacés d'environ 5 m
    np.testing.assert_allclose(track.seg_len, 5.0, rtol=0.05)


def test_generation_is_deterministic_per_seed():
    assert generate_track(3, "train") == generate_track(3, "train")
    assert generate_track(3, "train")["centerline"] != generate_track(4, "train")["centerline"]


def test_demo_oval_is_a_stadium():
    track = Track(demo_oval(straight=300.0, radius=60.0))
    assert track.split == "demo"
    assert track.length == pytest.approx(600.0 + 2 * np.pi * 60.0, rel=1e-3)


def test_committed_tracks_match_the_generator():
    """Les fichiers de tracks/ sont exactement ceux que produit le générateur."""
    expected = {f"gen_{k:02d}" for k in range(15)} | {"demo_oval"}
    files = {p.stem: p for p in TRACKS_DIR.glob("*.json")}
    assert set(files) == expected
    for track_id, path in files.items():
        data = json.loads(path.read_text(encoding="utf-8"))
        Track(data)
        if track_id.startswith("gen_"):
            seed = int(track_id[4:])
            assert data["split"] == ("train" if seed < 10 else "test")
            assert data == generate_track(seed, data["split"])
