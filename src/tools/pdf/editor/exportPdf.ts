import { engine } from '../../../engine';
import { PDFDocument, PDFHexString, PDFName, PDFString, degrees, rgb } from 'pdf-lib';
import type { PDFImage, PDFPage } from 'pdf-lib';
import { createTextDrawer } from './pdfText';
import type { TextDrawer } from './pdfText';
import { NOTE_ICON_PT, TEXT_BASELINE, UNDERLINE_THICKNESS } from './types';
import type { Annotation, PageInstance, ShapeAnnotation, TextAnnotation } from './types';
import { tr } from '../../../lib/i18n';

/** Font stack used for text in the editor overlay and in rasterized output. */
export const EDITOR_FONT_STACK = '"Noto Sans", "Noto Sans Arabic", "Segoe UI", Tahoma, sans-serif';

// ---------------------------------------------------------------------------
// Geometry: annotations are stored as fractions of the page *as displayed*
// (pdf.js applies the page's crop box and its own /Rotate). PDF drawing
// happens in unrotated user space, so every point goes through toPdf().
// ---------------------------------------------------------------------------

interface Geom {
  /** The page's own rotation, clockwise degrees. */
  r: 0 | 90 | 180 | 270;
  /** Crop box in user space. */
  cx: number;
  cy: number;
  cw: number;
  ch: number;
  /** Displayed size in points. */
  W: number;
  H: number;
}

function normRot(deg: number): 0 | 90 | 180 | 270 {
  return ((((Math.round(deg / 90) * 90) % 360) + 360) % 360) as 0 | 90 | 180 | 270;
}

function geomOf(page: PDFPage): Geom {
  const r = normRot(page.getRotation().angle);
  const box = page.getCropBox();
  const swap = r === 90 || r === 270;
  return { r, cx: box.x, cy: box.y, cw: box.width, ch: box.height, W: swap ? box.height : box.width, H: swap ? box.width : box.height };
}

/** Displayed fraction (u right, v down) → PDF user space. */
function toPdf(g: Geom, u: number, v: number) {
  let px: number;
  let py: number;
  if (g.r === 0) [px, py] = [u * g.cw, (1 - v) * g.ch];
  else if (g.r === 90) [px, py] = [v * g.cw, u * g.ch];
  else if (g.r === 180) [px, py] = [(1 - u) * g.cw, v * g.ch];
  else [px, py] = [(1 - v) * g.cw, (1 - u) * g.ch];
  return { x: g.cx + px, y: g.cy + py };
}

/** Displayed fraction → fraction after the editor's extra clockwise rotation. */
function rotateFrac(u: number, v: number, extra: number) {
  const e = normRot(extra);
  if (e === 90) return { u: 1 - v, v: u };
  if (e === 180) return { u: 1 - u, v: 1 - v };
  if (e === 270) return { u: v, v: 1 - u };
  return { u, v };
}

function hexToRgb(hex: string) {
  const clean = hex.replace('#', '');
  const num = parseInt(clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean, 16);
  return rgb(((num >> 16) & 255) / 255, ((num >> 8) & 255) / 255, (num & 255) / 255);
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  return Uint8Array.from(atob(dataUrl.split(',')[1]), (c) => c.charCodeAt(0));
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = () => reject(new Error(tr("An image in this document failed to load.")));
    im.src = src;
  });
}

function isRtlStart(text: string) {
  const m = text.match(/[A-Za-zÀ-ɏͰ-ϿЀ-ӿ֐-ࣿיִ-﷿ﹰ-﻿]/);
  return !!m && /[֐-ࣿיִ-﷿ﹰ-﻿]/.test(m[0]);
}

/** Contain-fit an image of natural size (iw, ih) into a box, centered. */
function containFit(boxW: number, boxH: number, iw: number, ih: number) {
  const s = Math.min(boxW / iw, boxH / ih);
  const w = iw * s;
  const h = ih * s;
  return { dx: (boxW - w) / 2, dy: (boxH - h) / 2, w, h };
}

