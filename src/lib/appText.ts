import { hasNativeEngine } from '../engine/info';
import type { CategoryMeta, ToolMeta } from './toolRegistry';

/**
 * Inside the Rarvon app, the tools FFmpeg runs describe themselves the app's
 * way (any video, any size); everywhere else, the website's text.
 */
export function toolText(tool: ToolMeta): { description: string; faq: ToolMeta['faq'] } {
  if (!hasNativeEngine || !tool.app) return { description: tool.description, faq: tool.faq };
  return { description: tool.app.description ?? tool.description, faq: tool.app.faq ?? tool.faq };
}

export function categoryDescription(category: CategoryMeta): string {
  return (hasNativeEngine && category.appDescription) || category.description;
}
