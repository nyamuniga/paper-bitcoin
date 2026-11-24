import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BOUNDARY_GROUPS } from './check-import-boundaries.mjs';
import { MIGRATED_NATIVE_ADAPTERS } from './check-no-explicit-any.mjs';

export const MIGRATED_UI_MODULES = [
  'src/components/shared/PaymentPageLayout.tsx',
  'src/components/shared/BottomSheet.tsx',
  'src/components/shared/useBottomSheetDialog.ts',
  'src/components/shared/PrimaryActionButton.tsx',
  'src/components/shared/IconButton.tsx',
  'src/components/shared/FormField.tsx',
  'src/components/shared/SafeQRCode.tsx',
  'src/features/momo/MomoEntryForm.tsx',
  'src/features/momo/MomoReview.tsx',
  'src/features/momo/MomoSavedTransfers.tsx',
  'src/features/bitcoin/BitcoinReceive.tsx',
  'src/features/bitcoin/BitcoinDestinationEntry.tsx',
  'src/features/bitcoin/BitcoinSendReview.tsx',
];

export const MIGRATED_CHECK_MODULES = [
  'scripts/check-import-boundaries.mjs',
  'scripts/check-no-explicit-any.mjs',
  'scripts/check-migrated-format.mjs',
  'tests/importBoundaries.test.mjs',
  'tests/noExplicitAny.test.mjs',
  'tests/migratedFormat.test.mjs',
];

export const MIGRATED_FRONTEND_FILES = [
  ...new Set([
    ...BOUNDARY_GROUPS.flatMap((group) => group.files),
    ...MIGRATED_NATIVE_ADAPTERS,
    ...MIGRATED_UI_MODULES,
    ...MIGRATED_CHECK_MODULES,
  ]),
].sort();

export function findFormatViolations(filePath, rawBuffer) {
  const violations = [];
  if (
    rawBuffer.length >= 3 &&
    rawBuffer[0] === 0xef &&
    rawBuffer[1] === 0xbb &&
    rawBuffer[2] === 0xbf
  ) {
    violations.push({ file: filePath, line: 1, rule: 'UTF-8 BOM is forbidden' });
  }

  const text = rawBuffer.toString('utf8');
  if (text.includes('\r')) {
    violations.push({ file: filePath, line: 1, rule: 'CRLF line endings are forbidden (use LF)' });
  }
  if (text.length > 0 && !text.endsWith('\n')) {
    violations.push({
      file: filePath,
      line: text.split('\n').length,
      rule: 'file must end with a single LF newline',
    });
  }
  if (text.endsWith('\n\n')) {
    violations.push({
      file: filePath,
      line: text.split('\n').length - 1,
      rule: 'extra trailing blank line at end of file',
    });
  }

  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].replace(/\r$/, '');
    if (/[ \t]+$/.test(line)) {
      violations.push({ file: filePath, line: i + 1, rule: 'trailing whitespace' });
    }
    if (/^\t/.test(line)) {
      violations.push({ file: filePath, line: i + 1, rule: 'tab indentation (use spaces)' });
    }
  }

  return violations;
}

export function checkMigratedFormat(appRoot, files = MIGRATED_FRONTEND_FILES) {
  const violations = [];
  let checkedFiles = 0;

  for (const relPath of files) {
    const absPath = path.join(appRoot, relPath);
    if (!fs.existsSync(absPath)) {
      violations.push({
        file: relPath,
        line: 0,
        rule: 'listed migrated file does not exist',
      });
      continue;
    }
    checkedFiles += 1;
    const rawBuffer = fs.readFileSync(absPath);
    violations.push(...findFormatViolations(relPath, rawBuffer));
  }

  return { checkedFiles, violations };
}

const isMain =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const { checkedFiles, violations } = checkMigratedFormat(appRoot);
  if (violations.length > 0) {
    console.error(`Migrated-module format check failed with ${violations.length} violation(s):`);
    for (const v of violations) {
      const loc = v.line > 0 ? `${v.file}:${v.line}` : v.file;
      console.error(`  - ${loc}: ${v.rule}`);
    }
    process.exit(1);
  }
  console.log(`Migrated-module format check passed (${checkedFiles} frontend files verified).`);
}