function arrowHead(sx: number, sy: number, ex: number, ey: number, width: number) {
  const len = Math.hypot(ex - sx, ey - sy) || 1;
  const ux = (ex - sx) / len;
  const uy = (ey - sy) / len;
  const L = Math.max(width * 4, 8);
  const a = (28 * Math.PI) / 180;
  const wing = (sign: number) => ({
    x: ex - L * (ux * Math.cos(a) - sign * uy * Math.sin(a)),
    y: ey - L * (uy * Math.cos(a) + sign * ux * Math.sin(a)),
  });
  return [wing(1), wing(-1)];
}

// ---------------------------------------------------------------------------
// Canvas rendering (redacted pages, unsupported-script text fallback, and
// anything else that is flattened to pixels).
// ---------------------------------------------------------------------------

async function ensureFonts(list: Annotation[], px: number) {
  if (!('fonts' in document)) return;
  await Promise.all(
    list
      .filter((a): a is TextAnnotation => a.type === 'text')
      .map((a) => document.fonts.load(`${Math.max(1, px * a.size)}px ${EDITOR_FONT_STACK}`, a.text).catch(() => undefined)),
  );
}

function fillCanvasText(ctx: CanvasRenderingContext2D, text: string, x: number, baselineY: number, sizePx: number, color: string) {
  ctx.save();
  ctx.font = `${sizePx}px ${EDITOR_FONT_STACK}`;
  ctx.fillStyle = color;
  ctx.textBaseline = 'alphabetic';
  ctx.direction = isRtlStart(text) ? 'rtl' : 'ltr';
  ctx.textAlign = 'left';
  ctx.fillText(text, x, baselineY);
  ctx.restore();
}

/** Draws every annotation onto a canvas covering the displayed page (w×h px). Redactions are drawn last, on top. */
export async function drawAnnotationsToCanvas(ctx: CanvasRenderingContext2D, list: Annotation[], w: number, h: number) {
  await ensureFonts(list, h);
  const ordered = [...list.filter((a) => a.type !== 'redact'), ...list.filter((a) => a.type === 'redact')];
  for (const a of ordered) {
    ctx.save();
    switch (a.type) {
      case 'text':
        fillCanvasText(ctx, a.text, a.x * w, (a.y + a.size * TEXT_BASELINE) * h, a.size * h, a.color);
        break;
      case 'highlight':
        ctx.globalAlpha = 0.35;
        ctx.fillStyle = a.color;
        ctx.fillRect(a.x * w, a.y * h, a.w * w, a.h * h);
        break;
      case 'underline':
        ctx.fillStyle = a.color;
        ctx.fillRect(a.x * w, (a.y + a.h - UNDERLINE_THICKNESS) * h, a.w * w, UNDERLINE_THICKNESS * h);
        break;
      case 'draw':
        if (a.points.length > 1) {
          ctx.strokeStyle = a.color;
          ctx.lineWidth = a.strokeWidth * w;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.beginPath();
          ctx.moveTo((a.x + a.points[0].x) * w, (a.y + a.points[0].y) * h);
          for (const p of a.points.slice(1)) ctx.lineTo((a.x + p.x) * w, (a.y + p.y) * h);
          ctx.stroke();
        }
        break;
      case 'shape': {
        ctx.strokeStyle = a.color;
        ctx.fillStyle = a.color;
        ctx.lineWidth = a.strokeWidth * w;
        ctx.lineCap = 'round';
        const [x, y, sw, sh] = [a.x * w, a.y * h, a.w * w, a.h * h];
        ctx.beginPath();
        if (a.kind === 'rect') ctx.rect(x, y, sw, sh);
        else if (a.kind === 'ellipse') ctx.ellipse(x + sw / 2, y + sh / 2, Math.abs(sw / 2), Math.abs(sh / 2), 0, 0, Math.PI * 2);
        else {
          ctx.moveTo(x, y);
          ctx.lineTo(x + sw, y + sh);
          if (a.kind === 'arrow') {
            for (const p of arrowHead(x, y, x + sw, y + sh, ctx.lineWidth)) {
              ctx.moveTo(x + sw, y + sh);
              ctx.lineTo(p.x, p.y);
            }
          }
        }
        ctx.stroke();
        break;
      }
      case 'signature':
      case 'image': {
        const img = await loadImage(a.dataUrl);
        const fit = containFit(a.w * w, a.h * h, img.naturalWidth, img.naturalHeight);
        ctx.drawImage(img, a.x * w + fit.dx, a.y * h + fit.dy, fit.w, fit.h);
        break;
      }
      case 'note': {
        // Flattened pages keep the note as a real comment too (added by the
        // caller); this just leaves a small visible marker on the image.
        const s = (NOTE_ICON_PT / 72) * (w / 8.5) * 0.9;
        ctx.fillStyle = a.color;
        ctx.globalAlpha = 0.9;
        ctx.fillRect(a.x * w, a.y * h, s, s);
        break;
      }
      case 'redact':
        ctx.fillStyle = '#000000';
        ctx.fillRect(a.x * w, a.y * h, a.w * w, a.h * h);
        break;
    }
    ctx.restore();
  }
}

