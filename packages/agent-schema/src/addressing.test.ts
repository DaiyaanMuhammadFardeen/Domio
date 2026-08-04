import { describe, it, expect } from 'vitest';
import { parseAddress, addressToString, AddressParseError } from './addressing.js';

describe('parseAddress', () => {
  it('parses slide by position', () => {
    const a = parseAddress('slide[3]');
    expect(a.kind).toBe('slide');
    expect(a.indexOrId).toBe('3');
  });

  it('parses slide by id', () => {
    const a = parseAddress('slide[hero_intro]');
    expect(a.kind).toBe('slide');
    expect(a.indexOrId).toBe('hero_intro');
  });

  it('parses nested paths (slide.hotspot)', () => {
    const a = parseAddress('slide[3].hotspot[cta_pricing]');
    expect(a.kind).toBe('hotspot');
    expect(a.indexOrId).toBe('cta_pricing');
    expect(a.parent).toBeDefined();
    expect(a.parent?.kind).toBe('slide');
    expect(a.parent?.indexOrId).toBe('3');
  });

  it('parses variable by id', () => {
    const a = parseAddress('variable[revenue]');
    expect(a.kind).toBe('variable');
    expect(a.indexOrId).toBe('revenue');
  });

  it('parses calculator and rule', () => {
    const c = parseAddress('calculator[loan_amort]');
    expect(c.kind).toBe('calculator');
    const r = parseAddress('rule[show_pricing]');
    expect(r.kind).toBe('rule');
  });

  it('parses device-frame and quiz', () => {
    const d = parseAddress('device-frame[iphone_15]');
    expect(d.kind).toBe('device-frame');
    const q = parseAddress('quiz[onboarding]');
    expect(q.kind).toBe('quiz');
  });

  it('throws on missing index', () => {
    expect(() => parseAddress('slide[]')).toThrow(AddressParseError);
  });

  it('throws on malformed (no brackets)', () => {
    expect(() => parseAddress('slide-3')).toThrow(AddressParseError);
  });

  it('throws on unknown kind', () => {
    expect(() => parseAddress('banana[1]')).toThrow(AddressParseError);
  });

  it('trims leading and trailing whitespace', () => {
    const a = parseAddress('   slide[7]   ');
    expect(a.kind).toBe('slide');
    expect(a.indexOrId).toBe('7');
  });

  it('throws on empty string', () => {
    expect(() => parseAddress('')).toThrow(AddressParseError);
    expect(() => parseAddress('   ')).toThrow(AddressParseError);
  });

  it('roundtrips through addressToString', () => {
    const a = parseAddress('slide[3].hotspot[cta_pricing]');
    expect(addressToString(a)).toBe('slide[3].hotspot[cta_pricing]');
  });
});
