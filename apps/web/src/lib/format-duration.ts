/** Format a duration in seconds as `m:ss` or `h:mm:ss`. */
export function formatDurationSeconds(seconds: number): string {
  const total = Math.max(0, Math.round(Number(seconds)));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const mmss = `${minutes}:${String(secs).padStart(2, "0")}`;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }
  return mmss;
}