/** Rotates a canvas clockwise by 0/90/180/270 degrees. */
function rotateCanvas(source: HTMLCanvasElement, degreesCw: number): HTMLCanvasElement {
  const normalized = normRot(degreesCw);
  if (normalized === 0) return source;
  const swapped = normalized === 90 || normalized === 270;
  const out = document.createElement('canvas');
  out.width = swapped ? source.height : source.width;
  out.height = swapped ? source.width : source.height;
  const ctx = out.getContext('2d')!;
  ctx.translate(out.width / 2, out.height / 2);
  ctx.rotate((normalized * Math.PI) / 180);
  ctx.drawImage(source, -source.width / 2, -source.height / 2);
  return out;
}

async function canvasToBytes(canvas: HTMLCanvasElement, type: 'image/png' | 'image/jpeg', quality?: number) {
  const blob: Blob = await new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error(tr("Could not encode page image.")))), type, quality),
  );
  return new Uint8Array(await blob.arrayBuffer());
}

// ---------------------------------------------------------------------------
// Vector export
// ---------------------------------------------------------------------------

interface ExportContext {
  doc: PDFDocument;
  text: TextDrawer | null;
  images: Map<string, PDFImage>;
}

async function embedDataUrl(ctx: ExportContext, dataUrl: string): Promise<PDFImage> {
  let img = ctx.images.get(dataUrl);
  if (!img) {
    const bytes = dataUrlToBytes(dataUrl);
    img = dataUrl.startsWith('data:image/jpeg') ? await ctx.doc.embedJpg(bytes) : await ctx.doc.embedPng(bytes);
    ctx.images.set(dataUrl, img);
  }
  return img;
}

/** Draws a displayed-space rectangle (fractions) on a PDF page, upright as displayed. */
function rectArgs(g: Geom, x: number, y: number, w: number, h: number) {
  const p = toPdf(g, x, y + h); // displayed bottom-left corner
  return { x: p.x, y: p.y, width: w * g.W, height: h * g.H, rotate: degrees(g.r) };
}

async function drawTextVector(page: PDFPage, g: Geom, a: TextAnnotation, ctx: ExportContext) {
  const size = a.size * g.H;
  if (ctx.text?.canDraw(a.text)) {
    const p = toPdf(g, a.x, a.y + a.size * TEXT_BASELINE);
    await ctx.text.draw(page, a.text, { x: p.x, y: p.y, size, color: hexToRgb(a.color), rotate: g.r });
    return;
  }
  // Script without a bundled font (CJK, Devanagari, emoji…): render with the
  // browser's own fonts at 4× and place the image exactly where the text was.
  const k = 4;
  const measure = document.createElement('canvas').getContext('2d')!;
  measure.font = `${size * k}px ${EDITOR_FONT_STACK}`;
  await ensureFonts([a], g.H * k);
  measure.font = `${size * k}px ${EDITOR_FONT_STACK}`;
  const widthPx = Math.ceil(measure.measureText(a.text).width) + 2;
  const c = document.createElement('canvas');
  c.width = Math.max(1, widthPx);
  c.height = Math.max(1, Math.ceil(size * k * 1.25));
  fillCanvasText(c.getContext('2d')!, a.text, 0, size * k * TEXT_BASELINE, size * k, a.color);
  const png = await ctx.doc.embedPng(await canvasToBytes(c, 'image/png'));
  page.drawImage(png, rectArgs(g, a.x, a.y, c.width / k / g.W, c.height / k / g.H));
}

