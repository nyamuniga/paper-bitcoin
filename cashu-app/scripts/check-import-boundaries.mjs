import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const REACT_PACKAGES = new Set([
  'react',
  'react-dom',
  'react-router-dom',
  'react-hot-toast',
]);

function isReactSpecifier(specifier) {
  if (REACT_PACKAGES.has(specifier)) return true;
  for (const pkg of REACT_PACKAGES) {
    if (specifier.startsWith(`${pkg}/`)) return true;
  }
  return false;
}

function isZustandOrStoreSpecifier(specifier) {
  if (specifier === 'zustand' || specifier.startsWith('zustand/')) return true;
  // Relative imports into src/store/* (e.g. ../store/wallet, ../../store/transactionStore)
  return /(^|\/)store(\/|$)/.test(specifier);
}

function isTauriSpecifier(specifier) {
  return specifier === '@tauri-apps/api' || specifier.startsWith('@tauri-apps/');
}

export const BOUNDARY_GROUPS = [
  {
    name: 'extracted-frontend-workflows',
    forbidden: [
      { label: 'React', match: isReactSpecifier },
      { label: 'Zustand/store', match: isZustandOrStoreSpecifier },
      { label: 'Tauri', match: isTauriSpecifier },
    ],
    files: [
      'src/services/scheduler.ts',
      'src/services/momoReview.ts',
      'src/services/momoRecovery.ts',
      'src/services/payoutInitiation.ts',
      'src/services/momoFulfillment.ts',
      'src/services/momoProcessing.ts',
      'src/services/walletReconciliation.ts',
      'src/services/sparkReconciliation.ts',
      'src/services/conversionSpendGuard.ts',
      'src/services/stableBalanceModel.ts',
      'src/services/transferAmount.ts',
      'src/services/transferError.ts',
      'src/services/sendEcashError.ts',
      'src/services/sparkConversionError.ts',
      'src/services/receivedTokenPreview.ts',
      'src/services/cashuRequests.ts',
      'src/services/qrPayment.ts',
      'src/services/ecashRequestHistory.ts',
    ],
  },
  {
    name: 'extracted-lifecycle-hooks',
    forbidden: [
      { label: 'Zustand/store', match: isZustandOrStoreSpecifier },
      { label: 'Tauri', match: isTauriSpecifier },
    ],
    files: [
      'src/features/bitcoin/useBitcoinReceive.ts',
      'src/features/bitcoin/useBitcoinSend.ts',
    ],
  },
];

export function collectImportSpecifiers(sourceText, fileName = 'module.ts') {
  const sourceFile = ts.createSourceFile(
    fileName,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const specifiers = [];

  function record(node, text) {
    const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    specifiers.push({ specifier: text, line: line + 1 });
  }

  function visit(node) {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      record(node.moduleSpecifier, node.moduleSpecifier.text);
    } else if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      record(node.moduleSpecifier, node.moduleSpecifier.text);
    } else if (ts.isCallExpression(node)) {
      const isDynamicImport = node.expression.kind === ts.SyntaxKind.ImportKeyword;
      const isRequire = ts.isIdentifier(node.expression) && node.expression.text === 'require';
      if (
        (isDynamicImport || isRequire) &&
        node.arguments.length === 1 &&
        ts.isStringLiteralLike(node.arguments[0])
      ) {
        record(node.arguments[0], node.arguments[0].text);
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return specifiers;
}

export function findBoundaryViolations(filePath, sourceText, forbiddenRules) {
  const violations = [];
  for (const { specifier, line } of collectImportSpecifiers(sourceText, filePath)) {
    for (const rule of forbiddenRules) {
      if (rule.match(specifier)) {
        violations.push({
          file: filePath,
          line,
          specifier,
          rule: rule.label,
        });
      }
    }
  }
  return violations;
}

export function checkImportBoundaries(appRoot, groups = BOUNDARY_GROUPS) {
  const violations = [];
  let checkedFiles = 0;

  for (const group of groups) {
    for (const relPath of group.files) {
      const absPath = path.join(appRoot, relPath);
      if (!fs.existsSync(absPath)) {
        violations.push({
          file: relPath,
          line: 0,
          specifier: '<missing file>',
          rule: `${group.name}: listed boundary file does not exist`,
        });
        continue;
      }
      checkedFiles += 1;
      const sourceText = fs.readFileSync(absPath, 'utf8');
      violations.push(...findBoundaryViolations(relPath, sourceText, group.forbidden));
    }
  }

  return { checkedFiles, violations };
}

const isMain =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const { checkedFiles, violations } = checkImportBoundaries(appRoot);
  if (violations.length > 0) {
    console.error(`Import-boundary check failed with ${violations.length} violation(s):`);
    for (const v of violations) {
      const loc = v.line > 0 ? `${v.file}:${v.line}` : v.file;
      console.error(`  - ${loc}: forbidden ${v.rule} import "${v.specifier}"`);
    }
    process.exit(1);
  }
  console.log(`Import-boundary check passed (${checkedFiles} files verified).`);
}
