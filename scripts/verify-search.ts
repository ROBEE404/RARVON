import { tools, actionMeta } from '../src/lib/toolRegistry';
import type { ToolMeta } from '../src/lib/toolRegistry';

const actionLabels = new Map(actionMeta.map((a) => [a.value, a.label]));

function scoreTokenAgainstTool(tool: ToolMeta, token: string): number {
  const name = tool.name.toLowerCase();
  if (name === token) return 100;
  if (tool.actions.some((a) => a === token || actionLabels.get(a)?.toLowerCase() === token)) return 95;
  if (name.startsWith(token)) return 80;
  if (tool.actions.some((a) => a.startsWith(token))) return 75;
  if (name.includes(token)) return 60;
  if (tool.keywords.some((k) => k.toLowerCase().includes(token))) return 40;
  if (tool.shortDescription.toLowerCase().includes(token)) return 20;
  return 0;
}

function scoreTool(tool: ToolMeta, query: string): number {
  const tokens = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) return 1;
  const tokenScores = tokens.map((t) => scoreTokenAgainstTool(tool, t));
  if (tokenScores.some((s) => s === 0)) return 0;
  return tokenScores.reduce((sum, s) => sum + s, 0) / tokenScores.length;
}

function search(query: string) {
  return tools
    .map((t) => ({ tool: t, score: scoreTool(t, query) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.tool.name.localeCompare(b.tool.name))
    .slice(0, 12)
    .map((r) => `${r.tool.name} [${r.tool.category}, score ${r.score}]`);
}

for (const q of ['compress', 'convert', 'resize image', 'merge pdf', 'remove metadata', 'extract audio', 'json formatter', 'edit pdf']) {
  console.log(`\nQuery: "${q}"`);
  console.log(search(q).join('\n'));
}
