import { describe, it, expect } from 'vitest';
import { makeField, applyProvenanceWrite } from './provenance.js';

describe('provenance override rule (spec 7.2)', () => {
  it('OEM sync may overwrite an OEM-sourced field', () => {
    const current = makeField('02 1111 1111', 'oem');
    const { field, changed } = applyProvenanceWrite(current, {
      value: '02 2222 2222',
      source: 'oem',
      updatedBy: null,
    });
    expect(changed).toBe(true);
    expect(field.value).toBe('02 2222 2222');
    expect(field.source).toBe('oem');
    expect(field.locked).toBe(false);
  });

  it('AMS override locks the field', () => {
    const current = makeField('a@x.com', 'oem');
    const { field } = applyProvenanceWrite(current, {
      value: 'b@x.com',
      source: 'ams',
      updatedBy: 'u1',
    });
    expect(field.source).toBe('ams');
    expect(field.locked).toBe(true);
  });

  it('OEM sync MUST NOT clobber an AMS-locked field', () => {
    const locked = makeField('hours-ams', 'ams', { locked: true });
    const { field, changed } = applyProvenanceWrite(locked, {
      value: 'hours-oem',
      source: 'oem',
      updatedBy: null,
    });
    expect(changed).toBe(false);
    expect(field).toBe(locked); // unchanged identity → caller skips the write
    expect(field.value).toBe('hours-ams');
  });

  it('dealer edit writes a dealer source without locking', () => {
    const current = makeField('hours-oem', 'oem');
    const { field } = applyProvenanceWrite(current, {
      value: 'hours-dealer',
      source: 'dealer',
      updatedBy: 'd1',
    });
    expect(field.source).toBe('dealer');
    expect(field.locked).toBe(false);
  });

  it('AMS lock blocks subsequent OEM but AMS can still rewrite', () => {
    let f = makeField('x', 'ams', { locked: true });
    const oem = applyProvenanceWrite(f, { value: 'y', source: 'oem', updatedBy: null });
    expect(oem.field.value).toBe('x'); // blocked
    const ams = applyProvenanceWrite(f, { value: 'z', source: 'ams', updatedBy: 'u' });
    expect(ams.field.value).toBe('z'); // AMS may rewrite
  });
});
