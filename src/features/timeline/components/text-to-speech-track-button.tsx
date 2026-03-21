import { useCallback, useEffect, useMemo, useState } from 'react';
import { Mic } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { LANGUAGES } from '@/constants/language-constants';
import type {
  GeneratedCaptionSource,
  TextItem,
  TimelineItem,
  TimelineTrack,
} from '@/types/timeline';
import {
  getWhisperLanguageSelectValue,
  WHISPER_AUTO_LANGUAGE_VALUE,
} from '@/shared/utils/whisper-settings';
import { useSettingsStore } from '../deps/settings';
import { useItemsStore } from '../stores/items-store';
import { useTimelineStore } from '../stores/timeline-store';
import { synthesizeTextTrackToSpeech } from '../services/track-text-to-speech';

/** Stable empty list — never use inline `[]` in Zustand selectors (new reference each snapshot). */
const EMPTY_TRACK_ITEMS: readonly TimelineItem[] = [];

interface TextToSpeechTrackButtonProps {
  track: TimelineTrack;
}

/** Generated transcript captions only (not plain text titles). */
function isTranscriptCaptionClip(
  item: TimelineItem,
): item is TextItem & { captionSource: GeneratedCaptionSource } {
  return (
    item.type === 'text'
    && item.captionSource?.type === 'transcript'
    && (item.captionSource.clipId?.length ?? 0) > 0
    && (item.captionSource.mediaId?.length ?? 0) > 0
  );
}

function resolveDefaultTtsLanguageCode(params: {
  itemsOnTrack: readonly TimelineItem[];
  settingsLanguage: string;
}): string {
  const captions = params.itemsOnTrack
    .filter(isTranscriptCaptionClip)
    .filter((item) => item.text.trim().length > 0)
    .sort((a, b) => a.from - b.from);

  const fromCaption = captions.find((c) => c.captionSource.textLanguage)?.captionSource.textLanguage;
  if (fromCaption && LANGUAGES.some((l) => l.code === fromCaption)) {
    return fromCaption;
  }

  const fromSettings = getWhisperLanguageSelectValue(params.settingsLanguage);
  if (
    fromSettings !== WHISPER_AUTO_LANGUAGE_VALUE
    && LANGUAGES.some((l) => l.code === fromSettings)
  ) {
    return fromSettings;
  }

  return LANGUAGES[0]?.code ?? 'en';
}

export function TextToSpeechTrackButton({ track }: TextToSpeechTrackButtonProps) {
  const fps = useTimelineStore((s) => s.fps);
  const defaultWhisperLanguage = useSettingsStore((s) => s.defaultWhisperLanguage);

  // Use itemsByTrackId so the store returns a stable array reference when track contents are unchanged.
  const trackItems = useItemsStore((s) => s.itemsByTrackId[track.id]);
  const itemsOnTrack = trackItems ?? EMPTY_TRACK_ITEMS;

  const hasCaptionClips = useMemo(
    () =>
      itemsOnTrack.some(
        (i) => isTranscriptCaptionClip(i) && i.text.trim().length > 0,
      ),
    [itemsOnTrack],
  );

  const defaultLanguageCode = useMemo(
    () =>
      resolveDefaultTtsLanguageCode({
        itemsOnTrack,
        settingsLanguage: defaultWhisperLanguage,
      }),
    [itemsOnTrack, defaultWhisperLanguage],
  );

  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [languageCode, setLanguageCode] = useState(defaultLanguageCode);

  useEffect(() => {
    setLanguageCode(defaultLanguageCode);
  }, [defaultLanguageCode]);

  const language = useMemo(
    () => LANGUAGES.find((l) => l.code === languageCode) ?? LANGUAGES[0],
    [languageCode],
  );

  const disabled = track.locked || track.isGroup || !hasCaptionClips;

  const handleConvert = useCallback(async () => {
    if (!language) return;
    setBusy(true);
    try {
      await synthesizeTextTrackToSpeech({
        sourceTrackId: track.id,
        sourceTrackName: track.name,
        languageCode: language.code,
        languageName: language.name,
        timelineFps: fps,
      });
      toast.success('Text-to-speech complete — audio added to library and timeline');
      setOpen(false);
    } catch (e) {
      console.error('Text-to-speech failed:', e);
      toast.error(e instanceof Error ? e.message : 'Text-to-speech failed');
    } finally {
      setBusy(false);
    }
  }, [fps, language, track.id, track.name]);

  if (!hasCaptionClips) {
    return null;
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-5 w-5 rounded hover:bg-secondary shrink-0"
          disabled={disabled}
          aria-label="Generate speech from captions on this track"
          data-tooltip="Text to speech (captions)"
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <Mic className="w-3 h-3 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-64"
        align="start"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col gap-3">
          <p className="text-sm font-medium">Text to speech</p>
          <p className="text-xs text-muted-foreground">
            Sends caption text on this track to the server and adds the returned audio to your media library.
          </p>
          <Select value={languageCode} onValueChange={setLanguageCode} disabled={busy}>
            <SelectTrigger>
              <SelectValue placeholder="Language" />
            </SelectTrigger>
            <SelectContent className="max-h-72" position="popper">
              {LANGUAGES.map((lang) => (
                <SelectItem key={lang.code} value={lang.code}>
                  {lang.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" onClick={handleConvert} disabled={busy}>
            {busy ? 'Generating…' : 'Generate audio'}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
