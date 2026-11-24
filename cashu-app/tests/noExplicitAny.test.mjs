import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  MIGRATED_NATIVE_ADAPTERS,
  checkNoExplicitAny,
  findExplicitAnyUsages,
} from '../scripts/check-no-explicit-any.mjs';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('all migrated native adapters have zero explicit any types', () => {
  const result = checkNoExplicitAny(appRoot);
  assert.equal(result.checkedFiles, MIGRATED_NATIVE_ADAPTERS.length);
  assert.deepEqual(result.violations, []);
});

test('explicit any is caught across return types, generics, parameters, assertions, and fields', () => {
  const source = `
    interface BadResponse { payload: any; }
    async function callNative(arg: any): Promise<any> {
      const res = await invoke<any>('cmd', { arg });
      return res as any;
    }
  `;
  const violations = findExplicitAnyUsages('src/services/syntheticAdapter.ts', source);
  assert.equal(violations.length, 5);
  assert.deepEqual(
    violations.map((v) => v.line),
    [2, 3, 3, 4, 5],
  );
});

test('comments, identifiers, and string literals containing "any" do not trigger false positives', () => {
  const source = `
    // never use any here
    /* any type is forbidden */
    export const company = 'any';
    export function hasAnyValue(values: readonly unknown[]): boolean {
      return values.length > 0;
    }
  `;
  const violations = findExplicitAnyUsages('src/services/syntheticAdapter.ts', source);
  assert.deepEqual(violations, []);
});

test('missing listed adapter files fail the check instead of silently passing', () => {
  const result = checkNoExplicitAny(appRoot, ['src/services/missingAdapter.ts']);
  assert.equal(result.checkedFiles, 0);
  assert.equal(result.violations.length, 1);
  assert.equal(result.violations[0].file, 'src/services/missingAdapter.ts');
});
