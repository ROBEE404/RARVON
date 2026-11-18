// Wraps user-facing English text in .tsx files with tr() for the Arabic
// interface. Run once per file set; already-wrapped text is left alone.
//
//   node scripts/i18n-wrap.mjs src/tools            wrap and write
//   node scripts/i18n-wrap.mjs src/tools --dry      list what would change
//
// What gets wrapped:
// - JSX text between tags (whitespace handled the way JSX does)
// - string values of label-like attributes (label, placeholder, aria-label…)
// - string literals and template literals that a JSX expression can render
//   directly, through ?:, &&, || and ?? (e.g. {busy ? 'Saving…' : 'Save'})
// Text inside <code>, <kbd>, <pre>, <style>, <script> is skipped, and so is
// anything without a Latin word of 2+ letters.
import ts from 'typescript';
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, dirname, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const dry = args.includes('--dry');
const targets = args.filter((a) => !a.startsWith('--'));
const ATTRS = new Set(['label', 'placeholder', 'aria-label', 'title', 'hint', 'legend', 'alt', 'description', 'note', 'downloadLabel', 'heading', 'subtitle', 'caption', 'prefix', 'emptyLabel']);
const SKIP_TAGS = new Set(['code', 'kbd', 'pre', 'style', 'script']);
const SKIP_FILES = [/src[\\/]lib[\\/]i18n/, /LanguageToggle\.tsx$/, /Logo\.tsx$/];
const ENTITIES = { '&rsquo;': '’', '&lsquo;': '‘', '&apos;': "'", '&quot;': '"', '&amp;': '&', '&nbsp;': '\u00a0', '&rarr;': '→', '&larr;': '←', '&hellip;': '…', '&mdash;': '—', '&ndash;': '–', '&times;': '×' };

const hasWords = (s) => /[A-Za-z]{2,}/.test(s);
const decode = (s) => s.replace(/&[a-z]+;/g, (m) => ENTITIES[m] ?? m);

function files(p) {
  const st = statSync(p);
  if (st.isFile()) return p.endsWith('.tsx') ? [p] : [];
  return readdirSync(p).flatMap((f) => files(join(p, f)));
}

function insideSkippedTag(node) {
  for (let n = node.parent; n; n = n.parent) {
    if (ts.isJsxElement(n)) {
      const name = n.openingElement.tagName.getText();
      if (SKIP_TAGS.has(name)) return true;
    }
  }
  return false;
}

function isTrCall(node) {
  return ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'tr';
}

/** String-ish leaves reachable from a JSX expression through ?:, &&, ||, ??, parentheses. */
function renderableLeaves(expr, out) {
  if (!expr) return;
  if (ts.isParenthesizedExpression(expr)) return renderableLeaves(expr.expression, out);
  if (ts.isConditionalExpression(expr)) {
    renderableLeaves(expr.whenTrue, out);
    renderableLeaves(expr.whenFalse, out);
    return;
  }
  if (ts.isBinaryExpression(expr)) {
    const k = expr.operatorToken.kind;
    if (k === ts.SyntaxKind.AmpersandAmpersandToken || k === ts.SyntaxKind.BarBarToken || k === ts.SyntaxKind.QuestionQuestionToken) {
      if (k !== ts.SyntaxKind.AmpersandAmpersandToken) renderableLeaves(expr.left, out);
      renderableLeaves(expr.right, out);
    }
    return;
  }
  if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) {
    if (hasWords(expr.text)) out.push(expr);
  } else if (ts.isTemplateExpression(expr)) {
    let words = expr.head.text;
    for (const s of expr.templateSpans) words += ' ' + s.literal.text;
    if (hasWords(words)) out.push(expr);
  }
}

function trFor(node, sf) {
  if (ts.isTemplateExpression(node)) {
    let key = node.head.text;
    const vars = [];
    node.templateSpans.forEach((s, i) => {
      key += `{${i}}` + s.literal.text;
      vars.push(`${i}: ${s.expression.getText(sf)}`);
    });
    return `tr(${JSON.stringify(key)}, { ${vars.join(', ')} })`;
  }
  return `tr(${JSON.stringify(node.text)})`;
}

let total = 0;
const keys = new Set();
for (const target of targets) {
  for (const file of files(resolve(ROOT, target))) {
    if (SKIP_FILES.some((r) => r.test(file))) continue;
    const src = readFileSync(file, 'utf8');
    const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const edits = [];
    const visit = (node) => {
      if (ts.isJsxText(node)) {
        const raw = src.slice(node.pos, node.end);
        const text = decode(raw).replace(/\s+/g, ' ').trim();
        if (text && hasWords(text) && !insideSkippedTag(node)) {
          const lead = raw.match(/^\s*/)[0];
          const trail = raw.match(/\s*$/)[0];
          // Whitespace without a line break is significant in JSX: keep it as an explicit space.
          const l = lead && !lead.includes('\n') ? "{' '}" : lead;
          const r = trail && !trail.includes('\n') ? "{' '}" : trail;
          edits.push([node.pos, node.end, `${l}{tr(${JSON.stringify(text)})}${r}`]);
          keys.add(text);
        }
      } else if (ts.isJsxAttribute(node) && node.initializer) {
        const name = node.name.getText(sf);
        if (ATTRS.has(name)) {
          const init = node.initializer;
          if (ts.isStringLiteral(init) && hasWords(init.text)) {
            edits.push([init.getStart(sf), init.end, `{tr(${JSON.stringify(init.text)})}`]);
            keys.add(init.text);
          } else if (ts.isJsxExpression(init) && init.expression && !isTrCall(init.expression)) {
            const leaves = [];
            renderableLeaves(init.expression, leaves);
            for (const leaf of leaves) {
              edits.push([leaf.getStart(sf), leaf.end, trFor(leaf, sf)]);
              keys.add(ts.isTemplateExpression(leaf) ? '(template)' : leaf.text);
            }
          }
        }
      } else if (ts.isJsxExpression(node) && node.expression && !ts.isJsxAttribute(node.parent) && (ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent))) {
        if (!insideSkippedTag(node) && !isTrCall(node.expression)) {
          const leaves = [];
          renderableLeaves(node.expression, leaves);
          for (const leaf of leaves) {
            edits.push([leaf.getStart(sf), leaf.end, trFor(leaf, sf)]);
            keys.add(ts.isTemplateExpression(leaf) ? '(template)' : leaf.text);
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
    if (!edits.length) continue;
    total += edits.length;
    if (dry) {
      console.log(`${relative(ROOT, file)}: ${edits.length}`);
      continue;
    }
    edits.sort((a, b) => b[0] - a[0]);
    let out = src;
    for (const [s, e, r] of edits) out = out.slice(0, s) + r + out.slice(e);
    if (!/import \{[^}]*\btr\b[^}]*\} from '[^']*i18n'/.test(out)) {
      const rel = relative(dirname(file), join(ROOT, 'src/lib/i18n')).split('\\').join('/');
      const spec = rel.startsWith('.') ? rel : `./${rel}`;
      const imports = [...out.matchAll(/^import [\s\S]*?from '[^']+';$/gm)];
      const at = imports.length ? imports[imports.length - 1].index + imports[imports.length - 1][0].length : 0;
      out = out.slice(0, at) + `${at ? '\n' : ''}import { tr } from '${spec}';${at ? '' : '\n'}` + out.slice(at);
    }
    writeFileSync(file, out);
  }
}
console.log(`${dry ? 'Would wrap' : 'Wrapped'} ${total} strings.`);
