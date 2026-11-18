import { useState } from 'react';
import exifr from 'exifr';
import FileDropzone from '../../../components/FileDropzone';
import ErrorMessage from '../../../components/ErrorMessage';
import { formatBytes } from '../../../lib/imageUtils';
import { tr } from '../../../lib/i18n';

export default function ImageMetadata() {
  const [file, setFile] = useState<File | null>(null);
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleFile(files: File[]) {
    const f = files[0];
    setFile(f);
    setBusy(true);
    setError(null);
    setData(null);
    try {
      const parsed = await exifr.parse(f, true);
      setData(parsed ?? null);
      if (!parsed) setError(tr("No EXIF metadata was found in this file."));
    } catch {
      setError(tr("Could not read metadata from this file."));
    } finally {
      setBusy(false);
    }
  }

  const entries = data
    ? Object.entries(data).filter(([, v]) => v !== undefined && v !== null && typeof v !== 'object')
    : [];

  return (
    <div className="space-y-4">
      <FileDropzone accept="image/*" onFiles={handleFile} hint={tr("JPG works best — PNG/WebP rarely embed EXIF")} />
      {file && (
        <p className="text-xs text-ink-3">{file.name} · {formatBytes(file.size)}</p>
      )}
      {busy && <p className="text-xs text-ink-3">{tr("Reading metadata…")}</p>}
      {error && <ErrorMessage>{error}</ErrorMessage>}
      {entries.length > 0 && (
        <div className="overflow-hidden rounded-md border border-line">
          <table className="w-full text-start text-xs">
            <tbody>
              {entries.map(([key, value]) => (
                <tr key={key} className="border-b border-line last:border-0 odd:bg-paper-dim">
                  <th scope="row" className="px-3 py-2 font-medium text-ink-2">{key}</th>
                  <td className="px-3 py-2 font-mono">{String(value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
