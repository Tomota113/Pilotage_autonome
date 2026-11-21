"""Tests de la physique de la voiture (sim/car.py)."""

import math
from dataclasses import replace

import pytest

from sim.car import DECISION_DT, DEFAULT_PARAMS, F1_2024, PHYSICS_DT, CarState, path_curvature, step

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


def test_f1_top_speed_and_0_to_100():
    state = CarState()
    time_to_100 = None
    for i in range(round(40 / DECISION_DT)):
        state, _ = step(state, (0.0, 1.0, 0.0), mu=1.0, params=F1_2024)
        if time_to_100 is None and state.v * 3.6 >= 100:
            time_to_100 = (i + 1) * DECISION_DT
    assert 330 <= F1_2024.top_speed * 3.6 <= 355
    assert 330 <= state.v * 3.6 <= 355
    assert state.v == pytest.approx(F1_2024.top_speed, rel=0.01)
    assert time_to_100 is not None and 2.0 <= time_to_100 <= 3.5


def test_f1_grip_increases_with_speed():
    start, mid, fast = (F1_2024.grip(1.0, kmh / 3.6) / F1_2024.g for kmh in (0, 150, 300))
    assert start == pytest.approx(1.8, abs=0.05)
    assert start < mid < fast
    assert fast > 5.0


def test_f1_braking_distance():
    start, end = 300 / 3.6, 100 / 3.6
    dry = braking_distance(start, end, mu=1.0, params=F1_2024)
    assert 60 <= dry <= 130
    assert braking_distance(start, end, mu=0.6, params=F1_2024) > dry


def test_f1_friction_circle_reduces_braking_in_a_tight_turn():
    start = CarState(v=300 / 3.6)
    straight, _ = step(start, (0.0, 0.0, 1.0), mu=1.0, params=F1_2024)
    # Volant déjà braqué à l'entrée du virage pour que la comparaison porte sur l'adhérence.
    corner, _ = step(replace(start, delta=F1_2024.delta_max), (1.0, 0.0, 1.0), mu=1.0, params=F1_2024)
    assert 0 < start.v - corner.v < start.v - straight.v


def test_f1_determinism():
    def run():
        state = CarState(v=65.0)
        trajectory = []
        for k in range(200):
            command = (math.sin(0.05 * k), 0.8, 0.3 if k % 11 == 0 else 0.0)
            state, slip = step(state, command, mu=0.8, params=F1_2024)
            trajectory.append((state, slip))
        return trajectory

    assert run() == run()


def test_default_params_match_v1_equations_exactly():
    actual = expected = CarState(x=1.0, y=-2.0, psi=0.3, v=30.0)
    mu, h = 0.8, 0.01
    for steer, throttle, brake in [(0.0, 0.6, 0.0), (1.0, 0.0, 1.0), (-1.0, 0.4, 0.3)]:
        expected_slip = False
        for _ in range(5):
            # Constantes et équations v1 indépendantes des paramètres et fonctions du simulateur.
            delta = expected.delta + max(-2.0 * h, min(2.0 * h, 0.4 * steer - expected.delta))
            a = 10.0 * throttle - min(15.0 * brake, mu * 9.81) - 0.0025 * expected.v**2
            v = max(0.0, expected.v + a * h)
            kappa = math.sin(math.atan(0.5 * math.tan(delta))) / 1.8
            if v * v * abs(kappa) > mu * 9.81:
                expected_slip = True
                kappa = math.copysign(mu * 9.81 / (v * v), kappa)
            beta = math.asin(1.8 * kappa)
            expected = CarState(
                x=expected.x + v * math.cos(expected.psi + beta) * h,
                y=expected.y + v * math.sin(expected.psi + beta) * h,
                psi=expected.psi + (v / 1.8) * math.sin(beta) * h,
                v=v,
                delta=delta,
            )
        actual, slip = step(actual, (steer, throttle, brake), mu=mu, params=DEFAULT_PARAMS)
        assert (actual, slip) == (expected, expected_slip)
