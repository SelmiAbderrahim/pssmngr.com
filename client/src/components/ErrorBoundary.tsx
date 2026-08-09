// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home, Bug, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ApplicationError, ErrorHandler, ErrorFallbackProps } from '@/errors';
import { getLogger } from '@/lib/logger';
import i18n from '@/i18n';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: React.ComponentType<ErrorFallbackProps> | ReactNode;
  onError?: (error: ApplicationError, errorInfo: ErrorInfo) => void;
  showRetry?: boolean;
  showHomeButton?: boolean;
  showReportButton?: boolean;
  customTitle?: string;
  customMessage?: string;
  maxRetries?: number;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: ApplicationError | null;
  errorInfo: ErrorInfo | null;
  retryCount: number;
}

const MAX_RETRIES = 3;

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  private retryTimeouts: NodeJS.Timeout[] = [];

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      retryCount: 0
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return {
      hasError: true,
      error: ErrorHandler.normalize(error)
    };
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    const normalizedError = ErrorHandler.normalize(error);

    this.setState({
      error: normalizedError,
      errorInfo
    });

    // Log the error with structured logger
    const logger = getLogger();
    logger.error('React Error Boundary caught error', {
      function: 'ErrorBoundary.componentDidCatch',
      error: normalizedError,
      componentStack: errorInfo.componentStack,
      errorCode: normalizedError.code,
      isRecoverable: normalizedError.recoverable,
    });

    // Also use legacy error handler for backwards compatibility
    ErrorHandler.log(normalizedError, {
      componentStack: errorInfo.componentStack,
      props: this.props
    });

    // Call custom error handler if provided
    this.props.onError?.(normalizedError, errorInfo);
  }

  override componentWillUnmount() {
    // Clean up any pending retry timeouts
    this.retryTimeouts.forEach(timeout => clearTimeout(timeout));
  }

  private resetError = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      retryCount: 0
    });
  };

  private handleRetry = () => {
    const { error, retryCount } = this.state;
    const maxRetries = this.props.maxRetries || MAX_RETRIES;

    if (!error || !error.isRecoverable()) {
      return;
    }

    if (retryCount >= maxRetries) {
      const logger = getLogger();
      logger.warn('Max retry attempts exceeded', {
        function: 'ErrorBoundary.handleRetry',
        maxRetries,
        retryCount,
      });
      return;
    }

    // Increment retry count
    this.setState(prevState => ({
      retryCount: prevState.retryCount + 1
    }));

    // Add exponential backoff delay
    const delay = Math.pow(2, retryCount) * 1000; // 1s, 2s, 4s, etc.
    const timeout = setTimeout(() => {
      this.resetError();
    }, delay);

    this.retryTimeouts.push(timeout);
  };

  override render() {
    const { hasError, error, errorInfo } = this.state;
    const {
      children,
      fallback,
      showRetry = true,
      showHomeButton = true,
      showReportButton = false,
      customTitle,
      customMessage,
      maxRetries = MAX_RETRIES
    } = this.props;

    if (hasError && error) {
      // Handle legacy string fallbacks
      if (typeof fallback === 'string' || React.isValidElement(fallback)) {
        return fallback;
      }

      // Handle custom fallback component
      if (typeof fallback === 'function') {
        const FallbackComponent = fallback as React.ComponentType<ErrorFallbackProps>;
        return (
          <FallbackComponent
            error={error}
            resetError={this.resetError}
            componentStack={errorInfo?.componentStack ?? undefined}
          />
        );
      }

      // Use enhanced default fallback
      return (
        <div className="min-h-screen flex items-center justify-center bg-background p-4">
          <Card className="w-full max-w-lg">
            <CardHeader className="text-center">
              <div className="mx-auto w-12 h-12 bg-destructive/10 rounded-full flex items-center justify-center mb-4">
                <AlertTriangle className="h-6 w-6 text-destructive" />
              </div>
              <CardTitle className="text-xl font-semibold text-foreground">
                {customTitle || i18n.t('errors:pages.generalError.title', 'Something went wrong')}
              </CardTitle>
            </CardHeader>

            <CardContent className="space-y-4">
              <Alert>
                <AlertDescription className="text-muted-foreground">
                  {customMessage || error.getUserMessage()}
                </AlertDescription>
              </Alert>

              {/* Development details */}
              {process.env.NODE_ENV === 'development' && (
                <div className="space-y-2">
                  <div className="text-xs font-mono bg-muted p-2 rounded">
                    <div className="font-semibold">{i18n.t('errors:pages.generalError.errorCode', 'Error Code:')}</div>
                    <div>{error.code}</div>
                    <div className="font-semibold mt-2">{i18n.t('errors:pages.generalError.message', 'Message:')}</div>
                    <div>{error.message}</div>
                    {error.recoverable && (
                      <div className="mt-1 text-green-600">{i18n.t('errors:pages.generalError.recoverableYes', 'Recoverable: Yes')}</div>
                    )}
                  </div>

                  {error.details !== undefined && (
                    <div className="text-xs font-mono bg-muted p-2 rounded">
                      <div className="font-semibold">{i18n.t('errors:pages.generalError.details', 'Details:')}</div>
                      <pre className="whitespace-pre-wrap">
                        {JSON.stringify(error.details, null, 2)}
                      </pre>
                    </div>
                  )}

                  {errorInfo?.componentStack && (
                    <details className="text-xs">
                      <summary className="font-semibold cursor-pointer">{i18n.t('errors:pages.generalError.componentStack', 'Component Stack')}</summary>
                      <pre className="mt-1 bg-muted p-2 rounded overflow-auto max-h-32">
                        {errorInfo.componentStack}
                      </pre>
                    </details>
                  )}
                </div>
              )}

              {/* Action buttons */}
              <div className="flex flex-col sm:flex-row gap-2 pt-4">
                {showRetry && error.isRecoverable() && (
                  <Button
                    onClick={this.handleRetry}
                    className="flex-1 min-h-[44px] gap-2"
                    disabled={this.state.retryCount >= maxRetries}
                  >
                    <RefreshCw className="h-4 w-4 shrink-0" />
                    <span className="truncate">{i18n.t('errors:pages.generalError.tryAgain', 'Try Again')}</span>
                    {this.state.retryCount > 0 && (
                      <span className="ms-1 text-xs shrink-0">
                        ({this.state.retryCount}/{maxRetries})
                      </span>
                    )}
                  </Button>
                )}

                {showHomeButton && (
                  <Button
                    variant="outline"
                    onClick={() => window.location.href = '/'}
                    className="flex-1 min-h-[44px] gap-2"
                  >
                    <Home className="h-4 w-4 shrink-0" />
                    <span className="truncate">{i18n.t('errors:pages.generalError.goHome', 'Go Home')}</span>
                  </Button>
                )}

                {process.env.NODE_ENV === 'development' && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      const logger = getLogger();
                      logger.debug('Error details requested', {
                        function: 'ErrorBoundary.debugButton',
                        errorDetails: error.toJSON(),
                      });
                    }}
                    size="sm"
                    className="min-h-[44px] gap-2"
                  >
                    <Bug className="h-4 w-4 shrink-0" />
                    <span className="truncate">{i18n.t('errors:pages.generalError.debug', 'Debug')}</span>
                  </Button>
                )}
              </div>

              {/* Report button for production */}
              {showReportButton && process.env.NODE_ENV !== 'development' && (
                <Button
                  variant="ghost"
                  onClick={() => ErrorHandler.log(error, { componentStack: errorInfo?.componentStack })}
                  size="sm"
                  className="w-full min-h-[44px] gap-2"
                >
                  <FileText className="h-4 w-4 shrink-0" />
                  <span className="truncate">{i18n.t('errors:pages.generalError.reportIssue', 'Report Issue')}</span>
                </Button>
              )}

              <div className="text-xs text-muted-foreground text-center pt-2 border-t">
                {i18n.t('errors:pages.generalError.errorId', 'Error ID: {{id}}', { id: error.timestamp })}
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }

    return children;
  }
}

/**
 * Hook for handling async errors in functional components
 */
export function useErrorHandler() {
  const handleError = React.useCallback((error: unknown) => {
    const normalizedError = ErrorHandler.normalize(error);
    const logger = getLogger();

    logger.error('Async error caught', {
      function: 'useErrorHandler',
      error: normalizedError,
      errorCode: normalizedError.code,
      isRecoverable: normalizedError.recoverable,
    });

    ErrorHandler.log(normalizedError);
  }, []);

  return { handleError };
}

/**
 * Higher-order component for wrapping components with error boundary
 */
export function withErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  errorBoundaryProps?: Omit<ErrorBoundaryProps, 'children'>
) {
  const WrappedComponent = (props: P) => (
    <ErrorBoundary {...errorBoundaryProps}>
      <Component {...props} />
    </ErrorBoundary>
  );

  WrappedComponent.displayName = `withErrorBoundary(${Component.displayName || Component.name})`;

  return WrappedComponent;
}
