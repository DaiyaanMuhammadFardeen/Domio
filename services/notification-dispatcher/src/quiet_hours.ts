/**
 * Notification dispatcher — DND / quiet-hours digests.
 *
 * Checks whether a notification should be deferred to a morning
 * digest based on the user's quiet-hours schedule. Quiet hours
 * are defined by a start/end time in a given timezone; if the
 * current time falls within the window, the notification is
 * added to a digest batch instead of being sent immediately.
 *
 * Overnight windows (start > end) cross midnight — e.g.
 * start=22:00, end=07:00 means 10 PM to 7 AM.
 *
 * All timezone logic is injected via an `offsetMinutes` helper
 * so the module stays pure and testable without clock mocking.
 */

// ─── Types ──────────────────────────────────────────────────────

export interface QuietHours {
  /** Start hour in 24h format (0–23). */
  start: number;
  /** End hour in 24h format (0–23). */
  end: number;
  /** IANA timezone identifier (e.g. "America/New_York"). */
  tz: string;
}

export interface DigestItem {
  /** Notification title. */
  title: string;
  /** Human-readable summary body. */
  body: string;
  /** Deep link to the notification target. */
  link?: string | undefined;
  /** Timestamp when the notification was generated (epoch ms). */
  ts_ms: number;
}

export interface DigestPayload {
  /** Aggregated notification count. */
  count: number;
  /** Digest title. */
  title: string;
  /** Formatted body with all items. */
  body: string;
  /** Deep link to the digest view. */
  link?: string | undefined;
}

// ─── Timezone offset helper ─────────────────────────────────────

/**
 * offsetMinutes returns the UTC offset in minutes for a given
 * IANA timezone at a specific point in time.
 *
 * Default implementation uses Intl.DateTimeFormat; the caller
 * can inject a custom function for deterministic testing.
 */
export function defaultOffsetMinutes(now: Date, _tz: string): number {
  // Use Intl to get the UTC offset for the timezone.
  // Format: "UTC+HH:MM" or "UTC-HH:MM"
  const str = new Intl.DateTimeFormat('en-US', {
    timeZone: _tz,
    timeZoneName: 'shortOffset',
  }).formatToParts(now);

  const tzPart = str.find((p) => p.type === 'timeZoneName');
  if (!tzPart) return 0;

  const val = tzPart.value; // e.g. "GMT", "GMT+5", "GMT-8"
  const m = val.match(/GMT([+-]\d{1,2}(?::\d{2})?)?$/);
  if (!m || !m[1]) return 0;

  const parts = m[1].split(':');
  const hours = parseInt(parts[0]!, 10);
  const mins = parts.length > 1 ? parseInt(parts[1]!, 10) : 0;
  return hours * 60 + (hours >= 0 ? mins : -mins);
}

// ─── Core logic ─────────────────────────────────────────────────

/**
 * isQuietHour determines whether the given `now` moment falls
 * within the quiet-hours window for the user's timezone.
 *
 * @param quietHours  - The user's quiet-hours configuration.
 * @param now         - Current time (epoch ms).
 * @param tzData      - Optional { offsetMinutes } override for testing.
 * @returns true if the current local hour is within the quiet window.
 */
export function isQuietHour(
  quietHours: QuietHours,
  now: number,
  tzData?: { offsetMinutes: (now: Date, tz: string) => number },
): boolean {
  const offsetFn = tzData?.offsetMinutes ?? defaultOffsetMinutes;
  const localMs = now + offsetFn(new Date(now), quietHours.tz) * 60_000;
  const localHour = new Date(localMs).getUTCHours();

  const { start, end } = quietHours;

  if (start === end) {
    // Empty window — never quiet.
    return false;
  }

  if (start < end) {
    // Same-day window: e.g. 09:00 → 17:00
    return localHour >= start && localHour < end;
  }

  // Overnight window: e.g. 22:00 → 07:00 (crosses midnight)
  return localHour >= start || localHour < end;
}

/**
 * buildDigest aggregates a batch of deferred notifications into
 * a single morning-digest payload.
 */
export function buildDigest(items: DigestItem[]): DigestPayload {
  if (items.length === 0) {
    return { count: 0, title: 'Morning digest', body: 'No new notifications.' };
  }

  const lines = items.map((item, i) => {
    const num = i + 1;
    const linkPart = item.link ? ` — [View](${item.link})` : '';
    return `${num}. **${item.title}**: ${item.body}${linkPart}`;
  });

  return {
    count: items.length,
    title: `Morning digest — ${items.length} notification${items.length === 1 ? '' : 's'}`,
    body: lines.join('\n'),
    link: '/notifications/digest',
  };
}
