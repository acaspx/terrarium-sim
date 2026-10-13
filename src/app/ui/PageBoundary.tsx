import { Component, type ReactNode } from 'react';

/**
 * Catches an error on one page so it cannot take the whole app down. Without this, a
 * page that throws while drawing unmounts everything, and links stop working until a
 * refresh. Keyed by the route in App, so moving to another page clears it.
 */
export class PageBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    console.error('A page failed to draw', error, info.componentStack);
  }
  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <main className="detail-page">
        <div className="notice" role="alert">
          <div>
            <p><strong>This page ran into a problem.</strong></p>
            <p className="hint">Your jars are safe. Try again, or go back to your shelf. ({error.message.slice(0, 160)})</p>
          </div>
          <div className="share-row">
            <button type="button" className="button" onClick={() => this.setState({ error: null })}>Try again</button>
            <a className="button quiet" href="#/">Your shelf</a>
          </div>
        </div>
      </main>
    );
  }
}

/** Contains an error to one part of a page (a shelf card, a table row), drawing `fallback` in its place. */
export class Contain extends Component<{ children: ReactNode; fallback: ReactNode; label?: string }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error) {
    console.error(`Could not draw ${this.props.label ?? 'part of the page'}`, error);
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
