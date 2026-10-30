import { Component, type ErrorInfo, type ReactNode } from 'react';
import { RotateCcw, TriangleAlert } from 'lucide-react';
import { tr } from '../i18n';
import { openExternal } from '../native';

const ISSUES_URL = 'https://github.com/KbzonZito/printer-hub/issues';

/**
 * If a screen throws while rendering, shows a notice with "Try again" instead of a blank app.
 * Keyed by the screen in App, so moving to another tab also starts it fresh.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Screen crashed', error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    // tr() rather than useT(): hooks can't be used in a class component.
    return (
      <div className="screen center">
        <div className="empty error-boundary" role="alert">
          <TriangleAlert size={40} />
          <h2>{tr('error.title')}</h2>
          <p className="muted">{tr('error.text')}</p>
          <pre className="klippy-message">{error.message}</pre>
          <div className="row gap wrap center-row">
            <button className="btn primary" onClick={() => this.setState({ error: null })}>
              <RotateCcw size={18} /> {tr('common.retry')}
            </button>
            <button className="btn" onClick={() => openExternal(ISSUES_URL)}>
              {tr('about.issue')}
            </button>
          </div>
        </div>
      </div>
    );
  }
}
