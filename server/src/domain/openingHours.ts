import type { OpeningHours, Weekday } from '@dealer/shared';

const WEEKDAY_ORDER: Weekday[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

/**
 * Determine whether a location is open at the given instant, evaluated in the
 * location's own timezone (spec Section 7.2 — opening hours drive tow-acceptance).
 */
export function isOpenAt(hours: OpeningHours, instant: Date = new Date()): boolean {
  // Resolve local weekday + HH:MM in the location's timezone.
  const fmt = new Intl.DateTimeFormat('en-AU', {
    timeZone: hours.timezone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = fmt.formatToParts(instant);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';

  const weekdayShort = get('weekday').toLowerCase(); // e.g. "mon"
  const weekday = WEEKDAY_ORDER.find((d) => weekdayShort.startsWith(d));
  if (!weekday) return false;

  const day = hours.days[weekday];
  if (!day || day.open === null || day.close === null) return false;

  let hh = get('hour');
  if (hh === '24') hh = '00'; // some locales emit 24 for midnight
  const nowMin = Number(hh) * 60 + Number(get('minute'));
  const openMin = toMinutes(day.open);
  const closeMin = toMinutes(day.close);

  return nowMin >= openMin && nowMin < closeMin;
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}
