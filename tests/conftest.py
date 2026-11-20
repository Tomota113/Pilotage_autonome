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


# --- Environnement : code de l'étudiant ou implémentation de référence ---


def pytest_addoption(parser):
    parser.addoption(
        "--reference-env",
        action="store_true",
        help="tester F1Env avec env/reference_impl.py au lieu du reset()/step() de l'étudiant",
    )


@pytest.fixture
def make_env(request):
    """Factory ``make_env(config=None, tracks=None)`` returning the environment under test.

    Par défaut : F1Env, donc le reset()/step() de l'étudiant. Tant qu'ils lèvent
    NotImplementedError, les tests qui en dépendent sont sautés (skip).
    Avec ``pytest --reference-env`` : l'implémentation de référence.
    """
    if request.config.getoption("--reference-env"):
        from env.reference_impl import ReferenceF1Env as env_cls
    else:
        from env.f1_env import F1Env as env_cls

    def factory(config=None, tracks=None):
        env = env_cls(config, tracks)
        try:
            env.reset(seed=0)
        except NotImplementedError:
            pytest.skip("reset()/step() pas encore écrits : lancer `pytest --reference-env` pour la référence")
        return env

    return factory
