import { useState, useCallback, useEffect } from 'react';
import type { MediaMetadata } from '@/types/storage';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PromptForm, type PromptFormValues } from '@/components/common/prompt-form';
import {
  RotateCcw,
  Trash2,
  Loader2,
  Check,
  ImagePlus,
  Film,
  Pencil,
  Plus,
} from 'lucide-react';
import {
  LocalInferenceUnloadControl,
  useSettingsStore,
} from '@/features/editor/deps/settings';
import {
  useMediaLibraryStore,
  getSharedProxyKey,
  importProxyService,
  importMediaLibraryService,
  importThumbnailGenerator,
} from '@/features/editor/deps/media-library';
import {
  importGifFrameCache,
  importFilmstripCache,
  importWaveformCache,
} from '@/features/editor/deps/timeline-cache';
import { clearPreviewAudioCache } from '@/features/editor/deps/composition-runtime';
import { createLogger } from '@/shared/logging/logger';
import { EDITOR_DENSITY_OPTIONS } from '@/shared/ui/editor-layout';
import {
  getWhisperQuantizationOption,
  getWhisperLanguageSelectValue,
  getWhisperLanguageSettingValue,
  WHISPER_LANGUAGE_OPTIONS,
  WHISPER_MODEL_OPTIONS,
  WHISPER_QUANTIZATION_OPTIONS,
} from '@/shared/utils/whisper-settings';
import type { MediaTranscriptModel, MediaTranscriptQuantization } from '@/types/storage';
import {
  CAPTION_TRANSLATION_PROMPT_TYPE,
  createPrompt,
  deletePrompt,
  listPrompts,
  updatePrompt,
  type PromptRecord,
} from '@/services/prompt';

const log = createLogger('SettingsDialog');

interface PromptsSettingsPanelProps {
  visible: boolean;
}

