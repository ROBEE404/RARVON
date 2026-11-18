import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { tr } from '../../../lib/i18n';

interface Props {
  children: ReactNode;
}
interface State {
  error: Error | null;
}

export default class EditorErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error('PDF Editor crashed:', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 rounded-lg border border-line bg-paper-dim p-8 text-center">
          <p className="font-display text-sm font-semibold text-ink">{tr("Something went wrong in the editor")}</p>
          <p className="max-w-sm text-xs text-ink-2">
            {tr("An unexpected error interrupted the editor. Your file was never uploaded anywhere, so nothing was lost outside this tab — reloading and starting over is the safest next step.")}
          </p>
          <p className="max-w-sm break-words rounded bg-paper px-3 py-2 font-mono text-[11px] text-warn">
            {this.state.error.message}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="rounded-md bg-ink px-4 py-2 text-xs font-medium text-paper hover:bg-workshop"
          >
            {tr("Reload the page")}
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
