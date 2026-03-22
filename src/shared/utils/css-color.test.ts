import { describe, expect, it } from 'vitest';
import {
  hexToRgb,
  parseCssColorToRgba,
  rgbaComponentsToCss,
  rgbToHex,
} from './css-color';

describe('parseCssColorToRgba', () => {
  it('parses rgba with alpha', () => {
    expect(parseCssColorToRgba('rgba(0, 0, 0, 0.55)', { r: 0, g: 0, b: 0, a: 0 })).toEqual({
      r: 0,
      g: 0,
      b: 0,
      a: 0.55,
    });
  });

  it('parses hex as opaque', () => {
    expect(parseCssColorToRgba('#ff0000', { r: 0, g: 0, b: 0, a: 0 })).toEqual({
      r: 255,
      g: 0,
      b: 0,
      a: 1,
    });
  });

  it('round-trips through rgbaComponentsToCss', () => {
    const c = { r: 10, g: 20, b: 30, a: 0.25 };
    expect(parseCssColorToRgba(rgbaComponentsToCss(c), { r: 0, g: 0, b: 0, a: 0 })).toEqual({
      r: 10,
      g: 20,
      b: 30,
      a: 0.25,
    });
  });
});

describe('hexToRgb / rgbToHex', () => {
  it('round-trips', () => {
    const { r, g, b } = hexToRgb('#aabbcc')!;
    expect(rgbToHex(r, g, b)).toBe('#aabbcc');
  });
});
