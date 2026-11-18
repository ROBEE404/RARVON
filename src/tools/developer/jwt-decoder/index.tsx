import { useMemo, useState } from 'react';
import ErrorMessage from '../../../components/ErrorMessage';
import { CopyButton } from '../../../components/tool';
import { tr } from '../../../lib/i18n';

function base64UrlDecode(segment: string): string {
  const padded = segment.replace(/-/g, '+').replace(/_/g, '/').padEnd(segment.length + ((4 - (segment.length % 4)) % 4), '=');
  return decodeURIComponent(
    atob(padded)
      .split('')
      .map((c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0'))
      .join(''),
  );
}

function tryPrettyJson(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

function formatUnixClaim(value: unknown): string | null {
  if (typeof value !== 'number') return null;
  const d = new Date(value * 1000);
  if (Number.isNaN(d.getTime())) return null;
  return d.toUTCString();
}

export default function JwtDecoder() {
  const [token, setToken] = useState('');

  const decoded = useMemo(() => {
    const trimmed = token.trim();
    if (!trimmed) return null;
    const parts = trimmed.split('.');
    if (parts.length < 2) return { error: 'A JWT has three dot-separated parts (header.payload.signature). This doesn\u2019t look like one.' };
    try {
      const header = tryPrettyJson(base64UrlDecode(parts[0]));
      const payload = tryPrettyJson(base64UrlDecode(parts[1]));
      let payloadObj: Record<string, unknown> = {};
      try {
        payloadObj = JSON.parse(base64UrlDecode(parts[1]));
      } catch {
        /* not an object payload; skip claim summary */
      }
      return { header, payload, signaturePresent: Boolean(parts[2]), payloadObj };
    } catch {
      return { error: 'Could not decode this token. Make sure it\u2019s a valid Base64URL-encoded JWT.' };
    }
  }, [token]);

  const claimHints = decoded && !('error' in decoded) ? decoded.payloadObj : {};
  const timeClaims = (['iat', 'exp', 'nbf'] as const)
    .map((k) => ({ key: k, value: formatUnixClaim(claimHints?.[k]) }))
    .filter((c) => c.value);

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="jwt-input" className="mb-1.5 block text-xs font-medium text-ink-2">{tr("Paste a JWT")}</label>
        <textarea
          id="jwt-input"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          rows={4}
          spellCheck={false}
          placeholder={tr("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9....")}
          className="w-full rounded-md border border-line bg-paper px-3 py-2 font-mono text-xs leading-relaxed focus:border-workshop"
        />
      </div>

      {decoded && 'error' in decoded && <ErrorMessage>{decoded.error}</ErrorMessage>}

      {decoded && !('error' in decoded) && (
        <div className="space-y-4">
          {timeClaims.length > 0 && (
            <div className="rounded-md border border-line bg-paper-dim p-3 text-xs">
              {timeClaims.map((c) => (
                <p key={c.key}>
                  <span className="font-mono text-ink-3">{c.key}</span> → {c.value}
                </p>
              ))}
            </div>
          )}
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-xs font-medium text-ink-2">{tr("Header")}</span>
              <CopyButton text={decoded.header} label={tr("Copy")} />
            </div>
            <pre className="overflow-auto rounded-md border border-line bg-paper-dim px-3 py-2 font-mono text-xs leading-relaxed">{decoded.header}</pre>
          </div>
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-xs font-medium text-ink-2">{tr("Payload")}</span>
              <CopyButton text={decoded.payload} label={tr("Copy")} />
            </div>
            <pre className="overflow-auto rounded-md border border-line bg-paper-dim px-3 py-2 font-mono text-xs leading-relaxed">{decoded.payload}</pre>
          </div>
          <p className="text-xs text-ink-3">
            {decoded.signaturePresent ? tr("A signature segment is present but not verified here.") : tr("No signature segment was found.")}
          </p>
        </div>
      )}
    </div>
  );
}
