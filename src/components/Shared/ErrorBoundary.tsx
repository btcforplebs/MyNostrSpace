import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
    children: ReactNode;
    fallback?: ReactNode;
    className?: string;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false,
        error: null
    };

    public static getDerivedStateFromError(error: Error): State {
        // Update state so the next render will show the fallback UI.
        return { hasError: true, error };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error("Uncaught error:", error, errorInfo);
    }

    private handleReset = () => {
        this.setState({ hasError: false, error: null });
        window.location.reload();
    };

    public render() {
        if (this.state.hasError) {
            if (this.props.fallback) {
                return this.props.fallback;
            }

            return (
                <div className={`error-boundary-fallback ${this.props.className || ''}`} style={{
                    padding: '20px',
                    margin: '20px',
                    border: '1px solid #ff0000',
                    backgroundColor: '#fff0f0',
                    fontFamily: '"MS Sans Serif", Geneva, sans-serif',
                    textAlign: 'center'
                }}>
                    <h2 style={{ color: '#cc0000', fontSize: '14pt', marginTop: 0 }}>Oops! Something went wrong.</h2>
                    <p style={{ fontSize: '10pt' }}>The application encountered an unexpected error.</p>
                    <div style={{
                        textAlign: 'left',
                        backgroundColor: '#000',
                        color: '#0f0',
                        padding: '10px',
                        fontSize: '8pt',
                        overflow: 'auto',
                        maxHeight: '150px',
                        fontFamily: 'monospace',
                        marginBottom: '15px'
                    }}>
                        {this.state.error?.message}
                    </div>
                    <button
                        onClick={this.handleReset}
                        style={{
                            padding: '5px 15px',
                            cursor: 'pointer',
                            backgroundColor: '#f0f0f0',
                            border: '1px solid #999',
                            boxShadow: 'inset 1px 1px #fff, 1px 1px #000'
                        }}
                    >
                        Try Refreshing the Page
                    </button>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