function PromptsSettingsPanel({ visible }: PromptsSettingsPanelProps) {
  const [prompts, setPrompts] = useState<PromptRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<'create' | 'edit'>('create');
  const [editing, setEditing] = useState<PromptRecord | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PromptRecord | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const loadPrompts = useCallback(() => {
    setLoading(true);
    setLoadError(null);
    void listPrompts(CAPTION_TRANSLATION_PROMPT_TYPE)
      .then((rows) => setPrompts(rows))
      .catch((e: unknown) => {
        setLoadError(e instanceof Error ? e.message : 'Failed to load prompts');
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!visible) return;
    loadPrompts();
  }, [visible, loadPrompts]);

  const openCreate = () => {
    setEditorMode('create');
    setEditing(null);
    setFormError(null);
    setFormKey((k) => k + 1);
    setEditorOpen(true);
  };

  const openEdit = (record: PromptRecord) => {
    setEditorMode('edit');
    setEditing(record);
    setFormError(null);
    setFormKey((k) => k + 1);
    setEditorOpen(true);
  };

  const handleSavePrompt = async (values: PromptFormValues) => {
    setSubmitting(true);
    setFormError(null);
    try {
      if (editorMode === 'create') {
        await createPrompt({
          name: values.name,
          type: CAPTION_TRANSLATION_PROMPT_TYPE,
          prompt: values.prompt,
        });
      } else if (editing) {
        await updatePrompt(editing.id, {
          name: values.name,
          type: CAPTION_TRANSLATION_PROMPT_TYPE,
          prompt: values.prompt,
        });
      }
      await loadPrompts();
      setEditorOpen(false);
      setEditing(null);
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : 'Failed to save prompt');
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deletePrompt(deleteTarget.id);
      await loadPrompts();
      setDeleteTarget(null);
    } catch (e: unknown) {
      log.error('Failed to delete prompt', e);
      setDeleteError(e instanceof Error ? e.message : 'Failed to delete prompt');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-4 px-6 py-5 pr-7">
      <div className="flex justify-end">
        <Button type="button" size="sm" className="gap-1.5" onClick={openCreate}>
          <Plus className="h-3.5 w-3.5" />
          Add prompt
        </Button>
      </div>

      {loadError && (
        <p className="text-destructive text-sm">{loadError}</p>
      )}

      {loading && prompts.length === 0 && !loadError && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading prompts…
        </div>
      )}

      {!loading && prompts.length === 0 && !loadError && (
        <p className="text-sm text-muted-foreground">No prompts yet. Add one to use in translated captions.</p>
      )}

      <div className="divide-y rounded-md border">
        {prompts.map((p) => (
          <div
            key={p.id}
            className="flex items-start gap-3 p-3"
          >
            <div className="min-w-0 flex-1 space-y-1">
              <p className="truncate text-sm font-medium">{p.name}</p>
              <p className="line-clamp-3 whitespace-pre-wrap break-words text-xs text-muted-foreground">
                {p.prompt}
              </p>
            </div>
            <div className="flex shrink-0 gap-0.5">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => openEdit(p)}
                aria-label={`Edit ${p.name}`}
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-destructive hover:text-destructive"
                onClick={() => setDeleteTarget(p)}
                aria-label={`Delete ${p.name}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      <Dialog open={editorOpen} onOpenChange={(o) => {
        setEditorOpen(o);
        if (!o) {
          setFormError(null);
          setEditing(null);
        }
      }}
      >
        <DialogContent className="flex max-h-[90dvh] min-h-0 w-[min(100vw-2rem,56rem)] max-w-none flex-col gap-4 overflow-hidden p-6 sm:max-w-4xl">
          <DialogHeader className="shrink-0">
            <DialogTitle>
              {editorMode === 'create' ? 'Add translation prompt' : 'Edit translation prompt'}
            </DialogTitle>
          </DialogHeader>
          <PromptForm
            resetKey={formKey}
            defaultValues={
              editing ? { name: editing.name, prompt: editing.prompt } : undefined
            }
            error={formError}
            isSubmitting={submitting}
            onCancel={() => setEditorOpen(false)}
            onSubmit={handleSavePrompt}
            submitLabel={editorMode === 'create' ? 'Create' : 'Save'}
            nameInputId="settings-prompt-name"
            promptInputId="settings-prompt-text"
          />
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(o) => {
          if (!o) {
            setDeleteTarget(null);
            setDeleteError(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete prompt?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="text-sm text-muted-foreground">
                {deleteTarget && (
                  <p>
                    This will permanently remove &ldquo;{deleteTarget.name}&rdquo;. This cannot be undone.
                  </p>
                )}
                {deleteError && (
                  <p className="mt-2 text-destructive">{deleteError}</p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              disabled={deleting}
              onClick={() => void handleConfirmDelete()}
            >
              {deleting ? 'Deleting…' : 'Delete'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Clear regenerable cache data for the current project's media only.
 * Clears filmstrips, waveforms, GIF frames, and decoded audio
 * scoped to the given media IDs.
 *
 * Does NOT clear thumbnails (not auto-regenerated) or proxies (separate action).
 */
async function clearProjectCaches(mediaIds: string[]): Promise<void> {
  if (mediaIds.length === 0) return;

  const [
    { deleteWaveform },
    { deleteGifFrames },
    { deleteDecodedPreviewAudio },
    { gifFrameCache },
    { filmstripCache },
    { waveformCache },
  ] = await Promise.all([
    import('@/infrastructure/storage/indexeddb/waveforms'),
    import('@/infrastructure/storage/indexeddb/gif-frames'),
    import('@/infrastructure/storage/indexeddb/decoded-preview-audio'),
    importGifFrameCache(),
    importFilmstripCache(),
    importWaveformCache(),
  ]);

  // Clear in-memory preview audio cache (not keyed per-media, so clear all)
  clearPreviewAudioCache();

  await Promise.all(
    mediaIds.flatMap((id) => [
      deleteWaveform(id).catch((e) => { log.debug('Failed to delete waveform:', id, e); }),
      deleteGifFrames(id).catch((e) => { log.debug('Failed to delete GIF frames:', id, e); }),
      deleteDecodedPreviewAudio(id).catch((e) => { log.debug('Failed to delete decoded audio:', id, e); }),
      gifFrameCache.clearMedia(id).catch((e) => { log.debug('Failed to clear GIF cache:', id, e); }),
      filmstripCache.clearMedia(id).catch((e) => { log.debug('Failed to clear filmstrip cache:', id, e); }),
      waveformCache.clearMedia(id).catch((e) => { log.debug('Failed to clear waveform cache:', id, e); }),
    ])
  );

  log.info(`Cleared caches for ${mediaIds.length} media items`);
}

/** Delete all proxy videos for the given media items and clear their store status. */
async function clearProjectProxies(
  mediaItems: MediaMetadata[]
): Promise<void> {
  if (mediaItems.length === 0) return;

  const { proxyService } = await importProxyService();

  await Promise.all(mediaItems.map(async (media) => {
    try {
      await proxyService.deleteProxy(media.id, getSharedProxyKey(media));
    } catch { /* already absent */ }
    useMediaLibraryStore.getState().clearProxyStatus(media.id);
    proxyService.clearProxyKey(media.id);
  }));

  log.info(`Cleared proxies for ${mediaItems.length} media items`);
}

/**
 * Regenerate thumbnails for all media in the current project.
 * Fetches each media file, generates a new thumbnail, and saves it to IndexedDB.
 */
async function regenerateProjectThumbnails(
  mediaItems: Array<{ id: string; fileName: string; mimeType: string }>,
  onProgress?: (done: number, total: number) => void,
): Promise<number> {
  if (mediaItems.length === 0) return 0;

  const [
    { mediaLibraryService },
    { generateThumbnail },
    { saveThumbnail },
    { updateMedia },
  ] = await Promise.all([
    importMediaLibraryService(),
    importThumbnailGenerator(),
    import('@/infrastructure/storage/indexeddb/thumbnails'),
    import('@/infrastructure/storage/indexeddb/media'),
  ]);

  let regenerated = 0;

  for (const media of mediaItems) {
    try {
      const blob = await mediaLibraryService.getMediaFile(media.id);
      if (!blob) continue;

      // generateThumbnail expects a File (needs .name for extension-based mime detection)
      const file = new File([blob], media.fileName, { type: media.mimeType });
      const thumbnailBlob = await generateThumbnail(file);

      const thumbnailId = crypto.randomUUID();
      await saveThumbnail({
        id: thumbnailId,
        mediaId: media.id,
        blob: thumbnailBlob,
        timestamp: 1,
        width: 320,
        height: 180,
      });

      // Update the media record so the new thumbnailId propagates to the store
      await updateMedia(media.id, { thumbnailId });

      // Clear the in-memory blob URL cache so UI picks up the new thumbnail
      mediaLibraryService.clearThumbnailCache(media.id);
      regenerated++;
    } catch (err) {
      log.warn(`Failed to regenerate thumbnail for ${media.fileName}:`, err);
    }
    onProgress?.(regenerated, mediaItems.length);
  }

  // Reload store so MediaCards see the updated thumbnailId and re-fetch
  await useMediaLibraryStore.getState().loadMediaItems();

  log.info(`Regenerated ${regenerated}/${mediaItems.length} thumbnails`);
  return regenerated;
}

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const snapEnabled = useSettingsStore((s) => s.snapEnabled);
  const editorDensity = useSettingsStore((s) => s.editorDensity);
  const showWaveforms = useSettingsStore((s) => s.showWaveforms);
  const showFilmstrips = useSettingsStore((s) => s.showFilmstrips);
  const autoSaveInterval = useSettingsStore((s) => s.autoSaveInterval);
  const maxUndoHistory = useSettingsStore((s) => s.maxUndoHistory);
  const defaultWhisperModel = useSettingsStore((s) => s.defaultWhisperModel);
  const defaultWhisperQuantization = useSettingsStore((s) => s.defaultWhisperQuantization);
  const defaultWhisperLanguage = useSettingsStore((s) => s.defaultWhisperLanguage);
  const setSetting = useSettingsStore((s) => s.setSetting);
  const resetToDefaults = useSettingsStore((s) => s.resetToDefaults);

  const mediaItems = useMediaLibraryStore((s) => s.mediaItems);

  const [clearState, setClearState] = useState<'idle' | 'clearing' | 'done'>('idle');
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [regenState, setRegenState] = useState<'idle' | 'working' | 'done'>('idle');
  const [regenProgress, setRegenProgress] = useState('');
  const [proxyState, setProxyState] = useState<'idle' | 'clearing' | 'done'>('idle');
  const [settingsTab, setSettingsTab] = useState('general');

  useEffect(() => {
    if (!open) {
      setSettingsTab('general');
    }
  }, [open]);

  const handleClearCache = useCallback(async () => {
    setClearState('clearing');
    try {
      const ids = mediaItems.map((m) => m.id);
      await clearProjectCaches(ids);
      setClearState('done');
      setTimeout(() => setClearState('idle'), 2000);
    } catch (err) {
      log.error('Failed to clear caches', err);
      setClearState('idle');
    }
  }, [mediaItems]);

  const handleRegenThumbnails = useCallback(async () => {
    setRegenState('working');
    setRegenProgress('0/' + mediaItems.length);
    try {
      const items = mediaItems.map((m) => ({ id: m.id, fileName: m.fileName, mimeType: m.mimeType }));
      await regenerateProjectThumbnails(items, (done, total) => {
        setRegenProgress(`${done}/${total}`);
      });
      setRegenState('done');
      setTimeout(() => {
        setRegenState('idle');
        setRegenProgress('');
      }, 2000);
    } catch (err) {
      log.error('Failed to regenerate thumbnails', err);
      setRegenState('idle');
      setRegenProgress('');
    }
  }, [mediaItems]);

  const handleClearProxies = useCallback(async () => {
    setProxyState('clearing');
    try {
      await clearProjectProxies(mediaItems);
      setProxyState('done');
      setTimeout(() => setProxyState('idle'), 2000);
    } catch (err) {
      log.error('Failed to clear proxies', err);
      setProxyState('idle');
    }
  }, [mediaItems]);

  const defaultWhisperLanguageValue = getWhisperLanguageSelectValue(defaultWhisperLanguage);
  const defaultWhisperQuantizationOption = getWhisperQuantizationOption(defaultWhisperQuantization);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] max-w-3xl flex-col gap-0 overflow-hidden p-0">
        <Tabs value={settingsTab} onValueChange={setSettingsTab} className="flex min-h-0 flex-1 flex-col">
          <DialogHeader className="flex shrink-0 flex-col gap-3 border-b px-6 py-4 pr-14">
            <div className="flex flex-row items-center justify-between gap-2">
              <DialogTitle>Editor Settings</DialogTitle>
              <Button variant="ghost" size="sm" onClick={resetToDefaults} className="h-8 shrink-0 gap-1.5">
                <RotateCcw className="w-3.5 h-3.5" />
                Reset
              </Button>
            </div>
            <TabsList className="h-9 w-full justify-start sm:w-auto">
              <TabsTrigger value="general">General</TabsTrigger>
              <TabsTrigger value="prompts">Prompts</TabsTrigger>
            </TabsList>
          </DialogHeader>

          <TabsContent value="general" className="mt-0 min-h-0 flex-1 overflow-hidden data-[state=inactive]:hidden">
            <ScrollArea className="h-[min(70vh,560px)]">
              <div className="space-y-8 px-6 py-5 pr-7">
                {/* Interface Section */}
                <section className="space-y-4">
                  <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground/70">Interface</h3>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Editor Density</Label>
                      <Select
                        value={editorDensity}
                        onValueChange={(value) => setSetting('editorDensity', value as typeof editorDensity)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {EDITOR_DENSITY_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        Compact fits more of the editor into a 1080p screen. Default restores the roomier layout.
                      </p>
                    </div>

                    <div className="flex items-center justify-between gap-4">
                      <div className="space-y-0.5">
                        <Label className="text-sm font-medium">Auto-save</Label>
                        <p className="text-xs text-muted-foreground">Automatically save your project changes.</p>
                      </div>
                      <Switch
                        checked={autoSaveInterval > 0}
                        onCheckedChange={(v) => setSetting('autoSaveInterval', v ? 5 : 0)}
                      />
                    </div>

                    {autoSaveInterval > 0 && (
                      <div className="flex items-center justify-between gap-4 pl-4 border-l-2 border-muted">
                        <Label className="text-sm text-muted-foreground">Interval (minutes)</Label>
                        <div className="w-40 flex items-center gap-3">
                          <Slider
                            value={[autoSaveInterval]}
                            onValueChange={([v]) => setSetting('autoSaveInterval', v || 5)}
                            min={5}
                            max={30}
                            step={5}
                          />
                          <span className="text-xs font-mono text-muted-foreground w-6">{autoSaveInterval}</span>
                        </div>
                      </div>
                    )}

                    <div className="flex items-center justify-between gap-4">
                      <div className="space-y-0.5">
                        <Label className="text-sm font-medium">Undo History Depth</Label>
                        <p className="text-xs text-muted-foreground">Number of steps to keep in undo history.</p>
                      </div>
                      <div className="w-40 flex items-center gap-3">
                        <Slider
                          value={[maxUndoHistory]}
                          onValueChange={([v]) => setSetting('maxUndoHistory', v || 10)}
                          min={10}
                          max={200}
                          step={10}
                        />
                        <span className="text-xs font-mono text-muted-foreground w-6">{maxUndoHistory}</span>
                      </div>
                    </div>
                  </div>
                </section>

                {/* Timeline Section */}
                <section className="space-y-4">
                  <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground/70">Timeline</h3>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label className="text-sm font-medium">Snap by Default</Label>
                        <p className="text-xs text-muted-foreground">Sets the initial snap state when a project opens.</p>
                      </div>
                      <Switch checked={snapEnabled} onCheckedChange={(v) => setSetting('snapEnabled', v)} />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-medium">Show Waveforms</Label>
                      <Switch checked={showWaveforms} onCheckedChange={(v) => setSetting('showWaveforms', v)} />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-medium">Show Filmstrips</Label>
                      <Switch checked={showFilmstrips} onCheckedChange={(v) => setSetting('showFilmstrips', v)} />
                    </div>
                  </div>
                </section>

                {/* Whisper Section */}
                <section className="space-y-4">
                  <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground/70">Whisper (AI Transcription)</h3>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Default Model</Label>
                      <Select
                        value={defaultWhisperModel}
                        onValueChange={(value) =>
                          setSetting('defaultWhisperModel', value as MediaTranscriptModel)
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {WHISPER_MODEL_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        Used when transcription starts without an explicit model override.
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Default Quantization</Label>
                      <Select
                        value={defaultWhisperQuantization}
                        onValueChange={(value) =>
                          setSetting('defaultWhisperQuantization', value as MediaTranscriptQuantization)
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {WHISPER_QUANTIZATION_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        Pick based on memory first. {defaultWhisperQuantizationOption?.description}
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Default Language</Label>
                      <Combobox
                        value={defaultWhisperLanguageValue}
                        onValueChange={(value) =>
                          setSetting('defaultWhisperLanguage', getWhisperLanguageSettingValue(value))
                        }
                        options={WHISPER_LANGUAGE_OPTIONS}
                        placeholder="Auto-detect"
                        searchPlaceholder="Search languages..."
                        emptyMessage="No languages match that search."
                      />
                      <p className="text-xs text-muted-foreground">
                        Choose Auto-detect to infer the language, or lock transcription to a known language for faster startup.
                      </p>
                    </div>

                    <div className="pt-2">
                      <LocalInferenceUnloadControl />
                    </div>
                  </div>
                </section>

                {/* Storage Section */}
                <section className="space-y-4">
                  <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground/70">Storage & Maintenance</h3>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between gap-4">
                      <div className="space-y-0.5">
                        <Label className="text-sm font-medium">Clear Project Cache</Label>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Waveforms, filmstrips, GIF frames, decoded audio.
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 w-28 gap-1.5"
                        onClick={() => setShowClearConfirm(true)}
                        disabled={clearState !== 'idle'}
                      >
                        {clearState === 'clearing' && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                        {clearState === 'done' && <Check className="w-3.5 h-3.5" />}
                        {clearState === 'idle' && <Trash2 className="w-3.5 h-3.5" />}
                        {clearState === 'clearing' ? 'Clearing...' : clearState === 'done' ? 'Cleared' : 'Clear'}
                      </Button>
                    </div>

                    <div className="flex items-center justify-between gap-4">
                      <div className="space-y-0.5">
                        <Label className="text-sm font-medium">Regenerate Thumbnails</Label>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Re-create media library thumbnails for this project.
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 w-28 gap-1.5"
                        onClick={handleRegenThumbnails}
                        disabled={regenState !== 'idle'}
                      >
                        {regenState === 'working' && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                        {regenState === 'done' && <Check className="w-3.5 h-3.5" />}
                        {regenState === 'idle' && <ImagePlus className="w-3.5 h-3.5" />}
                        {regenState === 'working' ? regenProgress : regenState === 'done' ? 'Done' : 'Regenerate'}
                      </Button>
                    </div>

                    <div className="flex items-center justify-between gap-4">
                      <div className="space-y-0.5">
                        <Label className="text-sm font-medium">Delete Proxies</Label>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Remove generated proxy videos for this project.
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 w-28 gap-1.5"
                        onClick={handleClearProxies}
                        disabled={proxyState !== 'idle'}
                      >
                        {proxyState === 'clearing' && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                        {proxyState === 'done' && <Check className="w-3.5 h-3.5" />}
                        {proxyState === 'idle' && <Film className="w-3.5 h-3.5" />}
                        {proxyState === 'clearing' ? 'Deleting...' : proxyState === 'done' ? 'Deleted' : 'Delete'}
                      </Button>
                    </div>
                  </div>
                </section>
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="prompts" className="mt-0 min-h-0 flex-1 overflow-hidden data-[state=inactive]:hidden">
            <ScrollArea className="h-[min(70vh,560px)]">
              <PromptsSettingsPanel visible={open && settingsTab === 'prompts'} />
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </DialogContent>

      <AlertDialog open={showClearConfirm} onOpenChange={setShowClearConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear project cache?</AlertDialogTitle>
            <AlertDialogDescription>
              This will delete cached waveforms, filmstrips, GIF frames, and decoded audio
              for the current project ({mediaItems.length} media items).
              These will be regenerated automatically when needed. Your project data,
              media files, thumbnails, and proxies will not be affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                void handleClearCache();
              }}
            >
              Clear Cache
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
