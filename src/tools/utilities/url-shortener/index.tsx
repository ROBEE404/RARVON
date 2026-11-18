import { useState } from 'react';
import Button from '../../../components/Button';
import { tr } from '../../../lib/i18n';

// This tool is intentionally non-functional. A real short link needs a
// server to remember where each code points, which this project doesn't
// have yet. The form below is the real interface and calls a single
// placeholder function — wire `createShortLink` up to a backend endpoint
// (e.g. POST /api/links) to make this tool live without touching the UI.

async function createShortLink(_longUrl: string): Promise<{ shortUrl: string }> {
  throw new Error(tr("No backend is connected yet."));
}

export default function UrlShortenerTool() {
  const [longUrl, setLongUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function handleSubmit() {
    setSubmitting(true);
    try {
      await createShortLink(longUrl);
    } catch {
      setNotice(tr("Short links need a backend, which isn’t connected in this free build yet."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="long-url" className="mb-1.5 block text-xs font-medium text-ink-2">{tr("Long URL")}</label>
        <input
          id="long-url"
          value={longUrl}
          onChange={(e) => setLongUrl(e.target.value)}
          placeholder={tr("https://example.com/a/very/long/path")}
          className="w-full rounded-md border border-line bg-paper px-3 py-2 text-sm focus:border-workshop"
        />
      </div>
      <Button onClick={handleSubmit} disabled={!longUrl.trim() || submitting}>
        {submitting ? tr("Shortening…") : tr("Shorten URL")}
      </Button>
      {notice && <p className="text-xs text-ink-3">{notice}</p>}
    </div>
  );
}
