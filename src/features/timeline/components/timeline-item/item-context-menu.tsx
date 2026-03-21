import { memo, ReactNode, useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useSelectionStore } from '@/shared/state/selection';
import { PROPERTY_LABELS, type AnimatableProperty } from '@/types/keyframe';
import type { PropertyKeyframes } from '@/types/keyframe';
import type { MediaTranscriptModel } from '@/types/storage';
import {
  getWhisperLanguageSelectValue,
  WHISPER_AUTO_LANGUAGE_VALUE,
  WHISPER_MODEL_LABELS,
  WHISPER_MODEL_OPTIONS,
} from '@/shared/utils/whisper-settings';

/** Languages shown in the segment caption dialog (Whisper codes). */
const CAPTION_DIALOG_LANGUAGES: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'en', label: 'English' },
  { value: 'zh', label: 'Chinese' },
  { value: 'ja', label: 'Japanese' },
  { value: 'ko', label: 'Korean' },
  { value: 'vi', label: 'Vietnamese' },
  { value: 'es', label: 'Spanish' },
];

const CAPTION_DIALOG_LANGUAGE_CODES = new Set(CAPTION_DIALOG_LANGUAGES.map((l) => l.value));

function getInitialCaptionSourceLanguage(defaultCaptionLanguage: string | undefined): string {
  const fromSettings = getWhisperLanguageSelectValue(defaultCaptionLanguage);
  if (fromSettings === WHISPER_AUTO_LANGUAGE_VALUE) return WHISPER_AUTO_LANGUAGE_VALUE;
  return CAPTION_DIALOG_LANGUAGE_CODES.has(fromSettings) ? fromSettings : WHISPER_AUTO_LANGUAGE_VALUE;
}

interface CaptionGenerationOptions {
  language?: string;
  targetLanguage?: string;
}

interface ItemContextMenuProps {
  children: ReactNode;
  trackLocked: boolean;
  isSelected: boolean;
  canJoinSelected: boolean;
  hasJoinableLeft: boolean;
  hasJoinableRight: boolean;
  /** Which edge was closer when context menu was triggered */
  closerEdge: 'left' | 'right' | null;
  /** Keyframed properties for the item (used to build clear submenu) */
  keyframedProperties?: PropertyKeyframes[];
  onJoinSelected: () => void;
  onJoinLeft: () => void;
  onJoinRight: () => void;
  onRippleDelete: () => void;
  onDelete: () => void;
  onClearAllKeyframes?: () => void;
  onClearPropertyKeyframes?: (property: AnimatableProperty) => void;
  onBentoLayout?: () => void;
  /** Whether this item is a video clip (enables freeze frame option) */
  isVideoItem?: boolean;
  /** Whether the playhead is within this item's bounds */
  playheadInBounds?: boolean;
  onFreezeFrame?: () => void;
  canGenerateCaptions?: boolean;
  canRegenerateCaptions?: boolean;
  isGeneratingCaptions?: boolean;
  defaultCaptionModel?: MediaTranscriptModel;
  defaultCaptionLanguage?: string;
  onGenerateCaptions?: (model: MediaTranscriptModel, options?: CaptionGenerationOptions) => void;
  onRegenerateCaptions?: (model: MediaTranscriptModel, options?: CaptionGenerationOptions) => void;
  /** Whether this item is a composition item (enables enter/dissolve options) */
  isCompositionItem?: boolean;
  onEnterComposition?: () => void;
  onDissolveComposition?: () => void;
  /** Whether multiple items are selected (enables pre-comp creation) */
  canCreatePreComp?: boolean;
  onCreatePreComp?: () => void;
}

/**
 * Context menu for timeline items
 * Provides delete, ripple delete, join, and keyframe clearing operations
 */