async function drawVector(page: PDFPage, g: Geom, list: Annotation[], ctx: ExportContext) {
  for (const a of list) {
    switch (a.type) {
      case 'text':
        await drawTextVector(page, g, a, ctx);
        break;
      case 'highlight':
        page.drawRectangle({ ...rectArgs(g, a.x, a.y, a.w, a.h), color: hexToRgb(a.color), opacity: 0.35 });
        break;
      case 'underline':
        page.drawRectangle({ ...rectArgs(g, a.x, a.y + a.h - UNDERLINE_THICKNESS, a.w, UNDERLINE_THICKNESS), color: hexToRgb(a.color) });
        break;
      case 'draw': {
        if (a.points.length < 2) break;
        const color = hexToRgb(a.color);
        const thickness = Math.max(0.5, a.strokeWidth * g.W);
        for (let i = 0; i < a.points.length - 1; i++) {
          const p1 = a.points[i];
          const p2 = a.points[i + 1];
          page.drawLine({ start: toPdf(g, a.x + p1.x, a.y + p1.y), end: toPdf(g, a.x + p2.x, a.y + p2.y), thickness, color, lineCap: 1 as never });
        }
        break;
      }
      case 'shape':
        drawShapeVector(page, g, a);
        break;
      case 'signature':
      case 'image': {
        const img = await embedDataUrl(ctx, a.dataUrl);
        const fit = containFit(a.w * g.W, a.h * g.H, img.width, img.height);
        page.drawImage(img, rectArgs(g, a.x + fit.dx / g.W, a.y + fit.dy / g.H, fit.w / g.W, fit.h / g.H));
        break;
      }
      case 'note':
      case 'redact':
        break; // notes are added as PDF comments; redaction never reaches this path
    }
  }
}

function drawShapeVector(page: PDFPage, g: Geom, a: ShapeAnnotation) {
  const color = hexToRgb(a.color);
  const thickness = Math.max(0.5, a.strokeWidth * g.W);
  if (a.kind === 'rect') {
    page.drawRectangle({ ...rectArgs(g, a.x, a.y, a.w, a.h), borderColor: color, borderWidth: thickness });
  } else if (a.kind === 'ellipse') {
    const c = toPdf(g, a.x + a.w / 2, a.y + a.h / 2);
    page.drawEllipse({ x: c.x, y: c.y, xScale: (a.w * g.W) / 2, yScale: (a.h * g.H) / 2, rotate: degrees(g.r), borderColor: color, borderWidth: thickness });
  } else {
    const start = toPdf(g, a.x, a.y);
    const end = toPdf(g, a.x + a.w, a.y + a.h);
    page.drawLine({ start, end, thickness, color, lineCap: 1 as never });
    if (a.kind === 'arrow') {
      // Arrowhead computed in displayed points, then mapped.
      const [sx, sy, ex, ey] = [a.x * g.W, a.y * g.H, (a.x + a.w) * g.W, (a.y + a.h) * g.H];
      for (const p of arrowHead(sx, sy, ex, ey, thickness)) {
        page.drawLine({ start: end, end: toPdf(g, p.x / g.W, p.y / g.H), thickness, color, lineCap: 1 as never });
      }
    }
  }
}

