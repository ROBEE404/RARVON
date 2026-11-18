import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import DownloadButton from '../../../components/DownloadButton';
import ErrorMessage from '../../../components/ErrorMessage';
import { tr } from '../../../lib/i18n';

export default function QrTool() {
  const [text, setText] = useState('https://example.com');
  const [size, setSize] = useState(320);
  const [dataUrl, setDataUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!text.trim() || !canvasRef.current) {
      setDataUrl('');
      return;
    }
    QRCode.toCanvas(canvasRef.current, text, { width: size, margin: 2, color: { dark: '#14171c', light: '#faf9f6' } })
      .then(() => {
        setDataUrl(canvasRef.current!.toDataURL('image/png'));
        setError(null);
      })
      .catch(() => setError(tr("Could not generate a QR code for that input.")));
  }, [text, size]);

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="qr-text" className="mb-1.5 block text-xs font-medium text-ink-2">{tr("Text or URL")}</label>
        <input
          id="qr-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="w-full rounded-md border border-line bg-paper px-3 py-2 text-sm focus:border-workshop"
        />
      </div>
      <label className="flex items-center gap-2 text-xs text-ink-2">
        {tr("Size")}
        <input type="range" min={160} max={640} step={20} value={size} onChange={(e) => setSize(Number(e.target.value))} />
        {size}{tr("px")}
      </label>
      {error && <ErrorMessage>{error}</ErrorMessage>}
      <div className="flex flex-col items-center gap-4 rounded-lg border border-line bg-paper-dim p-6">
        <canvas ref={canvasRef} className="max-w-full rounded bg-white" />
        {dataUrl && <DownloadButton url={dataUrl} filename="qr-code.png" label={tr("Download PNG")} />}
      </div>
    </div>
  );
}
