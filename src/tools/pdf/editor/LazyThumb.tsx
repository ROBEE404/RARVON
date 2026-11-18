import { engine } from '../../../engine';
import { useEffect, useRef, useState } from 'react';
import { tr } from '../../../lib/i18n';

const thumbCache = new Map<string, string>(); // key: `${srcId}:${originalIndex}` -> data URL

export default function LazyThumb({
  srcBytes,
  srcId,
  originalIndex,
  rotation,
  blank,
}: {
  srcBytes: ArrayBuffer;
  srcId: string;
  originalIndex: number;
  rotation: number;
  blank?: { width: number; height: number };
}) {
  const [dataUrl, setDataUrl] = useState<string | null>(thumbCache.get(`${srcId}:${originalIndex}`) ?? null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (dataUrl || blank) return;
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          observer.disconnect();
          engine.pdf.renderPage(srcBytes.slice(0), originalIndex + 1, 0.5)
            .then((canvas) => {
              const url = canvas.toDataURL('image/png');
              thumbCache.set(`${srcId}:${originalIndex}`, url);
              setDataUrl(url);
            })
            .catch(() => {});
        }
      },
      { rootMargin: '200px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [dataUrl, blank, srcBytes, srcId, originalIndex]);

  return (
    <div ref={ref} className="flex aspect-[3/4] w-full items-center justify-center overflow-hidden rounded bg-paper">
      {blank ? (
        <div
          aria-label={tr("Blank page")}
          className="border border-line bg-white"
          style={{ aspectRatio: `${blank.width} / ${blank.height}`, height: blank.height >= blank.width ? '100%' : undefined, width: blank.width > blank.height ? '100%' : undefined, transform: `rotate(${rotation}deg)` }}
        />
      ) : dataUrl ? (
        <img
          src={dataUrl}
          alt={tr("Page {0}", { 0: originalIndex + 1 })}
          className="max-h-full max-w-full"
          style={{ transform: `rotate(${rotation}deg)` }}
        />
      ) : (
        <span className="text-[10px] text-ink-3">…</span>
      )}
    </div>
  );
}
