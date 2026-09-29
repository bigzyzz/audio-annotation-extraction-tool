"use client";

import { useState, useTransition } from "react";
import { DEMO_PERSONAS, type DemoPersona } from "@/lib/demo-accounts";
import { loginAsDemoUser } from "@/app/login/actions";

type DemoAuthPanelProps = {
  /**
   * Optional callback to populate the parent form inputs without submitting immediately.
   */
  onFillCredentials?: (email: string, password: string) => void;
};

export function DemoAuthPanel({ onFillCredentials }: DemoAuthPanelProps) {
  const [isPending, startTransition] = useTransition();
  const [activePersona, setActivePersona] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const personas = [DEMO_PERSONAS.alice, DEMO_PERSONAS.bob];

  function handleQuickLogin(persona: DemoPersona) {
    setError(null);
    setActivePersona(persona.id);
    startTransition(async () => {
      const result = await loginAsDemoUser(persona.id);
      if (result?.error) {
        setError(result.error);
        setActivePersona(null);
      }
    });
  }

  return (
    <div className="mt-6 flex flex-col gap-3 rounded-lg border border-dashed border-zinc-300 bg-zinc-50/75 p-4 dark:border-zinc-700 dark:bg-zinc-900/50">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
            Demo Quick-Access
          </span>
          <span className="rounded bg-zinc-200 px-1.5 py-0.5 text-[10px] font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
            1-Click Login
          </span>
        </div>
      </div>

      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        Pre-configured accounts for testing multi-user collaboration without typing credentials.
      </p>

      {error && (
        <p
          role="alert"
          className="rounded bg-red-50 p-2 text-xs text-red-700 dark:bg-red-950 dark:text-red-300"
        >
          {error}
        </p>
      )}

      <div className="flex flex-col gap-2">
        {personas.map((persona) => {
          const isCurrentActive = isPending && activePersona === persona.id;

          return (
            <div
              key={persona.id}
              className="flex items-center justify-between rounded-md border border-zinc-200 bg-white p-2.5 shadow-xs transition-colors hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700"
            >
              <div className="flex flex-col">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-medium text-black dark:text-zinc-50">
                    {persona.name}
                  </span>
                  <span className="rounded bg-zinc-100 px-1.5 py-0.2 text-[10px] font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                    {persona.role}
                  </span>
                </div>
                <span className="text-xs text-zinc-500 dark:text-zinc-400">
                  @{persona.username}
                </span>
              </div>

              <div className="flex items-center gap-2">
                {onFillCredentials && (
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() =>
                      onFillCredentials(persona.email, persona.password)
                    }
                    className="text-xs text-zinc-500 underline-offset-2 hover:text-black hover:underline disabled:opacity-50 dark:text-zinc-400 dark:hover:text-zinc-200"
                  >
                    Fill form
                  </button>
                )}

                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => handleQuickLogin(persona)}
                  className="flex items-center gap-1.5 rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
                >
                  {isCurrentActive && (
                    <svg
                      className="h-3 w-3 animate-spin"
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
                  )}
                  <span>{isCurrentActive ? "Signing in…" : "Log in"}</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