export const ItemContextMenu = memo(function ItemContextMenu({
  children,
  trackLocked,
  isSelected,
  canJoinSelected,
  hasJoinableLeft,
  hasJoinableRight,
  closerEdge,
  keyframedProperties,
  onJoinSelected,
  onJoinLeft,
  onJoinRight,
  onRippleDelete,
  onDelete,
  onClearAllKeyframes,
  onClearPropertyKeyframes,
  onBentoLayout,
  isVideoItem,
  playheadInBounds,
  onFreezeFrame,
  canGenerateCaptions,
  canRegenerateCaptions,
  isGeneratingCaptions,
  defaultCaptionModel,
  defaultCaptionLanguage,
  onGenerateCaptions,
  onRegenerateCaptions,
  isCompositionItem,
  onEnterComposition,
  onDissolveComposition,
  canCreatePreComp,
  onCreatePreComp,
}: ItemContextMenuProps) {
  const [captionDialogOpen, setCaptionDialogOpen] = useState(false);
  const [captionAction, setCaptionAction] = useState<'generate' | 'regenerate'>('generate');
  const [captionModel, setCaptionModel] = useState<MediaTranscriptModel | null>(null);
  const [sourceLanguage, setSourceLanguage] = useState(WHISPER_AUTO_LANGUAGE_VALUE);
  const [targetLanguage, setTargetLanguage] = useState(WHISPER_AUTO_LANGUAGE_VALUE);
  const selectedCount = useSelectionStore((s) => s.selectedItemIds.length);
  // Filter to only properties that actually have keyframes
  const propertiesWithKeyframes = useMemo(() => {
    if (!keyframedProperties) return [];
    return keyframedProperties.filter(p => p.keyframes.length > 0);
  }, [keyframedProperties]);
  const explicitCaptionModelOptions = useMemo(
    () => WHISPER_MODEL_OPTIONS.filter((option) => option.value !== defaultCaptionModel),
    [defaultCaptionModel]
  );

  const hasKeyframes = propertiesWithKeyframes.length > 0;

  const openCaptionDialog = (action: 'generate' | 'regenerate', model: MediaTranscriptModel) => {
    setCaptionAction(action);
    setCaptionModel(model);
    setSourceLanguage(getInitialCaptionSourceLanguage(defaultCaptionLanguage));
    setTargetLanguage(WHISPER_AUTO_LANGUAGE_VALUE);
    setCaptionDialogOpen(true);
  };

  const submitCaptionRequest = () => {
    if (!captionModel) return;
    const language = sourceLanguage === WHISPER_AUTO_LANGUAGE_VALUE ? undefined : sourceLanguage;
    const translatedTargetLanguage = (
      targetLanguage !== WHISPER_AUTO_LANGUAGE_VALUE
      && targetLanguage !== sourceLanguage
    )
      ? targetLanguage
      : undefined;

    const options: CaptionGenerationOptions = {
      language,
      targetLanguage: translatedTargetLanguage,
    };

    if (captionAction === 'generate') {
      onGenerateCaptions?.(captionModel, options);
    } else {
      onRegenerateCaptions?.(captionModel, options);
    }

    setCaptionDialogOpen(false);
  };

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild disabled={trackLocked}>
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent>
        {/* Join options - show based on which edge is closer */}
        {(() => {
          // Determine which join option to show based on closer edge
          const showJoinLeft = hasJoinableLeft && (closerEdge === 'left' || !hasJoinableRight);
          const showJoinRight = hasJoinableRight && (closerEdge === 'right' || !hasJoinableLeft);
          const hasJoinOption = showJoinLeft || showJoinRight || canJoinSelected;

          if (!hasJoinOption) return null;

          return (
            <>
              {showJoinLeft && (
                <ContextMenuItem onClick={onJoinLeft}>
                  Join with Previous
                  <ContextMenuShortcut>J</ContextMenuShortcut>
                </ContextMenuItem>
              )}
              {showJoinRight && (
                <ContextMenuItem onClick={onJoinRight}>
                  Join with Next
                  <ContextMenuShortcut>J</ContextMenuShortcut>
                </ContextMenuItem>
              )}
              {canJoinSelected && (
                <ContextMenuItem onClick={onJoinSelected}>
                  Join Selected
                  <ContextMenuShortcut>J</ContextMenuShortcut>
                </ContextMenuItem>
              )}
              <ContextMenuSeparator />
            </>
          );
        })()}

        {/* Clear Keyframes submenu - only show if item has keyframes */}
        {hasKeyframes && (
          <>
            <ContextMenuSub>
              <ContextMenuSubTrigger>Clear Keyframes</ContextMenuSubTrigger>
              <ContextMenuSubContent className="w-48">
                <ContextMenuItem onClick={onClearAllKeyframes}>
                  Clear All
                  <ContextMenuShortcut>Shift+K</ContextMenuShortcut>
                </ContextMenuItem>
                <ContextMenuSeparator />
                {propertiesWithKeyframes.map(({ property }) => (
                  <ContextMenuItem
                    key={property}
                    onClick={() => onClearPropertyKeyframes?.(property)}
                  >
                    {PROPERTY_LABELS[property]}
                  </ContextMenuItem>
                ))}
              </ContextMenuSubContent>
            </ContextMenuSub>
            <ContextMenuSeparator />
          </>
        )}

        {/* Bento Layout - only show when 2+ items selected */}
        {selectedCount >= 2 && onBentoLayout && (
          <>
            <ContextMenuItem onClick={onBentoLayout}>
              Bento Layout...
            </ContextMenuItem>
            <ContextMenuSeparator />
          </>
        )}

        {/* Freeze Frame - only show for video items when playhead is within bounds */}
        {isVideoItem && playheadInBounds && onFreezeFrame && (
          <>
            <ContextMenuItem onClick={onFreezeFrame}>
              Insert Freeze Frame
              <ContextMenuShortcut>Shift+F</ContextMenuShortcut>
            </ContextMenuItem>
            <ContextMenuSeparator />
          </>
        )}

        {canGenerateCaptions && onGenerateCaptions && (
          <>
            {isGeneratingCaptions ? (
              <ContextMenuItem disabled>
                Updating Captions...
              </ContextMenuItem>
            ) : (
              <>
                <ContextMenuSub>
                  <ContextMenuSubTrigger>Generate Captions for Segment</ContextMenuSubTrigger>
                  <ContextMenuSubContent className="w-48">
                    {defaultCaptionModel && (
                      <>
                        <ContextMenuItem onClick={() => openCaptionDialog('generate', defaultCaptionModel)}>
                          {`Default (${WHISPER_MODEL_LABELS[defaultCaptionModel]})`}
                        </ContextMenuItem>
                        <ContextMenuSeparator />
                      </>
                    )}
                    {explicitCaptionModelOptions.map((option) => (
                      <ContextMenuItem
                        key={option.value}
                        onClick={() => openCaptionDialog('generate', option.value)}
                      >
                        {option.label}
                      </ContextMenuItem>
                    ))}
                  </ContextMenuSubContent>
                </ContextMenuSub>

                {canRegenerateCaptions && onRegenerateCaptions && (
                  <ContextMenuSub>
                    <ContextMenuSubTrigger>Regenerate Captions for Segment</ContextMenuSubTrigger>
                    <ContextMenuSubContent className="w-48">
                      {defaultCaptionModel && (
                        <>
                          <ContextMenuItem onClick={() => openCaptionDialog('regenerate', defaultCaptionModel)}>
                            {`Default (${WHISPER_MODEL_LABELS[defaultCaptionModel]})`}
                          </ContextMenuItem>
                          <ContextMenuSeparator />
                        </>
                      )}
                      {explicitCaptionModelOptions.map((option) => (
                        <ContextMenuItem
                          key={option.value}
                          onClick={() => openCaptionDialog('regenerate', option.value)}
                        >
                          {option.label}
                        </ContextMenuItem>
                      ))}
                    </ContextMenuSubContent>
                  </ContextMenuSub>
                )}
              </>
            )}
            <ContextMenuSeparator />
          </>
        )}

        {/* Composition operations */}
        {isCompositionItem && onEnterComposition && (
          <ContextMenuItem onClick={onEnterComposition}>
            Enter Composition
          </ContextMenuItem>
        )}
        {isCompositionItem && onDissolveComposition && (
          <ContextMenuItem onClick={onDissolveComposition}>
            Dissolve Pre-Comp
          </ContextMenuItem>
        )}
        {canCreatePreComp && onCreatePreComp && (
          <ContextMenuItem onClick={onCreatePreComp}>
            Create Pre-Composition
          </ContextMenuItem>
        )}
        {((isCompositionItem && (onEnterComposition || onDissolveComposition)) || (canCreatePreComp && onCreatePreComp)) && (
          <ContextMenuSeparator />
        )}

        <ContextMenuItem
          onClick={onRippleDelete}
          disabled={!isSelected}
          className="text-destructive focus:text-destructive"
        >
          Ripple Delete
          <ContextMenuShortcut>Ctrl+Del</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem
          onClick={onDelete}
          disabled={!isSelected}
          className="text-destructive focus:text-destructive"
        >
          Delete
          <ContextMenuShortcut>Del</ContextMenuShortcut>
        </ContextMenuItem>
      </ContextMenuContent>
      <Dialog open={captionDialogOpen} onOpenChange={setCaptionDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {captionAction === 'generate' ? 'Generate captions' : 'Regenerate captions'}
            </DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-1 gap-4 py-2">
            <div className="flex flex-col gap-2">
              <Label>Original language</Label>
              <Select value={sourceLanguage} onValueChange={setSourceLanguage}>
                <SelectTrigger>
                  <SelectValue placeholder="Select original language" />
                </SelectTrigger>
                <SelectContent position="item-aligned" className="max-h-72">
                  <SelectItem value={WHISPER_AUTO_LANGUAGE_VALUE}>Auto-detect</SelectItem>
                  {CAPTION_DIALOG_LANGUAGES.map((languageOption) => (
                    <SelectItem key={languageOption.value} value={languageOption.value}>
                      {languageOption.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-2">
              <Label>Translate to</Label>
              <Select value={targetLanguage} onValueChange={setTargetLanguage}>
                <SelectTrigger>
                  <SelectValue placeholder="Select target language" />
                </SelectTrigger>
                <SelectContent position="item-aligned" className="max-h-72">
                  <SelectItem value={WHISPER_AUTO_LANGUAGE_VALUE}>Same as original</SelectItem>
                  {CAPTION_DIALOG_LANGUAGES.map((languageOption) => (
                    <SelectItem key={languageOption.value} value={languageOption.value}>
                      {languageOption.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setCaptionDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button onClick={submitCaptionRequest}>
              {captionAction === 'generate' ? 'Generate subtitles' : 'Regenerate subtitles'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ContextMenu>
  );
});
