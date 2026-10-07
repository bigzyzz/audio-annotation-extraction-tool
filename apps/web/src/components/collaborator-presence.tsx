"use client";

import { useId } from "react";
import {
  type CollaboratorPresence,
  getCollaboratorInitials,
} from "@/lib/presence";
import { formatDurationSeconds } from "@/lib/format-duration";

export interface CollaboratorPresenceProps {
  collaborators: CollaboratorPresence[];
  currentUserId?: string | null;
  className?: string;
}

export function CollaboratorPresenceBadge({
  collaborators,
  currentUserId,
  className = "",
}: CollaboratorPresenceProps) {
  const componentId = useId();
  const count = collaborators.length;

  const summaryText =
    count <= 1
      ? "Just you active"
      : `${count} annotators active`;

  return (
    <div
      className={`inline-flex flex-wrap items-center gap-2.5 rounded-full border border-zinc-200 bg-white/90 px-3 py-1 shadow-sm backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-900/90 ${className}`}
      role="status"
      aria-live="polite"
      aria-label="Active collaborators in this session"
    >
      {/* Live Pulsing Indicator */}
      <div className="flex items-center gap-1.5" title="Connected to Realtime broadcast">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
        </span>
        <span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">
          {summaryText}
        </span>
      </div>

      {/* Collaborator Avatar Stack */}
      {count > 0 && (
        <div className="flex -space-x-1.5 overflow-hidden py-0.5">
          {collaborators.slice(0, 5).map((collab) => {
            const isSelf = Boolean(currentUserId && collab.userId === currentUserId);
            const initials = getCollaboratorInitials(collab.username);
            const playheadText =
              collab.playheadSeconds != null
                ? ` (at ${formatDurationSeconds(collab.playheadSeconds)})`
                : "";
            const title = `${collab.username}${isSelf ? " (You)" : ""}${playheadText}`;

            return (
              <div
                key={`${componentId}-${collab.userId}`}
                className={`group relative flex h-6 w-6 items-center justify-center rounded-full border-2 border-white text-[10px] font-bold shadow-sm transition-transform hover:z-20 hover:scale-110 dark:border-zinc-900 ${collab.color.bg} ${collab.color.text}`}
                title={title}
                tabIndex={0}
                aria-label={title}
              >
                <span>{initials}</span>

                {/* Hover Popover Tooltip */}
                <div className="pointer-events-none absolute bottom-full mb-1.5 hidden flex-col items-center group-hover:flex group-focus:flex">
                  <div className="whitespace-nowrap rounded bg-zinc-900 px-2 py-1 text-[11px] font-medium text-white shadow-lg dark:bg-zinc-100 dark:text-zinc-900">
                    <span className="font-semibold">{collab.username}</span>
                    {isSelf && <span className="ml-1 opacity-75">(You)</span>}
                    {collab.playheadSeconds != null && (
                      <span className="ml-1.5 text-zinc-300 dark:text-zinc-600">
                        ⏱ {formatDurationSeconds(collab.playheadSeconds)}
                      </span>
                    )}
                  </div>
                  <div className="h-1 w-2 -translate-y-0.5 border-4 border-transparent border-t-zinc-900 dark:border-t-zinc-100" />
                </div>
              </div>
            );
          })}

          {count > 5 && (
            <div
              className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-zinc-100 text-[10px] font-medium text-zinc-600 dark:border-zinc-900 dark:bg-zinc-800 dark:text-zinc-300"
              title={`${count - 5} additional collaborators active`}
            >
              +{count - 5}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
