"""Tests de la physique de la voiture (sim/car.py)."""

import math
from dataclasses import replace

import pytest

from sim.car import DEFAULT_PARAMS, PHYSICS_DT, CarState, path_curvature, step

P = DEFAULT_PARAMS


def delta_for_radius(radius: float) -> float:
    """Steering angle whose kinematic CG path has the given radius (inverse of path_curvature)."""
    beta = math.asin(P.l_r / radius)  # sin(beta) = l_r / R
    return math.atan(math.tan(beta) * P.L / P.l_r)  # tan(delta) = (L / l_r) tan(beta)


def braking_distance(v_start: float, v_end: float, mu: float, params=P) -> float:
    """Simulated distance (m) to brake in a straight line from v_start down to v_end."""
    state = CarState(v=v_start)
    while state.v > v_end:
        state, _ = step(state, (0.0, 0.0, 1.0), mu, dt=PHYSICS_DT, substeps=1, params=params)
    return state.x


def analytic_braking_distance(v1: float, v2: float, a: float, c: float) -> float:
    """Exact distance for dv/dt = -(a + c v²): d = ln((a + c v1²) / (a + c v2²)) / (2c)."""
    if c == 0.0:
        return (v1**2 - v2**2) / (2 * a)
    return math.log((a + c * v1**2) / (a + c * v2**2)) / (2 * c)


# 1. Vitesse de pointe
def test_top_speed_tends_to_sqrt_a_max_over_c_d():
    state = CarState()
    for _ in range(1200):  # 1200 * 0,05 s = 60 s
        state, _ = step(state, (0.0, 1.0, 0.0), mu=1.0)
    v_top = math.sqrt(P.a_max / P.c_d)  # ≈ 63,25 m/s
    assert state.v == pytest.approx(v_top, rel=0.01)


# 2. Pas de rotation à l'arrêt
def test_no_rotation_when_stopped():
    state = CarState(psi=0.3)
    for _ in range(50):
        state, slip = step(state, (1.0, 0.0, 0.0), mu=1.0)
        assert not slip
    assert state.psi == 0.3
    assert (state.x, state.y, state.v) == (0.0, 0.0, 0.0)
    assert state.delta == pytest.approx(P.delta_max)  # les roues ont bien braqué


# 3. Virage : dpsi/dt = (v / l_r) sin(beta)
def test_yaw_rate_at_20_m_s_and_delta_0_05():
    v, delta = 20.0, 0.05
    throttle = P.c_d * v**2 / P.a_max  # compense exactement la traînée
    state = CarState(v=v, delta=delta)
    new, slip = step(state, (delta / P.delta_max, throttle, 0.0), mu=1.0, dt=PHYSICS_DT, substeps=1)
    assert not slip
    assert new.v == pytest.approx(v, abs=1e-9)
    yaw_rate = (new.psi - state.psi) / PHYSICS_DT
    assert yaw_rate == pytest.approx(0.278, abs=1e-3)


# 4. Sous-virage quand v² / R > mu * g
@pytest.mark.parametrize("v, expected_slip", [(30.0, True), (20.0, False)])
def test_understeer_at_radius_50(v, expected_slip):
    delta = delta_for_radius(50.0)
    assert 1.0 / path_curvature(delta) == pytest.approx(50.0)
    state = CarState(v=v, delta=delta)
    throttle = P.c_d * v**2 / P.a_max
    new, slip = step(state, (delta / P.delta_max, throttle, 0.0), mu=1.0, dt=PHYSICS_DT, substeps=1)
    assert slip is expected_slip
    yaw_rate = (new.psi - state.psi) / PHYSICS_DT
    if expected_slip:
        # R_eff = v² / (mu g) > 50 m : la voiture tourne moins que demandé
        r_eff = v**2 / (1.0 * P.g)
        assert yaw_rate == pytest.approx(new.v / r_eff, rel=1e-9)
        assert yaw_rate < new.v / 50.0
    else:
        assert yaw_rate == pytest.approx(new.v / 50.0, rel=1e-9)


# 5. Freinage : moins d'adhérence -> distance plus longue
def test_braking_distance_longer_on_low_grip():
    d_low = braking_distance(60.0, 22.0, mu=0.6)
    d_high = braking_distance(60.0, 22.0, mu=1.0)
    assert d_low > d_high
    # Avec la traînée, le freinage est aidé : ≈ 148 m et ≈ 107 m.
    for d, mu in ((d_low, 0.6), (d_high, 1.0)):
        expected = analytic_braking_distance(60.0, 22.0, mu * P.g, P.c_d)
        assert d == pytest.approx(expected, rel=0.01)


def test_braking_distance_without_drag_matches_v2_over_2_mu_g():
    # Sans traînée (c_d = 0), on retrouve d = (v1² - v2²) / (2 mu g) : ≈ 265 m et ≈ 159 m.
    no_drag = replace(P, c_d=0.0)
    assert braking_distance(60.0, 22.0, 0.6, no_drag) == pytest.approx(264.7, rel=0.01)
    assert braking_distance(60.0, 22.0, 1.0, no_drag) == pytest.approx(158.8, rel=0.01)


# 6. Limites de braquage (angle et vitesse de variation)
@pytest.mark.parametrize("substeps", [1, 5])
def test_steering_angle_and_rate_limits(substeps):
    state = CarState(v=15.0)
    dt = PHYSICS_DT * substeps
    max_change = P.delta_rate_max * dt
    steers = [1.0] * 40 + [-1.0] * 40 + [5.0, -5.0] * 20 + [math.sin(0.3 * k) for k in range(100)]
    for s in steers:
        new, _ = step(state, (s, 0.5, 0.0), mu=1.0, dt=dt, substeps=substeps)
        assert abs(new.delta) <= P.delta_max
        assert abs(new.delta - state.delta) <= max_change + 1e-12
        state = new


# 7. Déterminisme
def test_determinism():
    def run():
        state, slips = CarState(), []
        for k in range(500):
            command = (math.sin(0.05 * k), 0.8 if k % 7 else 0.0, 0.3 if k % 11 == 0 else 0.0)
            state, slip = step(state, command, mu=0.8)
            slips.append(slip)
        return state, slips

    assert run() == run()


def test_negative_mu_is_rejected():
    with pytest.raises(ValueError):
        step(CarState(), (0.0, 0.0, 0.0), mu=-0.1)
