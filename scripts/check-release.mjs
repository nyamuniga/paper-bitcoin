#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const json = file => JSON.parse(read(file));
const failures = [];
const assert = (condition, message) => {if (!condition) failures.push(message);};
const version = json('cashu-app/package.json').version;
assert(/^\d+\.\d+\.\d+$/.test(version), 'App version must be a release semver.');
const lock = json('cashu-app/package-lock.json');
assert(lock.version === version && lock.packages[''].version === version, 'npm lockfile version differs from package.json.');
assert(json('cashu-app/src-tauri/tauri.conf.json').version === version, 'Tauri version differs from package.json.');
for (const crate of ['cashu-app/src-tauri', ...fs.readdirSync(path.join(root, 'crates')).map(name => `crates/${name}`)]) {
  const manifest = `${crate}/Cargo.toml`;
  if (!fs.existsSync(path.join(root, manifest))) continue;
  assert(/^version\s*=\s*"([^"]+)"/m.exec(read(manifest))?.[1] === version, `${manifest}: package version differs.`);
}
const website = read('website/config.js');
assert(website.includes(`/v${version}/bitnotes-android-wallet-v${version}.apk`), 'Website Android link version differs.');
assert(website.includes(`/v${version}/bitnotes_${version}_aarch64.dmg`), 'Website macOS link version differs.');
const html = read('website/index.html');
assert(html.includes(`config.js?v=${version}`), 'Website config cache version differs.');
for (const id of ['version-text', 'mobile-version-text']) assert(html.includes(`id="${id}">v${version}</span>`), `Website ${id} version differs.`);
assert(read('CHANGELOG.md').includes(`## [${version}]`), 'Release changelog is missing.');
assert(fs.existsSync(path.join(root, 'Cargo.lock')), 'Rust application lockfile is missing.');

// Tauri's native CLI requires each Rust/JavaScript pair to share major/minor versions.
const cargoPackages = read('Cargo.lock').split('[[package]]').map(block => ({
  name: /^name = "([^"]+)"/m.exec(block)?.[1],
  version: /^version = "([^"]+)"/m.exec(block)?.[1],
}));
const tauriPairs = [
  ['tauri', '@tauri-apps/api'],
  ...cargoPackages.filter(pkg => pkg.name?.startsWith('tauri-plugin-')).map(pkg => [pkg.name, `@tauri-apps/plugin-${pkg.name.slice('tauri-plugin-'.length)}`]).filter(([, javascript]) => lock.packages[`node_modules/${javascript}`]),
];
for (const [rust, javascript] of tauriPairs) {
  const native = cargoPackages.find(pkg => pkg.name === rust)?.version;
  const frontend = lock.packages[`node_modules/${javascript}`]?.version;
  const majorMinor = version => /^(\d+\.\d+)\./.exec(version ?? '')?.[1];
  assert(native && frontend && majorMinor(native) === majorMinor(frontend), `${rust} ${native ?? 'missing'} and ${javascript} ${frontend ?? 'missing'} must have matching major/minor versions.`);
}

