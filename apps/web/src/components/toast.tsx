"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

export type ToastType = "success" | "error" | "info" | "warning";

export type ToastAction = {
  label: string;
  onClick: () => void;
};

export type ToastOptions = {
  type?: ToastType;
  title: string;
  message?: string;
  duration?: number; // ms, default 5000; 0 for persistent
  action?: ToastAction;
};

export type ToastItem = ToastOptions & {
  id: string;
  type: ToastType;
  duration: number;
  createdAt: number;
};

export type ToastHelpers = {
  show: (options: ToastOptions) => string;
  success: (title: string, message?: string, action?: ToastAction) => string;
  error: (title: string, message?: string, action?: ToastAction) => string;
  info: (title: string, message?: string, action?: ToastAction) => string;
  warning: (title: string, message?: string, action?: ToastAction) => string;
};

type ToastContextValue = {
  showToast: (options: ToastOptions) => string;
  dismissToast: (id: string) => void;
  toast: ToastHelpers;
};

export function createToastHelpers(
  showToast: (options: ToastOptions) => string,
): ToastHelpers {
  return {
    show: (options: ToastOptions) => showToast(options),
    success: (title: string, message?: string, action?: ToastAction) =>
      showToast({ type: "success", title, message, action }),
    error: (title: string, message?: string, action?: ToastAction) =>
      showToast({ type: "error", title, message, action }),
    info: (title: string, message?: string, action?: ToastAction) =>
      showToast({ type: "info", title, message, action }),
    warning: (title: string, message?: string, action?: ToastAction) =>
      showToast({ type: "warning", title, message, action }),
  };
}

const noop = () => "";
const fallbackHelpers: ToastHelpers = {
  show: noop,
  success: noop,
  error: noop,
  info: noop,
  warning: noop,
};

const ToastContext = createContext<ToastContextValue | null>(null);

let toastCounter = 0;
export function generateToastId(): string {
  toastCounter += 1;
  return `toast-${Date.now()}-${toastCounter}`;
}

function ToastCard({
  item,
  onDismiss,
}: {
  item: ToastItem;
  onDismiss: (id: string) => void;
}) {
  useEffect(() => {
    if (item.duration <= 0) return;
    const timer = setTimeout(() => {
      onDismiss(item.id);
    }, item.duration);
    return () => clearTimeout(timer);
  }, [item.id, item.duration, onDismiss]);

  return (
    <div
      role={item.type === "error" ? "alert" : "status"}
      aria-live="polite"
      className={`pointer-events-auto flex items-start gap-3 rounded-lg border p-4 shadow-lg backdrop-blur-md transition-all duration-200 animate-in fade-in slide-in-from-bottom-2 ${
        item.type === "success"
          ? "border-emerald-300 bg-white/95 text-emerald-950 dark:border-emerald-800 dark:bg-zinc-900/95 dark:text-emerald-100"
          : item.type === "error"
            ? "border-rose-300 bg-white/95 text-rose-950 dark:border-rose-800 dark:bg-zinc-900/95 dark:text-rose-100"
            : item.type === "warning"
              ? "border-amber-300 bg-white/95 text-amber-950 dark:border-amber-800 dark:bg-zinc-900/95 dark:text-amber-100"
              : "border-zinc-300 bg-white/95 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900/95 dark:text-zinc-100"
      }`}
    >
      {/* Type Icon */}
      <div className="mt-0.5 shrink-0">
        {item.type === "success" ? (
          <svg
            className="h-5 w-5 text-emerald-600 dark:text-emerald-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        ) : item.type === "error" ? (
          <svg
            className="h-5 w-5 text-rose-600 dark:text-rose-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        ) : item.type === "warning" ? (
          <svg
            className="h-5 w-5 text-amber-600 dark:text-amber-400"
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
        ) : (
          <svg
            className="h-5 w-5 text-blue-600 dark:text-blue-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold">{item.title}</p>
        {item.message ? (
          <p className="mt-0.5 text-xs opacity-90 leading-relaxed">
            {item.message}
          </p>
        ) : null}

        {item.action ? (
          <button
            type="button"
            onClick={() => {
              item.action?.onClick();
              onDismiss(item.id);
            }}
            className="mt-2 inline-flex items-center gap-1 rounded bg-zinc-900 px-2.5 py-1 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
          >
            {item.action.label}
          </button>
        ) : null}
      </div>

      {/* Dismiss Button */}
      <button
        type="button"
        onClick={() => onDismiss(item.id)}
        className="rounded p-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors"
        aria-label="Dismiss notification"
      >
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback((options: ToastOptions): string => {
    const id = generateToastId();
    const type = options.type ?? "info";
    const duration = options.duration ?? 5000;

    const item: ToastItem = {
      ...options,
      id,
      type,
      duration,
      createdAt: Date.now(),
    };

    setToasts((prev) => [item, ...prev.slice(0, 4)]);
    return id;
  }, []);

  const toastMethods = useMemo(() => {
    return createToastHelpers(showToast);
  }, [showToast]);

  const value = useMemo(
    () => ({
      showToast,
      dismissToast,
      toast: toastMethods,
    }),
    [showToast, dismissToast, toastMethods],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="fixed bottom-4 right-4 z-50 flex w-full max-w-sm flex-col gap-2.5 pointer-events-none px-4 sm:px-0"
        aria-label="Notifications"
      >
        {toasts.map((t) => (
          <ToastCard key={t.id} item={t} onDismiss={dismissToast} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    return {
      showToast: noop,
      dismissToast: () => {},
      toast: fallbackHelpers,
    };
  }
  return ctx;
}
