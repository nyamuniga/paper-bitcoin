import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const fixture = JSON.parse(readFileSync(
  new URL('../../crates/ecash-wallet/tests/fixtures/stable-stages.json', import.meta.url),
  'utf8',
));
const sourcePath = fileURLToPath(new URL('./stable-stage-contract-check.ts', import.meta.url));

function checkContract(stages) {
  const source = `
    import type { StableStage, StableOperation } from '../src/services/stableBalanceModel';
    const fixture = ${JSON.stringify(stages)} as const;
    const transitions: readonly {
      stage: StableStage;
      active: boolean;
      next: readonly StableStage[];
    }[] = fixture;
    const operations: readonly Pick<StableOperation, 'stage'>[] = fixture;
    type FixtureStage = typeof fixture[number]['stage'];
    const allStageNamesCovered:
      Exclude<StableStage, FixtureStage> extends never ? true : never = true;
    const allOperationStagesCovered:
      Exclude<StableOperation['stage'], FixtureStage> extends never ? true : never = true;
  `;
  const options = {
    strict: true,
    noEmit: true,
    skipLibCheck: true,
    target: ts.ScriptTarget.ES2020,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    types: [],
  };
  const host = ts.createCompilerHost(options);
  const getSourceFile = host.getSourceFile.bind(host);
  host.getSourceFile = (file, ...args) => file === sourcePath
    ? ts.createSourceFile(file, source, options.target, true)
    : getSourceFile(file, ...args);

  const program = ts.createProgram([sourcePath], options, host);
  return ts.getPreEmitDiagnostics(program)
    .map(diagnostic => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'));
}

test('shared Rust stage and transition fixture exactly covers the frontend stage types', () => {
  assert.equal(new Set(fixture.map(row => row.stage)).size, fixture.length);
  assert.deepEqual(checkContract(fixture), []);
});

test('stage contract rejects a changed wire spelling', () => {
  const changed = structuredClone(fixture);
  changed.find(row => row.stage === 'returnQuoted').stage = 'return_quoted';
  assert.match(checkContract(changed).join('\n'), /Type '"return_quoted"' is not assignable/);
});

test('stage contract rejects an omitted supported stage', () => {
  const changed = fixture.filter(row => row.stage !== 'funding');
  assert.match(checkContract(changed).join('\n'), /not assignable to type 'never'/);
});

test('transition contract rejects a destination outside the frontend stage types', () => {
  const changed = structuredClone(fixture);
  changed[0].next[0] = 'completed';
  assert.match(checkContract(changed).join('\n'), /Type '"completed"' is not assignable/);
});
