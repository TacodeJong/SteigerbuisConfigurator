import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
}

/**
 * Vangt renderfouten in de app-shell op met een vriendelijke NL-fallback.
 * Class-component: React error boundaries werken (nog) niet als function component.
 */
export class AppErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('AppErrorBoundary', error, info.componentStack)
  }

  private handleReload = () => {
    window.location.reload()
  }

  private handleHome = () => {
    const url = new URL(window.location.href)
    url.search = ''
    url.hash = ''
    window.location.assign(url.toString())
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <div className="app-error-fallback" role="alert">
        <h1>Er ging iets mis</h1>
        <p>
          De pagina kon niet worden geladen. Probeer opnieuw te laden, of ga terug naar het begin.
          Blijft het probleem: vernieuw de browser of probeer later opnieuw.
        </p>
        <div className="app-error-fallback-actions">
          <button type="button" className="bom-action-btn" onClick={this.handleReload}>
            Pagina herladen
          </button>
          <button type="button" className="bom-action-btn secondary" onClick={this.handleHome}>
            Naar start
          </button>
        </div>
      </div>
    )
  }
}
