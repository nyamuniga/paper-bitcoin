import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

export const MIGRATED_NATIVE_ADAPTERS = [
  'src/store/wallet.ts',
  'src/types/wallet.ts',
  'src/types/sendEcash.ts',
  'src/types/momo.ts',
  'src/services/momoFulfillmentOperations.ts',
  'src/services/momoProcessingAdapter.ts',
  'src/services/momoTransactionAccess.ts',
  'src/services/savedMomoRecoveryAdapter.ts',
  'src/services/walletReconciliationAdapter.ts',
  'src/services/savedEcashInvoices.ts',
  'src/services/sendEcashError.ts',
  'src/services/proxyBalanceService.ts',
  'src/services/stableBalanceService.ts',
  'src/services/updateService.ts',
  'src/hooks/useTransactionProcessor.ts',
  'src/hooks/useEcashInvoice.ts',
];

export function findExplicitAnyUsages(filePath, sourceText) {
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    filePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const violations = [];

  function visit(node) {
    if (node.kind === ts.SyntaxKind.AnyKeyword) {
      const { line, character } = sourceFile.getLineAndCharacterOfPosition(
        node.getStart(sourceFile),
      );
      violations.push({
        file: filePath,
        line: line + 1,
        column: character + 1,
      });
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return violations;
}

export function checkNoExplicitAny(appRoot, files = MIGRATED_NATIVE_ADAPTERS) {
  const violations = [];
  let checkedFiles = 0;

  for (const relPath of files) {
    const absPath = path.join(appRoot, relPath);
    if (!fs.existsSync(absPath)) {
      violations.push({
        file: relPath,
        line: 0,
        column: 0,
        reason: 'listed native adapter file does not exist',
      });
      continue;
    }
    checkedFiles += 1;
    const sourceText = fs.readFileSync(absPath, 'utf8');
    violations.push(...findExplicitAnyUsages(relPath, sourceText));
  }

  return { checkedFiles, violations };
}

const isMain =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const { checkedFiles, violations } = checkNoExplicitAny(appRoot);
  if (violations.length > 0) {
    console.error(`Explicit-any check failed with ${violations.length} violation(s):`);
    for (const v of violations) {
      const loc = v.line > 0 ? `${v.file}:${v.line}:${v.column}` : v.file;
      console.error(`  - ${loc}: ${v.reason ?? 'explicit `any` type is forbidden in migrated native adapters'}`);
    }
    process.exit(1);
  }
  console.log(`Explicit-any check passed (${checkedFiles} migrated native adapters verified).`);
}
