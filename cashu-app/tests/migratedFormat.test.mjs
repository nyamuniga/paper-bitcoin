import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  MIGRATED_FRONTEND_FILES,
  checkMigratedFormat,
  findFormatViolations,
} from '../scripts/check-migrated-format.mjs';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('all migrated frontend modules pass formatting hygiene checks', () => {
  const result = checkMigratedFormat(appRoot);
  assert.equal(result.checkedFiles, MIGRATED_FRONTEND_FILES.length);
  assert.deepEqual(result.violations, []);
});

test('format checker detects CRLF, trailing whitespace, tab indentation, BOM, and EOF newline issues', () => {
  const bom = Buffer.from([0xef, 0xbb, 0xbf]);
  const body = Buffer.from('export const a = 1;  \r\n\tconst b = 2;\n\n', 'utf8');
  const violations = findFormatViolations('src/synthetic.ts', Buffer.concat([bom, body]));
  const rules = violations.map((v) => v.rule);
  assert.ok(rules.includes('UTF-8 BOM is forbidden'));
  assert.ok(rules.includes('CRLF line endings are forbidden (use LF)'));
  assert.ok(rules.includes('trailing whitespace'));
  assert.ok(rules.includes('tab indentation (use spaces)'));
  assert.ok(rules.includes('extra trailing blank line at end of file'));

  const missingEof = findFormatViolations('src/noEof.ts', Buffer.from('export const x = 1;', 'utf8'));
  assert.deepEqual(
    missingEof.map((v) => v.rule),
    ['file must end with a single LF newline'],
  );
});

test('missing listed files fail the format check instead of silently passing', () => {
  const result = checkMigratedFormat(appRoot, ['src/services/missingFormatted.ts']);
  assert.equal(result.checkedFiles, 0);
  assert.equal(result.violations.length, 1);
  assert.equal(result.violations[0].file, 'src/services/missingFormatted.ts');
});
