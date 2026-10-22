import { Component } from "react";

/** Keeps a rendering error from blanking the whole marketplace. */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("CampusKart UI error", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <main>
          <div className="wrap">
            <div className="card">
              <h3>Something went wrong</h3>
              <p className="muted">{String(this.state.error.message || this.state.error)}</p>
              <a className="btn" href="#/" onClick={() => this.setState({ error: null })}>
                Go to home
              </a>
            </div>
          </div>
        </main>
      );
    }
    return this.props.children;
  }
}
