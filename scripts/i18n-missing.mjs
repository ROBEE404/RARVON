// Lists English strings passed to tr() that have no Arabic translation yet.
//   node scripts/i18n-missing.mjs          print count and the missing keys
//   node scripts/i18n-missing.mjs --json   print them as a JSON array
import ts from 'typescript';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');

function files(p) {
  const st = statSync(p);
  if (st.isFile()) return /\.tsx?$/.test(p) ? [p] : [];
  return readdirSync(p).flatMap((f) => files(join(p, f)));
}

/** Keys of a `Record<string, string>` object literal exported from a dictionary file. */
function dictKeys(file) {
  const sf = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  const keys = new Set();
  const visit = (n) => {
    if (ts.isPropertyAssignment(n) && (ts.isStringLiteral(n.name) || ts.isNoSubstitutionTemplateLiteral(n.name))) keys.add(n.name.text);
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return keys;
}

const known = new Set([...dictKeys(join(ROOT, 'src/lib/i18n/ar-registry.ts')), ...dictKeys(join(ROOT, 'src/lib/i18n/ar-ui.ts'))]);
const used = new Map(); // key -> first file
for (const file of files(join(ROOT, 'src'))) {
  if (/[\\/]i18n[\\/]/.test(file)) continue;
  const src = readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const visit = (n) => {
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === 'tr' && n.arguments[0]) {
      const a = n.arguments[0];
      if (ts.isStringLiteral(a) || ts.isNoSubstitutionTemplateLiteral(a)) {
        if (!used.has(a.text)) used.set(a.text, file.slice(ROOT.length + 1));
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
}
const missing = [...used.keys()].filter((k) => !known.has(k) && /[A-Za-z]{2,}/.test(k));
if (process.argv.includes('--json')) console.log(JSON.stringify(missing, null, 1));
else {
  console.log(`${used.size} keys used, ${missing.length} missing an Arabic translation.`);
  for (const k of missing) console.log(`  ${used.get(k)}: ${k}`);
}
