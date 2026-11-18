import { supportLinks, hasAnySupportLink } from '../lib/supportConfig';
import { tr } from '../lib/i18n';

interface SupportButtonProps {
  variant?: 'inline' | 'footer';
}

export default function SupportButton({ variant = 'inline' }: SupportButtonProps) {
  if (!hasAnySupportLink()) return null;
  const href = supportLinks.kofi || supportLinks.donation || supportLinks.sponsorship || supportLinks.other;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={
        variant === 'footer'
          ? 'inline-flex items-center gap-1.5 text-xs font-medium text-ink-3 hover:text-ink'
          : 'inline-flex items-center gap-1.5 rounded-md border border-line px-3 py-2 text-xs font-medium hover:border-ink'
      }
    >
      <span aria-hidden="true">☕</span> {tr('Support the project')}
    </a>
  );
}
