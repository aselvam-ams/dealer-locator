import { describe, it, expect } from 'vitest';
import type { OpeningHours } from '@dealer/shared';
import { isOpenAt } from './openingHours.js';

const hours: OpeningHours = {
  timezone: 'Australia/Sydney',
  days: {
    mon: { open: '08:00', close: '17:30' },
    tue: { open: '08:00', close: '17:30' },
    wed: { open: '08:00', close: '17:30' },
    thu: { open: '08:00', close: '17:30' },
    fri: { open: '08:00', close: '17:30' },
    sat: { open: '09:00', close: '13:00' },
    sun: { open: null, close: null },
  },
};

describe('isOpenAt', () => {
  it('open during weekday business hours', () => {
    // 2026-06-15 is a Monday. 10:00 Sydney time.
    expect(isOpenAt(hours, new Date('2026-06-15T10:00:00+10:00'))).toBe(true);
  });

  it('closed before opening', () => {
    expect(isOpenAt(hours, new Date('2026-06-15T06:00:00+10:00'))).toBe(false);
  });

  it('closed after closing', () => {
    expect(isOpenAt(hours, new Date('2026-06-15T18:00:00+10:00'))).toBe(false);
  });

  it('closed on Sunday', () => {
    // 2026-06-14 is a Sunday.
    expect(isOpenAt(hours, new Date('2026-06-14T10:00:00+10:00'))).toBe(false);
  });

  it('open Saturday morning, closed Saturday afternoon', () => {
    expect(isOpenAt(hours, new Date('2026-06-13T10:00:00+10:00'))).toBe(true);
    expect(isOpenAt(hours, new Date('2026-06-13T15:00:00+10:00'))).toBe(false);
  });
});
