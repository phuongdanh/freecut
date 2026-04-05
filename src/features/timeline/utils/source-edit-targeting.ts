import type { TimelineTrack } from '@/types/timeline';
import {
  createClassicTrack,
  getAdjacentTrackOrder,
  getTrackKind,
  renameTrackForKind,
  type TrackKind,
} from './classic-tracks';

interface EnsureTrackForKindParams {
  tracks: TimelineTrack[];
  targetTrack: TimelineTrack;
  kind: TrackKind;
  directionWhenCreating: 'above' | 'below';
  preferredTrackHeight: number;
  preferTarget?: boolean;
}

export interface SourceEditTrackTargets {
  tracks: TimelineTrack[];
  videoTrackId?: string;
  audioTrackId?: string;
}

function findNearestUnlockedTrackByKind(
  tracks: TimelineTrack[],
  targetTrack: TimelineTrack,
  kind: TrackKind,
  direction: 'above' | 'below'
): TimelineTrack | null {
  const candidates = tracks
    .filter((track) => !track.locked && getTrackKind(track) === kind)
    .filter((track) => direction === 'above'
      ? track.order < targetTrack.order
      : track.order > targetTrack.order)
    .sort((a, b) => direction === 'above' ? b.order - a.order : a.order - b.order);

  return candidates[0] ?? null;
}

function ensureTrackForKind(params: EnsureTrackForKindParams): { tracks: TimelineTrack[]; trackId: string } {
  const {
    tracks,
    targetTrack,
    kind,
    directionWhenCreating,
    preferredTrackHeight,
    preferTarget = false,
  } = params;
  const targetKind = getTrackKind(targetTrack);

  if (preferTarget || targetKind === kind || targetKind === null) {
    const upgradedTrack = renameTrackForKind(targetTrack, tracks, kind);
    if (upgradedTrack === targetTrack) {
      return { tracks, trackId: targetTrack.id };
    }

    return {
      tracks: tracks.map((track) => track.id === targetTrack.id ? upgradedTrack : track),
      trackId: targetTrack.id,
    };
  }

  const existingTrack = findNearestUnlockedTrackByKind(tracks, targetTrack, kind, directionWhenCreating);
  if (existingTrack) {
    return { tracks, trackId: existingTrack.id };
  }

  const createdTrack = createClassicTrack({
    tracks,
    kind,
    order: getAdjacentTrackOrder(tracks, targetTrack, directionWhenCreating),
    height: preferredTrackHeight,
  });

  return {
    tracks: [...tracks, createdTrack],
    trackId: createdTrack.id,
  };
}

export function resolveSourceEditTrackTargets(params: {
  tracks: TimelineTrack[];
  activeTrackId: string;
  mediaType: 'video' | 'audio' | 'image';
  hasAudio: boolean;
  patchVideo: boolean;
  patchAudio: boolean;
  preferredTrackHeight: number;
}): SourceEditTrackTargets | null {
  const { tracks, activeTrackId, mediaType, hasAudio, patchVideo, patchAudio, preferredTrackHeight } = params;
  const activeTrack = tracks.find((track) => track.id === activeTrackId);
  if (!activeTrack) {
    return null;
  }

  const activeKind = getTrackKind(activeTrack);
  const wantsVideo = (mediaType === 'video' || mediaType === 'image') && patchVideo;
  const wantsAudio = ((mediaType === 'video' && hasAudio) || mediaType === 'audio') && patchAudio;

  if (!wantsVideo && !wantsAudio) {
    return null;
  }

  if (mediaType === 'audio') {
    if (!wantsAudio) {
      return null;
    }

    const audioTarget = ensureTrackForKind({
      tracks,
      targetTrack: activeTrack,
      kind: 'audio',
      directionWhenCreating: 'below',
      preferredTrackHeight,
      preferTarget: activeKind === null || activeKind === 'audio',
    });

    return {
      tracks: audioTarget.tracks,
      audioTrackId: audioTarget.trackId,
    };
  }

  if (!wantsAudio) {
    if (!wantsVideo) {
      return null;
    }

    const videoTarget = ensureTrackForKind({
      tracks,
      targetTrack: activeTrack,
      kind: 'video',
      directionWhenCreating: 'above',
      preferredTrackHeight,
      preferTarget: activeKind === null || activeKind === 'video',
    });

    return {
      tracks: videoTarget.tracks,
      videoTrackId: videoTarget.trackId,
    };
  }

  if (!wantsVideo) {
    const audioTarget = ensureTrackForKind({
      tracks,
      targetTrack: activeTrack,
      kind: 'audio',
      directionWhenCreating: 'below',
      preferredTrackHeight,
      preferTarget: activeKind === null || activeKind === 'audio',
    });

    return {
      tracks: audioTarget.tracks,
      audioTrackId: audioTarget.trackId,
    };
  }

  if (activeKind !== 'audio') {
    const videoTarget = ensureTrackForKind({
      tracks,
      targetTrack: activeTrack,
      kind: 'video',
      directionWhenCreating: 'above',
      preferredTrackHeight,
      preferTarget: activeKind === null || activeKind === 'video',
    });

    const resolvedVideoTrack = videoTarget.tracks.find((track) => track.id === videoTarget.trackId);
    if (!resolvedVideoTrack) {
      return null;
    }

    const audioTarget = ensureTrackForKind({
      tracks: videoTarget.tracks,
      targetTrack: resolvedVideoTrack,
      kind: 'audio',
      directionWhenCreating: 'below',
      preferredTrackHeight,
    });

    return {
      tracks: audioTarget.tracks,
      videoTrackId: videoTarget.trackId,
      audioTrackId: audioTarget.trackId,
    };
  }

  const audioTarget = ensureTrackForKind({
    tracks,
    targetTrack: activeTrack,
    kind: 'audio',
    directionWhenCreating: 'below',
    preferredTrackHeight,
    preferTarget: true,
  });
  const resolvedAudioTrack = audioTarget.tracks.find((track) => track.id === audioTarget.trackId);
  if (!resolvedAudioTrack) {
    return null;
  }

  const videoTarget = ensureTrackForKind({
    tracks: audioTarget.tracks,
    targetTrack: resolvedAudioTrack,
    kind: 'video',
    directionWhenCreating: 'above',
    preferredTrackHeight,
  });

  return {
    tracks: videoTarget.tracks,
    videoTrackId: videoTarget.trackId,
    audioTrackId: audioTarget.trackId,
  };
}
