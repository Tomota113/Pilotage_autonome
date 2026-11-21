"""Check that browser-generated YAML follows the Python data contract."""

from pathlib import Path
import shutil
import subprocess
import sys

import pytest
import yaml


ROOT = Path(__file__).resolve().parents[1]


@pytest.mark.parametrize("algo", ["dqn", "sarsa"])
def test_training_yaml_can_be_read_and_validated(tmp_path, algo):
    node = shutil.which("node")
    if node is None:
        pytest.skip("Node.js est nécessaire pour générer le YAML de l’application")

    output = subprocess.check_output(
        [node, "--input-type=module", "-e", """
import { buildTrainingYaml, TRAINING_DEFAULTS } from './app/src/data/yaml.js';
process.stdout.write(buildTrainingYaml({
  ...TRAINING_DEFAULTS,
  algo: process.argv[1], seed: '2', totalSteps: '75000',
  trainTracks: ['gen_00', '01'], testTracks: ['gen_10'],
  muMode: 'uniform', muMin: '1e-7', muMax: '1.1',
  reward: { ...TRAINING_DEFAULTS.reward, lambda_steer: '0' },
}));
""", algo],
        cwd=ROOT,
        text=True,
    )
    path = tmp_path / "config.yaml"
    path.write_text(output, encoding="utf-8")
    result = subprocess.run(
        [sys.executable, str(ROOT / "tools" / "validate.py"), str(path)],
        cwd=ROOT,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, result.stdout + result.stderr

    config = yaml.safe_load(output)
    assert config["schema"] == "f1rl.config/1.3"
    assert config["algo"] == algo
    assert config["seed"] == 2
    assert config["total_steps"] == 75000
    assert config["tracks"] == {"train": ["gen_00", "01"], "test": ["gen_10"]}
    assert config["mu"] == {"mode": "uniform", "value": 1, "range": [1e-7, 1.1]}
    assert config["env"]["action_space"] == "discrete9"
    assert config["env"]["observe_mu"] is False
    assert config["hyperparams"] == {}
    assert config["reward"]["lambda_steer"] == 0
