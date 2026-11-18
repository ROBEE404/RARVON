
export type EditorTool = 'select' | 'text' | 'draw' | 'highlight' | 'underline' | 'shape' | 'image' | 'note' | 'signature' | 'redact';

export type ShapeKind = 'rect' | 'ellipse' | 'line' | 'arrow';

export interface PageInstance {
  /** Stable id for this page slot in the editor (survives reorder/duplicate). */
  id: string;
  /** Index into the original source PDF this page's content comes from; -1 for an inserted blank page. */
  originalIndex: number;
  /** Rotation added on top of the page's own embedded rotation, in degrees (0/90/180/270). */
  extraRotation: number;
  /** Set for inserted blank pages: size in points, as displayed (before extraRotation). */
  blank?: { width: number; height: number };
}

interface AnnotationBase {
  id: string;
  pageId: string;
  /** Coordinates are stored as fractions (0..1) of the page's own width/height
   * *as displayed* (the page's embedded rotation and crop box already applied,
   * the editor's extra rotation not), so they stay correct regardless of zoom
   * level or export resolution. */
  x: number;
  y: number;
}

export interface TextAnnotation extends AnnotationBase {
  type: 'text';
  text: string;
  size: number; // fraction of page height, so it scales sensibly across page sizes
  color: string;
}

export interface DrawAnnotation extends AnnotationBase {
  type: 'draw';
  /** Points relative to (x, y), each as a fraction of page width/height. */
  points: { x: number; y: number }[];
  color: string;
  strokeWidth: number; // fraction of page width
}

export interface HighlightAnnotation extends AnnotationBase {
  type: 'highlight';
  w: number;
  h: number;
  color: string;
}

/** A line under the dragged box's bottom edge (drag across a line of text). */
export interface UnderlineAnnotation extends AnnotationBase {
  type: 'underline';
  w: number;
  h: number;
  color: string;
}

export interface ShapeAnnotation extends AnnotationBase {
  type: 'shape';
  kind: ShapeKind;
  /** For rect/ellipse: positive size of the box. For line/arrow: the vector from (x, y) to the end point (may be negative). */
  w: number;
  h: number;
  color: string;
  strokeWidth: number; // fraction of page width
}

export interface SignatureAnnotation extends AnnotationBase {
  type: 'signature';
  w: number;
  h: number;
  dataUrl: string;
}

export interface ImageAnnotation extends AnnotationBase {
  type: 'image';
  w: number;
  h: number;
  /** PNG or JPEG data URL. */
  dataUrl: string;
}

/** A sticky note: exported as a real PDF comment (Text annotation) that viewers show as an icon with a pop-up. */
export interface NoteAnnotation extends AnnotationBase {
  type: 'note';
  text: string;
  color: string;
}

export interface RedactAnnotation extends AnnotationBase {
  type: 'redact';
  w: number;
  h: number;
}

export type Annotation =
  | TextAnnotation
  | DrawAnnotation
  | HighlightAnnotation
  | UnderlineAnnotation
  | ShapeAnnotation
  | SignatureAnnotation
  | ImageAnnotation
  | NoteAnnotation
  | RedactAnnotation;

export interface EditorSnapshot {
  pages: PageInstance[];
  annotations: Annotation[];
}

export function newId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/** Baseline of a text annotation, as a fraction of its font size below the box top (matches the overlay's line-height: 1 rendering). */
export const TEXT_BASELINE = 0.88;
/** Sticky-note icon size in points (and editor pixels at 100%). */
export const NOTE_ICON_PT = 22;
/** Underline thickness as a fraction of page height. */
export const UNDERLINE_THICKNESS = 0.0022;