/** Adds sticky notes as standard PDF Text annotations (comments). `map` converts displayed fractions to user space. */
function addNotes(doc: PDFDocument, page: PDFPage, list: Annotation[], map: (u: number, v: number) => { x: number; y: number }, W: number, H: number) {
  for (const a of list) {
    if (a.type !== 'note' || !a.text.trim()) continue;
    const corners = [map(a.x, a.y), map(a.x + NOTE_ICON_PT / W, a.y + NOTE_ICON_PT / H)];
    const c = hexToRgb(a.color);
    const annot = doc.context.obj({
      Type: 'Annot',
      Subtype: 'Text',
      Rect: [Math.min(corners[0].x, corners[1].x), Math.min(corners[0].y, corners[1].y), Math.max(corners[0].x, corners[1].x), Math.max(corners[0].y, corners[1].y)],
      Contents: PDFHexString.fromText(a.text),
      T: PDFHexString.fromText('Note'),
      Name: 'Comment',
      C: [c.red, c.green, c.blue],
      Open: false,
      F: 4 | 8 | 16, // print, no-zoom, no-rotate
      M: PDFString.fromDate(new Date()),
    });
    page.node.addAnnot(doc.context.register(annot));
  }
}

// ---------------------------------------------------------------------------

export async function exportEditedPdf(
  srcBytes: ArrayBuffer,
  pages: PageInstance[],
  annotations: Annotation[],
  onProgress?: (fraction: number) => void,
): Promise<Uint8Array> {
  const srcDoc = await PDFDocument.load(srcBytes.slice(0));
  const outDoc = await PDFDocument.create();
  const needsText = annotations.some((a) => a.type === 'text');
  const ctx: ExportContext = { doc: outDoc, text: needsText ? await createTextDrawer(outDoc) : null, images: new Map() };

  for (let i = 0; i < pages.length; i++) {
    const inst = pages[i];
    const list = annotations.filter((a) => a.pageId === inst.id);
    const hasRedaction = list.some((a) => a.type === 'redact');

    if (!hasRedaction) {
      // Vector path: copy the original page and draw on top. Original text
      // stays selectable/searchable.
      let page: PDFPage;
      if (inst.blank) {
        page = outDoc.addPage([inst.blank.width, inst.blank.height]);
      } else {
        const [copied] = await outDoc.copyPages(srcDoc, [inst.originalIndex]);
        page = outDoc.addPage(copied);
      }
      const g = geomOf(page);
      await drawVector(page, g, list, ctx);
      addNotes(outDoc, page, list, (u, v) => toPdf(g, u, v), g.W, g.H);
      page.setRotation(degrees(g.r + inst.extraRotation));
    } else {
      // Redaction path: rasterize the whole page so covered content is truly
      // gone, not hidden under a removable layer.
      const scale = 2;
      let canvas: HTMLCanvasElement;
      let W: number;
      let H: number;
      if (inst.blank) {
        [W, H] = [inst.blank.width, inst.blank.height];
        canvas = document.createElement('canvas');
        canvas.width = Math.round(W * scale);
        canvas.height = Math.round(H * scale);
        const c = canvas.getContext('2d')!;
        c.fillStyle = '#ffffff';
        c.fillRect(0, 0, canvas.width, canvas.height);
      } else {
        canvas = await engine.pdf.renderPage(srcBytes.slice(0), inst.originalIndex + 1, scale);
        // Displayed size in points = rendered pixels / scale (crop box and
        // the page's own rotation are already applied by pdf.js).
        [W, H] = [canvas.width / scale, canvas.height / scale];
      }
      await drawAnnotationsToCanvas(canvas.getContext('2d')!, list, canvas.width, canvas.height);
      const rotated = rotateCanvas(canvas, inst.extraRotation);
      const jpeg = await outDoc.embedJpg(await canvasToBytes(rotated, 'image/jpeg', 0.92));
      const swap = normRot(inst.extraRotation) % 180 !== 0;
      const [pw, ph] = swap ? [H, W] : [W, H];
      const page = outDoc.addPage([pw, ph]);
      page.drawImage(jpeg, { x: 0, y: 0, width: pw, height: ph });
      addNotes(outDoc, page, list, (u, v) => {
        const r = rotateFrac(u, v, inst.extraRotation);
        return { x: r.u * pw, y: (1 - r.v) * ph };
      }, W, H);
    }

    onProgress?.((i + 1) / pages.length);
  }

  outDoc.setProducer('Rarvon PDF Editor');
  void PDFName;
  return outDoc.save();
}
