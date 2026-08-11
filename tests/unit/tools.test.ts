import { describe, expect, it } from 'vitest';
import { calculate, formatNumber } from '../../src/shared/tools/calculator.js';
import { convert, findCategory, UNIT_CATEGORIES } from '../../src/shared/tools/units.js';
import { BANGS, findBang, resolveBang } from '../../src/shared/bangs.js';
import { resolveAddressInput } from '../../src/shared/address-input.js';

function value(input: string): number {
  const result = calculate(input);
  if (!result.ok) throw new Error(`expected a value, got: ${result.error}`);
  return result.value;
}

describe('calculator', () => {
  it('respects operator precedence', () => {
    expect(value('2 + 3 * 4')).toBe(14);
    expect(value('(2 + 3) * 4')).toBe(20);
  });

  it('handles unary signs', () => {
    expect(value('-5 + 2')).toBe(-3);
    expect(value('3 * -2')).toBe(-6);
    expect(value('-(4 - 6)')).toBe(2);
  });

  it('treats exponentiation as right-associative', () => {
    expect(value('2 ^ 3 ^ 2')).toBe(512);
  });

  it('accepts decimals, exponents, and pasted separators', () => {
    expect(value('1.5 * 2')).toBe(3);
    expect(value('1e3 + 1')).toBe(1001);
    expect(value('1,000 + 1')).toBe(1001);
    expect(value('6 × 7')).toBe(42);
    expect(value('84 ÷ 2')).toBe(42);
  });

  it('reports division by zero rather than returning Infinity', () => {
    expect(calculate('1 / 0')).toEqual({ ok: false, error: 'Division by zero' });
  });

  it('reports unbalanced brackets', () => {
    expect(calculate('(1 + 2').ok).toBe(false);
    expect(calculate('1 + 2)').ok).toBe(false);
  });

  it('never executes its input as code', () => {
    // The point of the hand-written parser: these are rejected, not evaluated.
    for (const attack of [
      'globalThis',
      'process.exit(1)',
      'alert(1)',
      'require("fs")',
      '(() => 1)()',
      'this.constructor',
    ]) {
      expect(calculate(attack).ok, attack).toBe(false);
    }
  });

  it('rejects a lone operator or empty input', () => {
    expect(calculate('').ok).toBe(false);
    expect(calculate('*').ok).toBe(false);
    expect(calculate('1 +').ok).toBe(false);
  });
});

describe('formatNumber', () => {
  it('keeps integers exact and trims float noise', () => {
    expect(formatNumber(42)).toBe('42');
    expect(formatNumber(0.1 + 0.2)).toBe('0.3');
  });
});

describe('unit conversion', () => {
  it('converts within a category', () => {
    expect(convert(1, 'length', 'km', 'm')).toBe(1000);
    expect(convert(1, 'length', 'mi', 'km')).toBeCloseTo(1.609344, 6);
    expect(convert(1, 'mass', 'lb', 'kg')).toBeCloseTo(0.45359237, 8);
  });

  it('handles temperature offsets, not just scale factors', () => {
    expect(convert(0, 'temperature', 'c', 'f')).toBe(32);
    expect(convert(212, 'temperature', 'f', 'c')).toBeCloseTo(100, 10);
    expect(convert(0, 'temperature', 'c', 'k')).toBeCloseTo(273.15, 10);
    expect(convert(-40, 'temperature', 'c', 'f')).toBeCloseTo(-40, 10);
  });

  it('distinguishes decimal and binary data units', () => {
    expect(convert(1, 'data', 'mb', 'b')).toBe(1e6);
    expect(convert(1, 'data', 'mib', 'b')).toBe(1_048_576);
  });

  it('round-trips every unit in every category', () => {
    for (const category of UNIT_CATEGORIES) {
      for (const from of category.units) {
        for (const to of category.units) {
          const there = convert(10, category.id, from.id, to.id);
          expect(there).not.toBeNull();
          const back = convert(there ?? 0, category.id, to.id, from.id);
          expect(back).toBeCloseTo(10, 6);
        }
      }
    }
  });

  it('refuses unknown units and categories', () => {
    expect(convert(1, 'length', 'parsec', 'm')).toBeNull();
    expect(convert(1, 'nonsense', 'a', 'b')).toBeNull();
  });

  it('falls back to the first category for an unknown id', () => {
    expect(findCategory('nonsense').id).toBe('length');
  });
});

describe('bang shortcuts', () => {
  it('resolves a bang with a query', () => {
    const match = resolveBang('!gh electron');
    expect(match?.bang.name).toBe('GitHub');
    expect(match?.url).toBe('https://github.com/search?q=electron');
  });

  it('sends a bare bang to the site itself', () => {
    expect(resolveBang('!yt')?.url).toBe('https://www.youtube.com/');
  });

  it('is case-insensitive', () => {
    expect(resolveBang('!GH react')?.bang.bang).toBe('gh');
  });

  it('percent-encodes the query', () => {
    expect(resolveBang('!w tim berners-lee')?.url).toContain('tim%20berners-lee');
  });

  it('ignores an unknown bang so it falls through to search', () => {
    expect(resolveBang('!nope hello')).toBeNull();
    expect(findBang('hello !gh')).toBeNull();
  });

  it('is wired into address resolution ahead of search', () => {
    const intent = resolveAddressInput('!gh electron', 'duckduckgo');
    expect(intent.kind).toBe('bang');
    if (intent.kind !== 'bang') return;
    expect(intent.url).toBe('https://github.com/search?q=electron');
  });

  it('every bang points at https', () => {
    for (const bang of BANGS) {
      expect(bang.home.startsWith('https://'), bang.bang).toBe(true);
      expect(bang.template.startsWith('https://'), bang.bang).toBe(true);
    }
  });
});
