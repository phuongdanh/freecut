import type { TimelineItem } from '@/types/timeline';

/**
 * Multi-select of timeline clips is restricted to one track and one item `type`
 * (e.g. multiple text captions on the same track). When marquee spans mixed
 * groups, keep only the largest matching group.
 */
export function filterIdsToLargestHomogeneousGroup(
  items: TimelineItem[],
  ids: string[]
): string[] {
  if (ids.length <= 1) return ids;

  const resolved = ids
    .map((id) => items.find((i) => i.id === id))
    .filter((i): i is TimelineItem => i !== undefined);

  if (resolved.length === 0) return [];

  const groups = new Map<string, TimelineItem[]>();
  for (const it of resolved) {
    const key = `${it.trackId}\0${it.type}`;
    const arr = groups.get(key) ?? [];
    arr.push(it);
    groups.set(key, arr);
  }

  let best: TimelineItem[] = [];
  for (const g of groups.values()) {
    if (g.length > best.length) best = g;
  }

  return best.map((i) => i.id);
}

/** Shift+click range: same track, same discriminated `type`, ordered by `from`. */
export function getSameTrackSameTypeRangeIds(
  allItems: TimelineItem[],
  anchorId: string,
  endId: string
): string[] | null {
  const anchor = allItems.find((i) => i.id === anchorId);
  const end = allItems.find((i) => i.id === endId);
  if (!anchor || !end) return null;
  if (anchor.trackId !== end.trackId || anchor.type !== end.type) return null;

  const same = allItems
    .filter((i) => i.trackId === anchor.trackId && i.type === anchor.type)
    .sort((a, b) => a.from - b.from);

  const ia = same.findIndex((i) => i.id === anchorId);
  const ib = same.findIndex((i) => i.id === endId);
  if (ia === -1 || ib === -1) return null;

  const lo = Math.min(ia, ib);
  const hi = Math.max(ia, ib);
  return same.slice(lo, hi + 1).map((i) => i.id);
}
