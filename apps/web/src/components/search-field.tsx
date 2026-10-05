"use client";

import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
} from "react";

export const DEFAULT_SEARCH_DEBOUNCE_MS = 250;

export type SearchFieldProps = {
  /**
   * Callback invoked with the search query. Debounced by ~250ms during typing,
   * or called immediately (0ms) upon clear.
   */
  onSearch: (query: string) => void;
  /**
   * Optional initial text for the search field.
   */
  defaultValue?: string;
  /**
   * Placeholder text shown when input is empty. Defaults to "Search tracks by name…".
   */
  placeholder?: string;
  /**
   * Indicates whether an asynchronous search request is currently pending in the parent.
   */
  isPending?: boolean;
  /**
   * Disables user input.
   */
  disabled?: boolean;
  /**
   * Debounce delay in milliseconds. Defaults to 250ms.
   */
  debounceMs?: number;
  /**
   * Custom id for the input element.
   */
  id?: string;
  /**
   * Custom CSS class name for the wrapper.
   */
  className?: string;
};

export function SearchField({
  onSearch,
  defaultValue = "",
  placeholder = "Search tracks by name…",
  isPending = false,
  disabled = false,
  debounceMs = DEFAULT_SEARCH_DEBOUNCE_MS,
  id = "audio-search-input",
  className = "",
}: SearchFieldProps) {
  const [prevDefault, setPrevDefault] = useState(defaultValue);
  const [value, setValue] = useState(defaultValue);
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  if (prevDefault !== defaultValue) {
    setPrevDefault(defaultValue);
    setValue(defaultValue);
  }

  // Clean up any pending timer when unmounting
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  function triggerSearch(query: string, delay: number) {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    if (delay <= 0) {
      onSearch(query);
      return;
    }

    timerRef.current = setTimeout(() => {
      onSearch(query);
    }, delay);
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const next = event.target.value;
    setValue(next);
    triggerSearch(next, debounceMs);
  }

  function handleClear() {
    setValue("");
    triggerSearch("", 0);
    inputRef.current?.focus();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape" && value.length > 0) {
      event.preventDefault();
      handleClear();
    }
  }

  const isDisabled = disabled || isPending;
  const showClear = value.length > 0 && !isDisabled;

  return (
    <div className={`relative flex w-full items-center ${className}`}>
      <label htmlFor={id} className="sr-only">
        {placeholder}
      </label>

      {/* Leading search magnifying glass icon */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute left-3 flex items-center text-zinc-400 dark:text-zinc-500"
      >
        <svg
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
      </span>

      <input
        ref={inputRef}
        id={id}
        type="search"
        role="searchbox"
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={isDisabled}
        aria-busy={isPending}
        className="w-full rounded-md border border-zinc-300 bg-white py-2 pl-9 pr-16 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-zinc-400 dark:focus:ring-zinc-400 [&::-webkit-search-cancel-button]:hidden [&::-webkit-search-decoration]:hidden"
      />

      {/* Trailing action icons (Clear button and/or Pending spinner) */}
      <div className="absolute right-3 flex items-center gap-1.5">
        {isPending && (
          <span
            role="status"
            aria-label="Searching audio files"
            className="flex items-center text-zinc-400 dark:text-zinc-500"
          >
            <svg
              className="h-4 w-4 animate-spin"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8v8H4z"
              />
            </svg>
          </span>
        )}

        {showClear && (
          <button
            type="button"
            onClick={handleClear}
            aria-label="Clear search"
            className="rounded p-0.5 text-zinc-400 transition-colors hover:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-zinc-400 dark:text-zinc-500 dark:hover:text-zinc-300 dark:focus:ring-zinc-600"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
