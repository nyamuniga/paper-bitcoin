import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BOUNDARY_GROUPS,
  checkImportBoundaries,
  findBoundaryViolations,
} from '../scripts/check-import-boundaries.mjs';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workflowRules = BOUNDARY_GROUPS.find(
  (g) => g.name === 'extracted-frontend-workflows',
).forbidden;
const hookRules = BOUNDARY_GROUPS.find(
  (g) => g.name === 'extracted-lifecycle-hooks',
).forbidden;

test('all extracted frontend workflows and lifecycle hooks pass import-boundary checks', () => {
  const result = checkImportBoundaries(appRoot);
  assert.equal(result.checkedFiles, 20);
  assert.deepEqual(result.violations, []);
});

test('workflow boundary rejects React, Zustand, store, and Tauri imports across syntax forms', () => {
  const source = `
    import { useState } from 'react';
    import type { StoreApi } from 'zustand/vanilla';
    import { useWalletStore } from '../store/wallet';
    export { invoke } from '@tauri-apps/api/core';
    async function load() {
      const http = await import('@tauri-apps/plugin-http');
      const toast = require('react-hot-toast');
      return [http, toast];
    }
  `;
  const violations = findBoundaryViolations('src/services/synthetic.ts', source, workflowRules);
  assert.deepEqual(
    violations.map((v) => ({ rule: v.rule, specifier: v.specifier })),
    [
      { rule: 'React', specifier: 'react' },
      { rule: 'Zustand/store', specifier: 'zustand/vanilla' },
      { rule: 'Zustand/store', specifier: '../store/wallet' },
      { rule: 'Tauri', specifier: '@tauri-apps/api/core' },
      { rule: 'Tauri', specifier: '@tauri-apps/plugin-http' },
      { rule: 'React', specifier: 'react-hot-toast' },
    ],
  );
});

test('comments and plain string literals do not trigger false positives', () => {
  const source = `
    // import { invoke } from '@tauri-apps/api/core';
    /* import React from 'react'; */
    export const note = "zustand and ../store/wallet and @tauri-apps/plugin-http";
  `;
  const violations = findBoundaryViolations('src/services/synthetic.ts', source, workflowRules);
  assert.deepEqual(violations, []);
});

test('extracted lifecycle hooks allow React while rejecting Zustand/store and Tauri', () => {
  const source = `
    import { useState } from 'react';
    import { useTransactionStore } from '../../store/transactionStore';
    import { invoke } from '@tauri-apps/api/core';
  `;
  const violations = findBoundaryViolations(
    'src/features/bitcoin/syntheticHook.ts',
    source,
    hookRules,
  );
  assert.deepEqual(
    violations.map((v) => ({ rule: v.rule, specifier: v.specifier })),
    [
      { rule: 'Zustand/store', specifier: '../../store/transactionStore' },
      { rule: 'Tauri', specifier: '@tauri-apps/api/core' },
    ],
  );
});

test('missing listed files fail the boundary check instead of silently passing', () => {
  const result = checkImportBoundaries(appRoot, [
    {
      name: 'synthetic-missing',
      forbidden: workflowRules,
      files: ['src/services/doesNotExist.ts'],
    },
  ]);
  assert.equal(result.checkedFiles, 0);
  assert.equal(result.violations.length, 1);
  assert.equal(result.violations[0].file, 'src/services/doesNotExist.ts');
});
