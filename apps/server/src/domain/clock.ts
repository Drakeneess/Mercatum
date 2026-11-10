/** Mercatum always uses UTC−06:00, regardless of the explorer's timezone.
 * Etc/GMT+6 uses POSIX-inverted signs. */
export function mercatumClock(date: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Etc/GMT+6",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}
