import { Component } from 'react';

// A crash on one screen shows a friendly message instead of a blank white page.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[Kanta Khata] screen error', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="panel">
          <h2>Is screen par masla aa gaya</h2>
          <p className="note">Aap ka data mehfooz hai. Dobara koshish karein; masla rahe to page refresh karein.</p>
          <pre className="error-detail">{String(this.state.error?.message || this.state.error)}</pre>
          <button type="button" className="btn" onClick={() => this.setState({ error: null })}>Dobara koshish</button>{' '}
          <button type="button" className="btn primary" onClick={() => window.location.reload()}>Page Refresh</button>
        </div>
      );
    }
    return this.props.children;
  }
}
