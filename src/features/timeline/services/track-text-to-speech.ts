import type { AudioItem, TextItem, TimelineItem, TimelineTrack } from '@/types/timeline';
import { DEFAULT_TRACK_HEIGHT } from '../constants';
import { addItems } from '../stores/actions/item-actions';
import { setTracks } from '../stores/actions/track-actions';
import { useItemsStore } from '../stores/items-store';
import { resolveMediaUrl } from '../deps/media-library-resolver';
import { useMediaLibraryStore } from '../deps/media-library-store';

/** Payload segment for the external TTS API (seconds). */
export interface TextToSpeechChunk {
  timestamp: [number, number];
  text: string;
}

interface TextToSpeechApiResult {
  audio_url: string;
  order: number;
  start_at: number;
  end_at: number;
}

interface TextToSpeechApiResponse {
  data: {
    results: TextToSpeechApiResult[];
  };
}

function isTranscriptCaptionTextItem(item: TimelineItem): item is TextItem {
  return (
    item.type === 'text'
    && item.captionSource?.type === 'transcript'
    && (item.captionSource.clipId?.length ?? 0) > 0
    && (item.captionSource.mediaId?.length ?? 0) > 0
  );
}

export interface SynthesizeTextTrackOptions {
  sourceTrackId: string;
  sourceTrackName: string;
  languageCode: string;
  languageName: string;
  timelineFps: number;
  /** POST target; dev server proxies `/api/external/*` to the backend. */
  apiPath?: string;
}

export function buildTextToSpeechChunks(
  textItems: readonly TextItem[],
  timelineFps: number,
): TextToSpeechChunk[] {
  return [...textItems]
    .filter((item) => item.text.trim().length > 0)
    .sort((a, b) => a.from - b.from)
    .map((item) => {
      const startSec = item.from / timelineFps;
      const endSec = (item.from + item.durationInFrames) / timelineFps;
      return {
        timestamp: [startSec, endSec] as [number, number],
        text: item.text.trim(),
      };
    });
}

async function callTextToSpeechApi(
  chunks: TextToSpeechChunk[],
  languageCode: string,
  languageName: string,
  apiPath: string,
): Promise<TextToSpeechApiResult[]> {
  const response = await fetch(apiPath, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chunks,
      target_language_code: languageCode,
      target_language_name: languageName,
    }),
  });

  if (!response.ok) {
    const error = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(error?.error ?? `Text-to-speech request failed (${response.status})`);
  }

  const data = (await response.json()) as TextToSpeechApiResponse;
  const results = data?.data?.results ?? [];
  return [...results].sort((a, b) => a.order - b.order);
}

function createTtsAudioTrack(
  tracks: readonly TimelineTrack[],
  sourceTrackName: string,
): { track: TimelineTrack; nextTracks: TimelineTrack[] } {
  const minOrder = tracks.length > 0
    ? Math.min(...tracks.map((t) => t.order ?? 0))
    : 0;
  const shortName = sourceTrackName.trim().slice(0, 24) || 'Text';
  const track: TimelineTrack = {
    id: `track-tts-${Date.now()}`,
    name: `TTS — ${shortName}`,
    height: DEFAULT_TRACK_HEIGHT,
    locked: false,
    visible: true,
    muted: false,
    solo: false,
    order: minOrder - 1,
    items: [],
  };
  return { track, nextTracks: [track, ...tracks] };
}

function buildAudioItemFromTtsResult(params: {
  mediaId: string;
  blobUrl: string;
  audioTrackId: string;
  timelineFps: number;
  durationSeconds: number;
  from: number;
  label: string;
  sourceFps: number;
  sourceDurationFrames: number;
  sourceSpanFrames: number;
}): AudioItem {
  const {
    mediaId,
    blobUrl,
    audioTrackId,
    timelineFps,
    durationSeconds,
    from,
    label,
    sourceFps,
    sourceDurationFrames,
    sourceSpanFrames,
  } = params;

  const durationInFrames = Math.max(1, Math.round(durationSeconds * timelineFps));

  return {
    id: crypto.randomUUID(),
    type: 'audio',
    trackId: audioTrackId,
    from,
    durationInFrames,
    label,
    mediaId,
    originId: crypto.randomUUID(),
    src: blobUrl,
    sourceStart: 0,
    sourceEnd: sourceSpanFrames,
    sourceDuration: sourceDurationFrames,
    sourceFps,
    trimStart: 0,
    trimEnd: 0,
  };
}

/**
 * Calls the TTS API for all non-empty text clips on the track, imports returned audio into the media library,
 * adds a new audio track, and places one audio clip per result aligned by `start_at` / `end_at` (seconds).
 */
export async function synthesizeTextTrackToSpeech(
  options: SynthesizeTextTrackOptions,
): Promise<void> {
  const {
    sourceTrackId,
    sourceTrackName,
    languageCode,
    languageName,
    timelineFps,
    apiPath = '/api/external/text-to-speech',
  } = options;

  const allItems = useItemsStore.getState().items;
  const textItemsOnTrack = allItems.filter(
    (item): item is TextItem =>
      item.trackId === sourceTrackId && isTranscriptCaptionTextItem(item),
  );
  const chunks = buildTextToSpeechChunks(textItemsOnTrack, timelineFps);

  if (chunks.length === 0) {
    throw new Error('No caption clips with content on this track');
  }

  const results = await callTextToSpeechApi(chunks, languageCode, languageName, apiPath);
  if (results.length === 0) {
    throw new Error('No audio returned from text-to-speech service');
  }

  const importFromUrl = useMediaLibraryStore.getState().importMediaFromUrl;
  const tracks = useItemsStore.getState().tracks;
  const { track: audioTrack, nextTracks } = createTtsAudioTrack(tracks, sourceTrackName);
  setTracks(nextTracks);

  const newItems: AudioItem[] = [];
  for (const result of results) {
    const metadata = await importFromUrl(result.audio_url);
    const blobUrl = await resolveMediaUrl(metadata.id);
    const durationSec = Math.max(0, result.end_at - result.start_at);
    const from = Math.max(0, Math.round(result.start_at * timelineFps));
    const sourceFps = metadata.fps || timelineFps;
    const sourceDurationFrames = Math.max(1, Math.round(metadata.duration * sourceFps));
    const durationInFrames = Math.max(1, Math.round(durationSec * timelineFps));
    const sourceSpanFrames = Math.min(
      sourceDurationFrames,
      Math.round(durationInFrames * sourceFps / timelineFps),
    );

    newItems.push(
      buildAudioItemFromTtsResult({
        mediaId: metadata.id,
        blobUrl,
        audioTrackId: audioTrack.id,
        timelineFps,
        durationSeconds: durationSec,
        from,
        label: `TTS ${result.order + 1}`,
        sourceFps,
        sourceDurationFrames,
        sourceSpanFrames,
      }),
    );
  }

  addItems(newItems);
}
