import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '../..');
function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bitnotes-release-config-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const files = {
    'scripts/check-release.mjs': fs.readFileSync(path.join(root, 'scripts/check-release.mjs'), 'utf8'),
    'cashu-app/package.json': JSON.stringify({version: '1.0.0'}),
    'cashu-app/package-lock.json': JSON.stringify({version: '1.0.0', packages: {'': {version: '1.0.0'}, 'node_modules/@tauri-apps/api': {version: '2.0.0'}}}),
    'cashu-app/src-tauri/tauri.conf.json': JSON.stringify({version: '1.0.0'}),
    'cashu-app/src-tauri/Cargo.toml': 'version = "1.0.0"',
    'Cargo.lock': '[[package]]\nname = "tauri"\nversion = "2.0.0"',
    'CHANGELOG.md': '## [1.0.0]',
    'website/config.js': '/v1.0.0/bitnotes-android-wallet-v1.0.0.apk /v1.0.0/bitnotes_1.0.0_aarch64.dmg',
    'website/index.html': 'config.js?v=1.0.0 id="version-text">v1.0.0</span> id="mobile-version-text">v1.0.0</span>',
  };
  for (const [file, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    fs.writeFileSync(path.join(dir, file), text);
  }
  fs.mkdirSync(path.join(dir, 'crates'));
  fs.mkdirSync(path.join(dir, 'cashu-app/src'));
  fs.writeFileSync(path.join(dir, '.gitignore'), '*.local.ts\n');
  execFileSync('git', ['init', '-q'], { cwd: dir });
  return {
    write(file, text) { fs.writeFileSync(path.join(dir, file), text); },
    track(file) { execFileSync('git', ['add', '-f', file], { cwd: dir }); },
    check() { return spawnSync(process.execPath, ['scripts/check-release.mjs'], { cwd: dir, encoding: 'utf8' }); },
  };
}

test('release check permits private configuration imports and an unconfigured template', t => {
  const f = fixture(t);
  f.write('cashu-app/src/service.ts', "import { ENCRYPTION_KEY } from './constants.local';\n");
  f.write('cashu-app/src/constants.example.ts', "// export const ENCRYPTION_KEY: string = ;\n");
  const result = f.check();
  assert.equal(result.status, 0, result.stderr);
});

for (const file of ['constants.local.ts', 'constants.ts']) {
  test(`release check rejects forcibly tracked ${file}`, t => {
    const f = fixture(t);
    f.write(`cashu-app/src/${file}`, "export const ENCRYPTION_KEY = '';\n");
    f.track(`cashu-app/src/${file}`);
    const result = f.check();
    assert.equal(result.status, 1);
    assert.match(result.stderr, /private\/generated path must not be published/);
  });
}

test('release check rejects a credential in the public constants template', t => {
  const f = fixture(t);
  f.write('cashu-app/src/constants.example.ts', `export const BREEZ_API_KEY = '${randomBytes(24).toString('hex')}';\n`);
  const result = f.check();
  assert.equal(result.status, 1);
  assert.match(result.stderr, /configuration fields in public templates must be blank/);
});

test('release check detects local constants credentials copied into public files without printing values', t => {
  const f = fixture(t);
  const credential = randomBytes(24).toString('hex');
  f.write('cashu-app/src/constants.local.ts', `export const ENCRYPTION_KEY = '${credential}';\n`);
  f.write('cashu-app/src/leak.ts', `export const accidental = '${credential}';\n`);
  const result = f.check();
  assert.equal(result.status, 1);
  assert.match(result.stderr, /contains a locally configured credential; value withheld/);
  assert.ok(!result.stderr.includes(credential));
});

for (const [name, value] of [['SPREAD', '0.021'], ['MOMO_API_BASE_URL', "'https://example.invalid'"]]) {
  test(`release check rejects a configured ${name} in the public template`, t => {
    const f = fixture(t);
    f.write('cashu-app/src/constants.example.ts', `export const ${name} = ${value};\n`);
    const result = f.check();
    assert.equal(result.status, 1);
    assert.match(result.stderr, /configuration fields in public templates must be blank/);
  });
}

for (const declaration of ["export const SPREAD = 0.021", "// export const SPREAD: number = 0.021;"]) {
  test(`release check rejects configured template declaration: ${declaration}`, t => {
    const f = fixture(t);
    f.write('cashu-app/src/constants.example.ts', `${declaration}\n`);
    const result = f.check();
    assert.equal(result.status, 1);
    assert.match(result.stderr, /configuration fields in public templates must be blank/);
  });
}
