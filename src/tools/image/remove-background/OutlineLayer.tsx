import type { PointerEvent as ReactPointerEvent } from 'react';
import type { Outline, Vec } from '../../../lib/outline';
import { svgPath } from '../../../lib/outline';

interface Props {
  outlines: Outline[];
  w: number;
  h: number;
  /** Work pixels per screen pixel, so points stay the same size at any zoom. */
  scale: number;
  smooth: number;
  selected: { id: string; i: number } | null;
  cursor: Vec | null;
  onPointDown: (e: ReactPointerEvent, id: string, i: number) => void;
  onHandleDown: (e: ReactPointerEvent, id: string, i: number, which: 'hin' | 'hout') => void;
}

/** The editable outline drawn over the picture: lines, points and curve handles. */
export default function OutlineLayer({ outlines, w, h, scale, smooth, selected, cursor, onPointDown, onHandleDown }: Props) {
  const r = 5 * scale;
  const line = 1.6 * scale;
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
      data-testid="outline-layer"
      aria-hidden="true"
    >
      {outlines.map((o) => {
        const d = svgPath(o, smooth);
        const last = o.points[o.points.length - 1];
        return (
          <g key={o.id}>
            {/* White halo under the line so it shows on dark and light pictures. */}
            <path d={d} fill="none" stroke="white" strokeWidth={line * 2.6} strokeLinejoin="round" opacity={0.85} />
            <path d={d} fill="none" stroke="var(--color-workshop)" strokeWidth={line} strokeLinejoin="round" strokeDasharray={o.hole ? `${6 * scale} ${4 * scale}` : undefined} className="outline-draw" />
            {!o.closed && cursor && last && (
              <line x1={last.x} y1={last.y} x2={cursor.x} y2={cursor.y} stroke="var(--color-workshop)" strokeWidth={line} strokeDasharray={`${4 * scale} ${4 * scale}`} opacity={0.7} />
            )}
            {o.points.map((p, i) => {
              const isSel = selected?.id === o.id && selected.i === i;
              const isStart = !o.closed && i === 0 && o.points.length >= 3;
              return (
                <g key={i}>
                  {isSel && p.hin && (
                    <>
                      <line x1={p.x} y1={p.y} x2={p.hin.x} y2={p.hin.y} stroke="var(--color-workshop)" strokeWidth={line * 0.8} />
                      <circle cx={p.hin.x} cy={p.hin.y} r={r * 0.75} fill="var(--color-workshop)" stroke="white" strokeWidth={line} className="pointer-events-auto cursor-move" onPointerDown={(e) => onHandleDown(e, o.id, i, 'hin')} data-handle="hin" />
                    </>
                  )}
                  {isSel && p.hout && (
                    <>
                      <line x1={p.x} y1={p.y} x2={p.hout.x} y2={p.hout.y} stroke="var(--color-workshop)" strokeWidth={line * 0.8} />
                      <circle cx={p.hout.x} cy={p.hout.y} r={r * 0.75} fill="var(--color-workshop)" stroke="white" strokeWidth={line} className="pointer-events-auto cursor-move" onPointerDown={(e) => onHandleDown(e, o.id, i, 'hout')} data-handle="hout" />
                    </>
                  )}
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={isStart ? r * 1.5 : r}
                    fill={isSel ? 'var(--color-workshop)' : 'white'}
                    stroke="var(--color-workshop)"
                    strokeWidth={line * 1.2}
                    className={isStart ? 'outline-close-target pointer-events-auto cursor-pointer' : 'outline-point pointer-events-auto cursor-move'}
                    onPointerDown={(e) => onPointDown(e, o.id, i)}
                    data-point={i}
                  />
                </g>
              );
            })}
          </g>
        );
      })}
    </svg>
  );
}