// Check the proposed public tree, including tracked files that someone forced past .gitignore.
const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], {cwd: root, encoding: 'utf8'}).split('\0').filter(Boolean);
const prohibited = /(?:^|\/)(?:credentials|keystores?|notes|new-notes|newnotes|demo-notes|node_modules|dist|target)(?:\/|$)|(?:^|\/)\.env(?:\..*)?$|(?:^|\/)wallet[^/]*\.(?:json|bak)$|\.(?:jks|keystore|pem|key|p12|pfx|mobileprovision|apk|aab|dmg|ipa|log|bak|orig|rej)$|(?:^|\/)(?:key|keystore)\.properties$|\.local(?:\.ts)?$/i;
const secrets = [
  ['private key', /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/],
  ['GitHub credential', /(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{50,})/],
  ['AWS access key', /(?:AKIA|ASIA)[A-Z0-9]{16}/],
  ['Nostr private key', /nsec1[023456789acdefghjklmnpqrstuvwxyz]{58}/],
];
const localSecrets = new Set();
for (const file of ['.env', 'cashu-app/.env', 'cashu-app/src-tauri/.env']) {
  if (!fs.existsSync(path.join(root, file))) continue;
  for (const line of read(file).split('\n')) {
    const match = /^\s*(?:export\s+)?(\w+)\s*=\s*(.*?)\s*$/.exec(line);
    if (!match || !/(?:KEY|PASSWORD|SECRET)/i.test(match[1])) continue;
    const value = match[2].replace(/^["']|["']$/g, '');
    if (value.length >= 16 && !/^(?:https?:|your_|example)/i.test(value)) localSecrets.add(value);
  }
}
let scanned = 0;
for (const file of new Set(files)) {
  if (!fs.existsSync(path.join(root, file))) continue;
  if (!file.endsWith('/.env.example') && file !== '.env.example') assert(!prohibited.test(file), `${file}: private/generated path must not be published.`);
  const bytes = fs.readFileSync(path.join(root, file));
  if (bytes.subarray(0, 8000).includes(0) || bytes.length > 5_000_000) continue;
  const text = bytes.toString('utf8');
  scanned++;
  if (/(?:^|\/)\.?env\.example$/.test(file)) {
    for (const line of text.split('\n')) {
      const field = /^\s*(\w+)\s*=\s*(.*?)\s*$/.exec(line);
      if (field && /KEY|PASSWORD|SECRET/i.test(field[1])) assert(field[2] === '' || field[2] === '""' || field[2] === "''", `${file}: credential fields in public templates must be blank.`);
    }
  }
  for (const [name, rule] of secrets) assert(!rule.test(text), `${file}: possible ${name}; value withheld.`);
  for (const secret of localSecrets) assert(!text.includes(secret), `${file}: contains a locally configured credential; value withheld.`);
  if (file.startsWith('cashu-app/src/') && /\.tsx?$/.test(file)) {
    assert(!/from\s+['"][^'"]*constants\.local['"]/.test(text), `${file}: depends on private local configuration.`);
    assert(!/console\.(?:log|debug)\s*\(/.test(text), `${file}: remove production debug logging.`);
  }
  // The CLI intentionally offers explicit wallet-key display/export commands.
  if (/\.(?:ts|tsx|rs)$/.test(file) && !file.startsWith('crates/ecash-cli/')) {
    for (const line of text.split('\n')) {
      if (/(?:console\.(?:warn|error|info)|e?println!|tracing::\w+!)/.test(line)) {
        assert(!/(?:,\s*(?:authHeader|privateKey|phoneNumber)|p\.secret|seed_hex|token_v[34])/.test(line), `${file}: possible sensitive log arguments; value withheld.`);
      }
    }
  }
}
if (process.argv.includes('--history')) {
  const objects = execFileSync('git', ['rev-list', '--objects', '--all'], {cwd: root, encoding: 'utf8'}).trim().split('\n');
  const candidates = objects.filter(line => line.includes(' ')).map(line => {
    const space = line.indexOf(' ');
    return {oid: line.slice(0, space), file: line.slice(space + 1)};
  }).filter(({file}) => /\.(?:[cm]?[jt]sx?|rs|json|toml|md|properties|ya?ml|sh|kts|gradle|txt|html)$|(?:^|\/)\.env(?:\..+)?$/i.test(file));
  const blobs = execFileSync('git', ['cat-file', '--batch'], {
    cwd: root, input: candidates.map(({oid}) => oid).join('\n') + '\n', maxBuffer: 128 * 1024 * 1024,
  });
  const historyFindings = new Set();
  let offset = 0;
  for (const {file} of candidates) {
    const end = blobs.indexOf(10, offset);
    const header = blobs.subarray(offset, end).toString('utf8').split(' ');
    const size = Number(header[2]);
    const body = blobs.subarray(end + 1, end + 1 + size);
    offset = end + 1 + size + 1;
    if (header[1] !== 'blob' || body.subarray(0, 8000).includes(0)) continue;
    const text = body.toString('utf8');
    for (const [name, rule] of secrets) if (rule.test(text)) historyFindings.add(`${file}: historical ${name}; coordinate rotation/history cleanup before publishing.`);
    for (const secret of localSecrets) if (text.includes(secret)) historyFindings.add(`${file}: historical locally configured credential; coordinate rotation/history cleanup before publishing.`);
  }
  failures.push(...historyFindings);
}
if (failures.length) {
  for (const message of failures) console.error(message);
  process.exitCode = 1;
} else console.log(`Release ${version}: versions match; ${scanned} public text files passed file/credential hygiene checks.`);
