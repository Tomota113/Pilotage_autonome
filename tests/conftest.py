"""Shared test helpers: synthetic tracks whose geometry is known analytically."""

import math

import pytest


def circle_track_dict(radius: float = 100.0, width: float = 12.0, spacing: float = 5.0, mu: float = 1.0) -> dict:
    """Counter-clockwise circle centred on (0, 0), starting at (radius, 0) heading +y."""
    n = max(50, round(2 * math.pi * radius / spacing))
    centerline = [[radius * math.cos(2 * math.pi * k / n), radius * math.sin(2 * math.pi * k / n)] for k in range(n)]
    return {
        "schema": "f1rl.track/1.0",
        "id": "circle",
        "name": "Cercle de test",
        "split": "train",
        "centerline": centerline,
        "width": [width] * n,
        "mu": [mu] * n,
        "start": {"index": 0, "heading": math.pi / 2},
        "checkpoints": [k * n // 20 for k in range(20)],
        "length": 2 * math.pi * radius,
    }


@pytest.fixture
def circle_dict():
    return circle_track_dict()
