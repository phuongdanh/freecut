export interface RgbaComponents {
  r: number;
  g: number;
  b: number;
  /** 0–1 */
  a: number;
}

const FALLBACK_TRANSPARENT: RgbaComponents = { r: 0, g: 0, b: 0, a: 0 };

function clamp255(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

/**
 * Parse hex #rrggbb to RGB (6-digit only).
 */
export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const h = hex.trim();
  if (/^#[0-9A-Fa-f]{6}$/.test(h)) {
    return {
      r: parseInt(h.slice(1, 3), 16),
      g: parseInt(h.slice(3, 5), 16),
      b: parseInt(h.slice(5, 7), 16),
    };
  }
  if (/^#[0-9A-Fa-f]{3}$/.test(h)) {
    return {
      r: parseInt(h.slice(1, 2).repeat(2), 16),
      g: parseInt(h.slice(2, 3).repeat(2), 16),
      b: parseInt(h.slice(3, 4).repeat(2), 16),
    };
  }
  return null;
}

export function rgbToHex(r: number, g: number, b: number): string {
  return `#${clamp255(r).toString(16).padStart(2, '0')}${clamp255(g).toString(16).padStart(2, '0')}${clamp255(b).toString(16).padStart(2, '0')}`;
}

/**
 * Parse any CSS color to RGBA components. Alpha defaults to 1 for #hex and rgb().
 * Undefined / empty → transparent (a = 0).
 */
export function parseCssColorToRgba(input: string | undefined, fallback: RgbaComponents = FALLBACK_TRANSPARENT): RgbaComponents {
  if (!input?.trim()) return { ...fallback };

  const c = input.trim();
  const hex = hexToRgb(c);
  if (hex) {
    return { ...hex, a: 1 };
  }

  const rgba = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)/i.exec(c);
  if (rgba) {
    const r = clamp255(Number(rgba[1]));
    const g = clamp255(Number(rgba[2]));
    const b = clamp255(Number(rgba[3]));
    const a = rgba[4] !== undefined && rgba[4] !== '' ? clamp01(Number(rgba[4])) : 1;
    return { r, g, b, a };
  }

  if (typeof document !== 'undefined') {
    const ctx = document.createElement('canvas').getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#000000';
      ctx.fillStyle = c;
      const parsed = ctx.fillStyle as string;
      const m = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)/.exec(parsed);
      if (m) {
        return {
          r: clamp255(Number(m[1])),
          g: clamp255(Number(m[2])),
          b: clamp255(Number(m[3])),
          a: m[4] !== undefined ? clamp01(Number(m[4])) : 1,
        };
      }
      const h2 = hexToRgb(parsed);
      if (h2) return { ...h2, a: 1 };
    }
  }

  return { ...fallback };
}

/** Serialize to rgba() for timeline text backgroundColor. */
export function rgbaComponentsToCss({ r, g, b, a }: RgbaComponents): string {
  const alpha = Math.round(a * 1000) / 1000;
  return `rgba(${clamp255(r)}, ${clamp255(g)}, ${clamp255(b)}, ${alpha})`;
}
