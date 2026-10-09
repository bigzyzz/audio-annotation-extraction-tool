"use client";

import { useMemo } from "react";
import {
  formatActionableError,
  type ActionableError,
  type ErrorContext,
} from "@/lib/actionable-error";

export type ActionableErrorAlertProps = {
  error: unknown | string | ActionableError;
  context?: ErrorContext;
  onRetry?: () => void;
  onDismiss?: () => void;
  className?: string;
};

export function ActionableErrorAlert({
  error,
  context = "general",
  onRetry,
  onDismiss,
  className = "",
}: ActionableErrorAlertProps) {
  const formatted: ActionableError | null = useMemo(() => {
    if (!error) return null;
    if (
      typeof error === "object" &&
      "title" in error &&
      "recoveryAdvice" in error &&
      typeof (error as ActionableError).title === "string"
    ) {
      return error as ActionableError;
    }
    return formatActionableError(error, context);
  }, [error, context]);

  if (!formatted) return null;

  return (
    <div
      role="alert"
      className={`rounded-lg border border-red-200 bg-red-50/90 p-4 text-sm text-red-900 shadow-xs dark:border-red-900/60 dark:bg-red-950/50 dark:text-red-200 ${className}`}
    >
      <div className="flex items-start gap-3">
        <svg
          className="mt-0.5 h-5 w-5 shrink-0 text-red-600 dark:text-red-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>

        <div className="flex-1 space-y-1">
          <p className="font-semibold text-red-950 dark:text-red-100">
            {formatted.title}
          </p>
          <p className="text-red-800 dark:text-red-300">
            {formatted.message}
          </p>

          {formatted.recoveryAdvice ? (
            <div className="mt-2 rounded-md bg-white/70 px-3 py-2 text-xs text-red-950 shadow-2xs dark:bg-black/30 dark:text-red-200">
              <span className="font-semibold">💡 What to do: </span>
              <span>{formatted.recoveryAdvice}</span>
            </div>
          ) : null}

          {(onRetry || onDismiss) && (
            <div className="mt-3 flex flex-wrap items-center gap-2 pt-1">
              {onRetry && formatted.retryable ? (
                <button
                  type="button"
                  onClick={onRetry}
                  className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white shadow-xs transition-colors hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-600"
                >
                  Try Again
                </button>
              ) : null}
              {onDismiss ? (
                <button
                  type="button"
                  onClick={onDismiss}
                  className="rounded-md border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-800 transition-colors hover:bg-red-100 dark:border-red-800 dark:bg-zinc-900 dark:text-red-300 dark:hover:bg-zinc-800"
                >
                  Dismiss
                </button>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
