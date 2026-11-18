import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import Button from './Button';
import { useWorkspace } from '../lib/workspaceContext';
import { tr } from '../lib/i18n';

interface DownloadButtonProps {
  url: string;
  filename: string;
  label?: string;
}

export default function DownloadButton({ url, filename, label = 'Download result' }: DownloadButtonProps) {
  const { setPending, retainUrl, releaseUrl } = useWorkspace();
  const { pathname } = useLocation();

  // Hold the result URL while this button is shown; once it unmounts (new
  // result, file removed, page left) and chaining no longer points at it,
  // the workspace revokes it so the blob can be garbage-collected.
  useEffect(() => {
    retainUrl(url);
    return () => releaseUrl(url);
  }, [url, retainUrl, releaseUrl]);

  // Every result a tool produces becomes available for other tools to pick
  // up directly, without the user re-downloading and re-uploading it. This
  // one effect is what makes chaining work across the whole site, since
  // DownloadButton is already the shared result affordance almost every
  // tool uses. setPending is stable and ignores repeats, so this can't loop.
  useEffect(() => {
    setPending({ url, filename, source: pathname });
  }, [url, filename, pathname, setPending]);

  return (
    <Button
      onClick={() => {
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
      }}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M12 4v12m0 0l-4-4m4 4l4-4" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M4 18v1a2 2 0 002 2h12a2 2 0 002-2v-1" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {tr(label)}
    </Button>
  );
}
