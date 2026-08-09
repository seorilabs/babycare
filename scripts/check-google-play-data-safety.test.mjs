import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import test from 'node:test';

const pythonProbe = String.raw`
import importlib.util
from pathlib import Path

path = Path("scripts/apply-google-play-data-safety.py")
spec = importlib.util.spec_from_file_location("data_safety", path)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

assert module.normalize_sharing_purposes({}, "TYPE") == []
assert module.normalize_sharing_purposes({"sharingPurposes": None}, "TYPE") == []
assert module.normalize_sharing_purposes({"sharingPurposes": ["ADS"]}, "TYPE") == ["ADS"]

for invalid in ("ADS", {"ADS": True}, ["ADS", None]):
    try:
        module.normalize_sharing_purposes({"sharingPurposes": invalid}, "TYPE")
    except ValueError:
        pass
    else:
        raise AssertionError(f"invalid value accepted: {invalid!r}")
`;

test('Data Safety sharingPurposes는 null을 빈 목록으로 정규화하고 잘못된 타입을 거부한다', () => {
  const result = spawnSync('python3', ['-c', pythonProbe], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});
