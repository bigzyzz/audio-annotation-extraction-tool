/**
 * Presence and ephemeral signal throttling utilities for Requirement R7.
 */

export interface CollaboratorPresence {
  userId: string;
  username: string;
  color: {
    bg: string;
    text: string;
    border: string;
    ring: string;
    hex: string;
  };
  joinedAt: number;
  lastActiveAt: number;
  playheadSeconds: number | null;
}

export interface PlayheadBroadcastPayload {
  userId: string;
  username: string;
  playheadSeconds: number;
  timestamp: number;
}

export const COLLABORATOR_PALETTE = [
  {
    bg: "bg-indigo-100 dark:bg-indigo-950/70",
    text: "text-indigo-700 dark:text-indigo-300",
    border: "border-indigo-300 dark:border-indigo-700",
    ring: "ring-indigo-400",
    hex: "#6366f1",
  },
  {
    bg: "bg-emerald-100 dark:bg-emerald-950/70",
    text: "text-emerald-700 dark:text-emerald-300",
    border: "border-emerald-300 dark:border-emerald-700",
    ring: "ring-emerald-400",
    hex: "#10b981",
  },
  {
    bg: "bg-amber-100 dark:bg-amber-950/70",
    text: "text-amber-800 dark:text-amber-300",
    border: "border-amber-300 dark:border-amber-700",
    ring: "ring-amber-400",
    hex: "#f59e0b",
  },
  {
    bg: "bg-rose-100 dark:bg-rose-950/70",
    text: "text-rose-700 dark:text-rose-300",
    border: "border-rose-300 dark:border-rose-700",
    ring: "ring-rose-400",
    hex: "#f43f5e",
  },
  {
    bg: "bg-violet-100 dark:bg-violet-950/70",
    text: "text-violet-700 dark:text-violet-300",
    border: "border-violet-300 dark:border-violet-700",
    ring: "ring-violet-400",
    hex: "#8b5cf6",
  },
  {
    bg: "bg-cyan-100 dark:bg-cyan-950/70",
    text: "text-cyan-700 dark:text-cyan-300",
    border: "border-cyan-300 dark:border-cyan-700",
    ring: "ring-cyan-400",
    hex: "#06b6d4",
  },
  {
    bg: "bg-orange-100 dark:bg-orange-950/70",
    text: "text-orange-800 dark:text-orange-300",
    border: "border-orange-300 dark:border-orange-700",
    ring: "ring-orange-400",
    hex: "#f97316",
  },
];

/**
 * Deterministically pick an accessible color scheme for a collaborator based on user ID or name.
 */
export function getCollaboratorColor(userIdOrName: string) {
  let hash = 0;
  for (let i = 0; i < userIdOrName.length; i++) {
    hash = (hash << 5) - hash + userIdOrName.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % COLLABORATOR_PALETTE.length;
  return COLLABORATOR_PALETTE[index]!;
}

/**
 * Get 1-2 character initials for user avatar display.
 */
export function getCollaboratorInitials(username: string): string {
  const cleaned = username.trim().replace(/^@/, "");
  if (!cleaned) return "??";

  const parts = cleaned.split(/[\s._-]+/).filter(Boolean);
  if (parts.length >= 2) {
    const first = parts[0]?.[0] ?? "";
    const second = parts[1]?.[0] ?? "";
    return `${first}${second}`.toUpperCase();
  }

  return cleaned.slice(0, 2).toUpperCase();
}

/**
 * Parses raw Supabase channel.presenceState() dictionary into typed, deduplicated list.
 */
export function parsePresenceState(
  presenceState: Record<string, unknown[]>,
  currentUserId?: string,
): CollaboratorPresence[] {
  const collaboratorsMap = new Map<string, CollaboratorPresence>();

  for (const [key, presences] of Object.entries(presenceState)) {
    for (const raw of presences) {
      if (!raw || typeof raw !== "object") continue;
      const entry = raw as Record<string, unknown>;

      const userId =
        typeof entry.userId === "string"
          ? entry.userId
          : typeof entry.id === "string"
            ? entry.id
            : key;

      const rawUsername =
        typeof entry.username === "string"
          ? entry.username
          : typeof entry.name === "string"
            ? entry.name
            : "Collaborator";

      const joinedAt =
        typeof entry.joinedAt === "number" && Number.isFinite(entry.joinedAt)
          ? entry.joinedAt
          : Date.now();

      const lastActiveAt =
        typeof entry.lastActiveAt === "number" && Number.isFinite(entry.lastActiveAt)
          ? entry.lastActiveAt
          : joinedAt;

      const playhead =
        typeof entry.playheadSeconds === "number" && Number.isFinite(entry.playheadSeconds)
          ? entry.playheadSeconds
          : null;

      // Keep newest activity if duplicate entry exists
      const existing = collaboratorsMap.get(userId);
      if (!existing || lastActiveAt >= existing.lastActiveAt) {
        collaboratorsMap.set(userId, {
          userId,
          username: rawUsername,
          color: getCollaboratorColor(userId),
          joinedAt: existing?.joinedAt ?? joinedAt,
          lastActiveAt,
          playheadSeconds: playhead,
        });
      }
    }
  }

  const list = Array.from(collaboratorsMap.values());

  // Sort: current user first, then by joinedAt ascending
  list.sort((a, b) => {
    if (currentUserId) {
      if (a.userId === currentUserId) return -1;
      if (b.userId === currentUserId) return 1;
    }
    return a.joinedAt - b.joinedAt;
  });

  return list;
}

export interface Throttler<T> {
  invoke: (value: T) => void;
  cancel: () => void;
  flush: () => void;
}

/**
 * Creates a rate-limiting throttler that enforces a maximum invocation frequency of once per waitMs.
 * Features trailing edge guarantee: the most recent value passed during a throttle window
 * is guaranteed to be invoked once the window expires.
 */
export function createThrottler<T>(
  callback: (value: T) => void,
  waitMs = 100,
): Throttler<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let lastExecutedTime = 0;
  let latestValue: T | undefined;
  let hasPendingValue = false;

  const invoke = (value: T) => {
    latestValue = value;
    hasPendingValue = true;
    const now = Date.now();
    const remainingTime = waitMs - (now - lastExecutedTime);

    if (remainingTime <= 0 || remainingTime > waitMs) {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      lastExecutedTime = now;
      hasPendingValue = false;
      callback(value);
    } else if (!timeoutId) {
      timeoutId = setTimeout(() => {
        lastExecutedTime = Date.now();
        timeoutId = null;
        if (hasPendingValue && latestValue !== undefined) {
          hasPendingValue = false;
          callback(latestValue);
        }
      }, remainingTime);
    }
  };

  const cancel = () => {
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
    hasPendingValue = false;
    latestValue = undefined;
  };

  const flush = () => {
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
    if (hasPendingValue && latestValue !== undefined) {
      lastExecutedTime = Date.now();
      hasPendingValue = false;
      callback(latestValue);
    }
  };

  return { invoke, cancel, flush };
}
