import { describe, expect, it } from 'vitest';
import type { TextItem, VideoItem } from '@/types/timeline';
import {
  filterIdsToLargestHomogeneousGroup,
  getSameTrackSameTypeRangeIds,
} from './item-selection-utils';

const video = (id: string, trackId: string, from: number): VideoItem => ({
  id,
  type: 'video',
  trackId,
  from,
  durationInFrames: 30,
  label: 'v',
  src: '',
});

const text = (id: string, trackId: string, from: number): TextItem => ({
  id,
  type: 'text',
  trackId,
  from,
  durationInFrames: 30,
  label: 't',
  text: 'x',
  color: '#fff',
});

describe('filterIdsToLargestHomogeneousGroup', () => {
  it('keeps one track+type group when marquee spans mixed clips', () => {
    const items = [video('v', 't1', 0), text('a', 't1', 30), text('b', 't1', 60)];
    expect(filterIdsToLargestHomogeneousGroup(items, ['v', 'a', 'b'])).toEqual(['a', 'b']);
  });
});

describe('getSameTrackSameTypeRangeIds', () => {
  const items = [
    text('a', 't1', 0),
    text('b', 't1', 30),
    text('c', 't1', 60),
    video('v', 't1', 90),
  ];

  it('returns inclusive text range on one track', () => {
    expect(getSameTrackSameTypeRangeIds(items, 'a', 'c')).toEqual(['a', 'b', 'c']);
    expect(getSameTrackSameTypeRangeIds(items, 'c', 'a')).toEqual(['a', 'b', 'c']);
  });

  it('returns null for different tracks or types', () => {
    expect(getSameTrackSameTypeRangeIds(items, 'a', 'v')).toBe(null);
    const cross = [...items, text('x', 't2', 0)];
    expect(getSameTrackSameTypeRangeIds(cross, 'a', 'x')).toBe(null);
  });
});
