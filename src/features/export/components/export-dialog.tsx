import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import {
  Loader2,
  CheckCircle2,
  AlertCircle,
  X,
  Download,
  Film,
  Clock,
  HardDrive,
  Music,
  Video,
  Scissors,
  CircleHelp,
} from 'lucide-react';
import { toast } from 'sonner';
import type { ExportSettings, ExportMode } from '@/types/export';
import { useClientRender } from '../hooks/use-client-render';
import { useProjectStore } from '@/features/export/deps/projects';
import { useTimelineStore } from '@/features/export/deps/timeline';
import { formatTimecode, framesToSeconds } from '@/utils/time-utils';
import {
  openTikTokOAuthPopupWindow,
  resolveTikTokOAuthStartUrl,
  tiktokPublishService,
  trackTikTokOAuthPopup,
  type LatestTikTokShareData,
  type TikTokPrivacyLevel,
  type TikTokUploadInitResponse,
} from '../services/tiktok-publish-service';
import {
  getCompatibleVideoCodecs,
  getDefaultVideoCodec,
  mapExportCodecToClientCodec,
  type ClientCodec,
  type ClientVideoContainer,
  type ClientAudioContainer,
} from '../utils/client-renderer';
import { ExportPreviewPlayer } from './export-preview-player';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

const TIKTOK_MUSIC_USAGE_CONFIRMATION_URL =
  'https://www.tiktok.com/legal/page/global/music-usage-confirmation/en';
const TIKTOK_BRANDED_CONTENT_POLICY_URL =
  'https://www.tiktok.com/legal/page/global/bc-policy/en';

/** Poll `/channels/latest-tiktok` while TikTok OAuth may be completing in another window. */
const TIKTOK_OAUTH_POLL_INTERVAL_MS = 3000;
const TIKTOK_OAUTH_POLL_MAX_MS = 2 * 60 * 1000;
const TIKTOK_UPLOAD_STATUS_POLL_INTERVAL_MS = 3000;
const TIKTOK_UPLOAD_STATUS_POLL_MAX_MS = 10 * 60 * 1000;

/** User-facing labels for TikTok `privacy_level` enum (API list is authoritative). */
const TIKTOK_PRIVACY_LABELS: Record<TikTokPrivacyLevel, string> = {
  PUBLIC_TO_EVERYONE: 'Public',
  MUTUAL_FOLLOW_FRIENDS: 'Friends',
  SELF_ONLY: 'Private',
  FOLLOWER_OF_CREATOR: 'Followers',
};

export interface ExportDialogProps {
  open: boolean;
  onClose: () => void;
}

type DialogView = 'settings' | 'progress' | 'complete' | 'error' | 'cancelled';
type TikTokUploadNoticeTone = 'info' | 'success' | 'error';

type VideoContainerOption = {
  value: ClientVideoContainer;
  label: string;
  description: string;
  supported: boolean;
};

type VideoCodecOption = {
  value: ExportSettings['codec'];
  label: string;
  supported: boolean;
};

const VIDEO_CODEC_LABELS: Record<string, string> = {
  h264: 'H.264',
  h265: 'H.265/HEVC',
  vp8: 'VP8',
  vp9: 'VP9',
  av1: 'AV1',
};

const VIDEO_CONTAINER_DESCRIPTIONS: Record<ClientVideoContainer, string> = {
  mp4: 'Most compatible, H.264/H.265',
  mov: 'Best for macOS/iOS',
  webm: 'Web-optimized, VP8/VP9/AV1',
  mkv: 'Flexible, H.264/H.265/VP8/VP9/AV1',
};

function formatTime(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round(seconds % 60);
  return `${minutes}m ${remainingSeconds}s`;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * Generate resolution options based on project dimensions.
 */
function getResolutionOptions(projectWidth: number, projectHeight: number) {
  const scales = [1, 0.666, 0.5];

  return scales.map((scale) => {
    const w = Math.round(projectWidth * scale);
    const h = Math.round(projectHeight * scale);
    const width = w % 2 === 0 ? w : w + 1;
    const height = h % 2 === 0 ? h : h + 1;

    const label =
      scale === 1
        ? `Same as project (${width}×${height})`
        : `${Math.min(width, height)}p (${width}×${height})`;

    return { value: `${width}x${height}`, label };
  });
}

function getDefaultCodecForFormat(
  format: 'mp4' | 'webm'
): ExportSettings['codec'] {
  return getDefaultVideoCodec(format);
}

export function ExportDialog({ open, onClose }: ExportDialogProps) {
  const projectWidth = useProjectStore((s) => s.currentProject?.metadata.width ?? 1920);
  const projectHeight = useProjectStore((s) => s.currentProject?.metadata.height ?? 1080);
  // Timeline state for in/out points and duration calculation
  const fps = useTimelineStore((s) => s.fps);
  const items = useTimelineStore((s) => s.items);
  const inPoint = useTimelineStore((s) => s.inPoint);
  const outPoint = useTimelineStore((s) => s.outPoint);

  const [settings, setSettings] = useState<ExportSettings>({
    codec: getDefaultCodecForFormat('mp4'),
    quality: 'high',
    resolution: { width: projectWidth, height: projectHeight },
  });

  const [exportMode, setExportMode] = useState<ExportMode>('video');
  const [videoContainer, setVideoContainer] = useState<ClientVideoContainer>('mp4');
  const [audioContainer, setAudioContainer] = useState<ClientAudioContainer>('mp3');
  const [view, setView] = useState<DialogView>('settings');
  const [startTime, setStartTime] = useState<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [renderWholeProject, setRenderWholeProject] = useState(false);
  const wasOpenRef = useRef(false);

  // Calculate timeline duration from items
  const timelineDurationFrames = useMemo(() => {
    if (items.length === 0) return 0;
    return Math.max(...items.map((item) => item.from + item.durationInFrames));
  }, [items]);

  // Check if in/out points are set
  const hasInOutPoints = inPoint !== null && outPoint !== null && outPoint > inPoint;

  // Calculate export range
  const exportRange = useMemo(() => {
    if (renderWholeProject || !hasInOutPoints) {
      return { start: 0, end: timelineDurationFrames, duration: timelineDurationFrames };
    }
    const start = inPoint ?? 0;
    const end = outPoint ?? timelineDurationFrames;
    return { start, end, duration: end - start };
  }, [renderWholeProject, hasInOutPoints, inPoint, outPoint, timelineDurationFrames]);

  const resolutionOptions = useMemo(
    () => getResolutionOptions(projectWidth, projectHeight),
    [projectWidth, projectHeight]
  );

  // Sync resolution when project dimensions change
  useEffect(() => {
    setSettings((prev) => ({
      ...prev,
      resolution: { width: projectWidth, height: projectHeight },
    }));
  }, [projectWidth, projectHeight]);

  // Render hook
  const clientRender = useClientRender();

  const {
    progress,
    renderedFrames,
    totalFrames,
    status,
    error,
    startExport,
    cancelExport,
    downloadVideo,
    resetState,
    getSupportedCodecs,
  } = clientRender;

  const [supportedVideoCodecs, setSupportedVideoCodecs] = useState<ClientCodec[] | null>(null);
  const [isCheckingVideoSupport, setIsCheckingVideoSupport] = useState(false);
  const [videoSupportError, setVideoSupportError] = useState<string | null>(null);
  const [tiktokShareData, setTiktokShareData] = useState<LatestTikTokShareData | null>(null);
  const [isLoadingTikTokChannel, setIsLoadingTikTokChannel] = useState(false);
  const [isTikTokDisconnecting, setIsTikTokDisconnecting] = useState(false);
  const [tiktokDescription, setTikTokDescription] = useState('');
  /** TikTok requires an explicit privacy choice — no default. */
  const [selectedTikTokPrivacyLevel, setSelectedTikTokPrivacyLevel] = useState<TikTokPrivacyLevel | null>(null);
  const [allowComment, setAllowComment] = useState(false);
  const [allowDuet, setAllowDuet] = useState(false);
  const [allowStitch, setAllowStitch] = useState(false);
  const [discloseVideoContent, setDiscloseVideoContent] = useState(false);
  const [discloseYourBrand, setDiscloseYourBrand] = useState(false);
  const [discloseBrandedContent, setDiscloseBrandedContent] = useState(false);
  const [isPostingToTikTok, setIsPostingToTikTok] = useState(false);
  const [isTikTokOAuthOpening, setIsTikTokOAuthOpening] = useState(false);
  const [tiktokUploadNotice, setTikTokUploadNotice] = useState<{
    tone: TikTokUploadNoticeTone;
    message: string;
  } | null>(null);
  const tiktokOAuthPollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tiktokOAuthPollMaxTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tiktokUploadPollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tiktokUploadPollMaxTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTiktokOAuthPollTimers = useCallback(() => {
    if (tiktokOAuthPollIntervalRef.current != null) {
      clearInterval(tiktokOAuthPollIntervalRef.current);
      tiktokOAuthPollIntervalRef.current = null;
    }
    if (tiktokOAuthPollMaxTimeoutRef.current != null) {
      clearTimeout(tiktokOAuthPollMaxTimeoutRef.current);
      tiktokOAuthPollMaxTimeoutRef.current = null;
    }
  }, []);

  const clearTiktokUploadPollTimers = useCallback(() => {
    if (tiktokUploadPollIntervalRef.current != null) {
      clearInterval(tiktokUploadPollIntervalRef.current);
      tiktokUploadPollIntervalRef.current = null;
    }
    if (tiktokUploadPollMaxTimeoutRef.current != null) {
      clearTimeout(tiktokUploadPollMaxTimeoutRef.current);
      tiktokUploadPollMaxTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!open) {
      clearTiktokOAuthPollTimers();
      clearTiktokUploadPollTimers();
    }
  }, [open, clearTiktokOAuthPollTimers, clearTiktokUploadPollTimers]);

  // Track elapsed time
  useEffect(() => {
    if (view === 'progress' && !startTime) {
      setStartTime(Date.now());
    }
    if (view === 'settings') {
      setStartTime(null);
      setElapsedSeconds(0);
    }
  }, [view, startTime]);

  useEffect(() => {
    if (!startTime || view !== 'progress') return;

    const interval = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);

    return () => clearInterval(interval);
  }, [startTime, view]);

  // Watch status changes to update view
  useEffect(() => {
    if (status === 'completed') {
      setView('complete');
    } else if (status === 'failed') {
      setView('error');
    } else if (status === 'cancelled') {
      setView('cancelled');
    }
  }, [status]);

  // Handle close
  const handleClose = () => {
    if (view === 'progress') return; // Prevent closing during export
    setView('settings');
    resetState();
    onClose();
  };

  // Start export
  const handleStartExport = async () => {
    setView('progress');
    // Create extended settings with export mode and container
    const extendedSettings = {
      ...settings,
      mode: exportMode,
      videoContainer: exportMode === 'video' ? videoContainer : undefined,
      audioContainer: exportMode === 'audio' ? audioContainer : undefined,
      renderWholeProject,
    };
    await startExport(extendedSettings);
  };

  // Reset when dialog closes
  useEffect(() => {
    clearTiktokOAuthPollTimers();
    clearTiktokUploadPollTimers();

    if (open && !wasOpenRef.current) {
      setView('settings');
      setExportMode('video');
      setVideoContainer('mp4');
      setAudioContainer('mp3');
      setRenderWholeProject(false);
      setSettings({
        codec: getDefaultCodecForFormat('mp4'),
        quality: 'high',
        resolution: { width: projectWidth, height: projectHeight },
      });
      resetState();
      setStartTime(null);
      setElapsedSeconds(0);
      setTiktokShareData(null);
      setIsLoadingTikTokChannel(false);
      setIsTikTokDisconnecting(false);
      setTikTokDescription('');
      setSelectedTikTokPrivacyLevel(null);
      setAllowComment(false);
      setAllowDuet(false);
      setAllowStitch(false);
      setDiscloseVideoContent(false);
      setDiscloseYourBrand(false);
      setDiscloseBrandedContent(false);
      setIsPostingToTikTok(false);
      setIsTikTokOAuthOpening(false);
      setTikTokUploadNotice(null);
    }

    if (!open && wasOpenRef.current) {
      setView('settings');
      resetState();
      setStartTime(null);
      setElapsedSeconds(0);
      setTiktokShareData(null);
      setIsLoadingTikTokChannel(false);
      setIsTikTokDisconnecting(false);
      setTikTokDescription('');
      setSelectedTikTokPrivacyLevel(null);
      setAllowComment(false);
      setAllowDuet(false);
      setAllowStitch(false);
      setDiscloseVideoContent(false);
      setDiscloseYourBrand(false);
      setDiscloseBrandedContent(false);
      setIsPostingToTikTok(false);
      setIsTikTokOAuthOpening(false);
      setTikTokUploadNotice(null);
    }

    wasOpenRef.current = open;
  }, [open, projectHeight, projectWidth, resetState, clearTiktokOAuthPollTimers, clearTiktokUploadPollTimers]);

  const getAudioContainerOptions = () => [
    { value: 'mp3', label: 'MP3', description: 'Universal, small files' },
    { value: 'aac', label: 'AAC', description: 'High quality, compact' },
    { value: 'wav', label: 'WAV', description: 'Lossless PCM, large files' },
  ];

  useEffect(() => {
    if (!open || view !== 'settings' || exportMode !== 'video') return;

    let cancelled = false;
    setIsCheckingVideoSupport(true);
    setVideoSupportError(null);
    setSupportedVideoCodecs(null);

    void getSupportedCodecs({
      resolution: settings.resolution,
      quality: settings.quality,
    })
      .then((codecs) => {
        if (cancelled) return;
        setSupportedVideoCodecs(codecs);
      })
      .catch((err) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : 'Unable to verify codec support';
        setVideoSupportError(message);
      })
      .finally(() => {
        if (!cancelled) {
          setIsCheckingVideoSupport(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    exportMode,
    getSupportedCodecs,
    open,
    settings.resolution.height,
    settings.resolution.width,
    settings.quality,
    view,
  ]);

  const videoContainerOptions = useMemo<VideoContainerOption[]>(() => {
    const allContainers: ClientVideoContainer[] = ['mp4', 'mov', 'webm', 'mkv'];

    return allContainers.map((container) => {
      const supported = supportedVideoCodecs === null
        ? true
        : getCompatibleVideoCodecs(container)
            .map((codec) => mapExportCodecToClientCodec(codec))
            .some((codec) => supportedVideoCodecs.includes(codec));

      return {
        value: container,
        label: container === 'mov' ? 'QuickTime (MOV)' : container.toUpperCase(),
        description: VIDEO_CONTAINER_DESCRIPTIONS[container],
        supported,
      };
    });
  }, [supportedVideoCodecs]);

  const codecOptions = useMemo<VideoCodecOption[]>(() => {
    return getCompatibleVideoCodecs(videoContainer).map((codec) => ({
      value: codec,
      label: VIDEO_CODEC_LABELS[codec] ?? codec.toUpperCase(),
      supported: supportedVideoCodecs === null
        ? true
        : supportedVideoCodecs.includes(mapExportCodecToClientCodec(codec)),
    }));
  }, [supportedVideoCodecs, videoContainer]);

  const hasCapabilityData = supportedVideoCodecs !== null && !videoSupportError;
  const hasSupportedVideoPath = videoContainerOptions.some((option) => option.supported);

  useEffect(() => {
    if (exportMode !== 'video' || !hasCapabilityData) return;

    const firstSupportedContainer = videoContainerOptions.find((option) => option.supported)?.value;
    if (!firstSupportedContainer) return;
    if (!videoContainerOptions.some((option) => option.value === videoContainer && option.supported)) {
      setVideoContainer(firstSupportedContainer);
    }
  }, [exportMode, hasCapabilityData, videoContainer, videoContainerOptions]);

  useEffect(() => {
    const validCodecs = codecOptions
      .filter((option) => option.supported)
      .map((option) => option.value);

    if (!validCodecs.includes(settings.codec)) {
      const fallbackCodec = validCodecs[0] ?? codecOptions[0]?.value;
      if (!fallbackCodec) return;
      setSettings((prev) => ({ ...prev, codec: fallbackCodec as ExportSettings['codec'] }));
    }
  }, [codecOptions, settings.codec]);

  const preventClose = view === 'progress' || view === 'complete';
  const fileSize = clientRender.result?.fileSize;

  // Preview blob URL for completed exports
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    const blob = clientRender.result?.blob;
    if (!blob) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(blob);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [clientRender.result?.blob]);

  const isVideoResult = clientRender.result?.mimeType?.startsWith('video/') ?? false;

  const exportVideoDurationSec = clientRender.result?.duration ?? 0;

  const tiktokCreatorInfo = tiktokShareData?.creator_information;
  const tiktokCreatorErr = tiktokShareData?.creator_query_error;
  const tiktokChannelRow = tiktokShareData?.channel;

  const tiktokDurationExceeded = useMemo(() => {
    if (!tiktokCreatorInfo) return false;
    const maxSec = tiktokCreatorInfo.max_video_post_duration_sec;
    if (typeof maxSec !== 'number' || maxSec <= 0) return false;
    return exportVideoDurationSec > maxSec + 0.01;
  }, [exportVideoDurationSec, tiktokCreatorInfo]);

  const tiktokFormReady =
    !!tiktokChannelRow?.id &&
    !tiktokCreatorErr &&
    !!tiktokCreatorInfo &&
    tiktokCreatorInfo.privacy_level_options.length > 0 &&
    !tiktokDurationExceeded;

  useEffect(() => {
    if (view !== 'complete' || !isVideoResult) return;

    let cancelled = false;
    setIsLoadingTikTokChannel(true);

    void tiktokPublishService
      .getLatestTikTokShareData()
      .then((data) => {
        if (cancelled) return;
        setTiktokShareData(data);
        setSelectedTikTokPrivacyLevel(null);
      })
      .catch((err) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : 'Failed to load TikTok account';
        toast.error('Unable to load TikTok account', {
          description: message,
        });
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingTikTokChannel(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isVideoResult, view]);

  const handleTikTokLogin = async () => {
    const url = await resolveTikTokOAuthStartUrl();
    if (!url) {
      toast.error('TikTok connection is not configured', {
        description:
          'Sign in to the app and ensure the API exposes GET /tiktok/auth/url, or set VITE_TIKTOK_CONNECT_URL to a full OAuth URL.',
      });
      return;
    }

    clearTiktokOAuthPollTimers();

    const popup = openTikTokOAuthPopupWindow(url);
    if (!popup) {
      toast.error('Popup was blocked', {
        description: 'Allow popups for this site to sign in with TikTok.',
      });
      return;
    }

    void trackTikTokOAuthPopup(popup);

    setIsTikTokOAuthOpening(true);
    setIsLoadingTikTokChannel(true);

    const finishConnect = (connected: boolean) => {
      clearTiktokOAuthPollTimers();
      setIsTikTokOAuthOpening(false);
      setIsLoadingTikTokChannel(false);
      if (!connected) {
        toast.message('TikTok not connected yet', {
          description:
            'No linked TikTok account showed up within 2 minutes. Try Log in to TikTok again.',
        });
      }
    };

    const pollOnce = async () => {
      try {
        const data = await tiktokPublishService.getLatestTikTokShareData();
        if (data?.channel?.id) {
          clearTiktokOAuthPollTimers();
          setTiktokShareData(data);
          setSelectedTikTokPrivacyLevel(null);
          setIsTikTokOAuthOpening(false);
          setIsLoadingTikTokChannel(false);
          toast.success('TikTok connected');
        }
      } catch {
        // Transient errors while OAuth completes — keep polling until max duration.
      }
    };

    void pollOnce();
    tiktokOAuthPollIntervalRef.current = setInterval(() => {
      void pollOnce();
    }, TIKTOK_OAUTH_POLL_INTERVAL_MS);

    tiktokOAuthPollMaxTimeoutRef.current = setTimeout(() => {
      finishConnect(false);
    }, TIKTOK_OAUTH_POLL_MAX_MS);
  };

  const handleTikTokLogout = async () => {
    if (!tiktokChannelRow?.id) return;
    setIsTikTokDisconnecting(true);
    try {
      await tiktokPublishService.disconnectTikTokChannel(tiktokChannelRow.id);
      setTiktokShareData(null);
      setSelectedTikTokPrivacyLevel(null);
      toast.success('TikTok account disconnected');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to disconnect';
      toast.error('Could not disconnect TikTok', { description: message });
    } finally {
      setIsTikTokDisconnecting(false);
    }
  };

  const getFirstUploadHistoryId = (response: TikTokUploadInitResponse): number | null => {
    if (typeof response.history_id === 'number' && response.history_id > 0) {
      return response.history_id;
    }
    if (Array.isArray(response.history_ids)) {
      const first = response.history_ids.find((id) => typeof id === 'number' && id > 0);
      return first ?? null;
    }
    return null;
  };

  const handlePostToTikTok = async () => {
    const blob = clientRender.result?.blob;
    if (!blob || !isVideoResult) {
      toast.error('No rendered video available');
      return;
    }
    if (!tiktokChannelRow?.id) {
      toast.error('Connect a TikTok account first');
      return;
    }
    if (tiktokCreatorErr) {
      toast.error('TikTok is blocking this upload', { description: tiktokCreatorErr.message });
      return;
    }
    if (!tiktokCreatorInfo) {
      toast.error('TikTok creator information is not available', {
        description: 'Try again in a moment or reconnect your TikTok account.',
      });
      return;
    }
    if (tiktokDurationExceeded) {
      toast.error('Video is too long for TikTok', {
        description: `This export is ${exportVideoDurationSec.toFixed(1)}s; max allowed is ${tiktokCreatorInfo.max_video_post_duration_sec}s.`,
      });
      return;
    }
    if (!selectedTikTokPrivacyLevel) {
      toast.error('Choose who can watch this video');
      return;
    }
    if (!tiktokCreatorInfo.privacy_level_options.includes(selectedTikTokPrivacyLevel)) {
      toast.error('Invalid visibility for this account');
      return;
    }
    if (!tiktokDescription.trim()) {
      toast.error('Please enter a caption');
      return;
    }

    const mime = clientRender.result?.mimeType?.toLowerCase() ?? '';
    const extension = mime.includes('quicktime') || mime.includes('mov') ? 'mov' : 'mp4';
    const videoFile = new File([blob], `freecut-export-${Date.now()}.${extension}`, {
      type: clientRender.result?.mimeType ?? 'video/mp4',
    });

    clearTiktokUploadPollTimers();
    setIsPostingToTikTok(true);
    setTikTokUploadNotice(null);
    try {
      const response = await tiktokPublishService.uploadVideo(videoFile, {
        channelId: tiktokChannelRow.id,
        title: tiktokDescription.trim(),
        description: tiktokDescription.trim() || undefined,
        privacyLevel: selectedTikTokPrivacyLevel,
        allowComment: tiktokCreatorInfo.comment_disabled ? false : allowComment,
        allowDuet: tiktokCreatorInfo.duet_disabled ? false : allowDuet,
        allowStitch: tiktokCreatorInfo.stitch_disabled ? false : allowStitch,
        discloseVideoContent,
        discloseYourBrand: discloseVideoContent ? discloseYourBrand : false,
        discloseBrandedContent: discloseVideoContent ? discloseBrandedContent : false,
      });

      const uploadHistoryId = getFirstUploadHistoryId(response);
      if (!uploadHistoryId) {
        setTikTokUploadNotice({
          tone: 'info',
          message: response.message ?? 'Your video is being uploaded to TikTok.',
        });
        setIsPostingToTikTok(false);
        return;
      }

      setTikTokUploadNotice({
        tone: 'info',
        message:
          response.message ?? 'Your video is processing on the server. We will update status automatically.',
      });

      let pollingFinished = false;
      let isPollingInFlight = false;
      const completeUploadStatusPolling = (opts?: {
        success?: boolean;
        errorMessage?: string;
        timedOut?: boolean;
      }) => {
        if (pollingFinished) return;
        pollingFinished = true;
        clearTiktokUploadPollTimers();
        setIsPostingToTikTok(false);
        if (opts?.timedOut) {
          setTikTokUploadNotice({
            tone: 'info',
            message:
              'The upload is taking longer than expected. You can check upload history later for the final status.',
          });
          return;
        }
        if (opts?.success) {
          setTikTokUploadNotice({
            tone: 'success',
            message: 'Your video has been processed and posted successfully.',
          });
          return;
        }
        if (opts?.errorMessage) {
          setTikTokUploadNotice({
            tone: 'error',
            message: opts.errorMessage,
          });
        }
      };

      const pollUploadStatus = async () => {
        if (pollingFinished || isPollingInFlight) return;
        isPollingInFlight = true;
        try {
          const history = await tiktokPublishService.getUploadHistoryById(uploadHistoryId);
          if (history.status === 'completed') {
            completeUploadStatusPolling({ success: true });
            return;
          }
          if (history.status === 'failed') {
            completeUploadStatusPolling({
              errorMessage: history.error_message ?? 'The upload failed while processing on the server.',
            });
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Failed to check upload status';
          completeUploadStatusPolling({ errorMessage: message });
        } finally {
          isPollingInFlight = false;
        }
      };

      tiktokUploadPollIntervalRef.current = setInterval(() => {
        void pollUploadStatus();
      }, TIKTOK_UPLOAD_STATUS_POLL_INTERVAL_MS);
      tiktokUploadPollMaxTimeoutRef.current = setTimeout(() => {
        completeUploadStatusPolling({ timedOut: true });
      }, TIKTOK_UPLOAD_STATUS_POLL_MAX_MS);
      void pollUploadStatus();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to upload to TikTok';
      setTikTokUploadNotice({
        tone: 'error',
        message,
      });
      setIsPostingToTikTok(false);
    }
  };

  // Dynamic title and description
  const getTitle = () => {
    switch (view) {
      case 'settings':
        return 'Export Video';
      case 'progress':
        return (
          <span className="flex items-center gap-2">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            Exporting video...
          </span>
        );
      case 'complete':
        return (
          <span className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-green-500" />
            Export complete!
          </span>
        );
      case 'error':
        return (
          <span className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-destructive" />
            Export failed
          </span>
        );
      case 'cancelled':
        return (
          <span className="flex items-center gap-2">
            <X className="h-5 w-5 text-muted-foreground" />
            Export cancelled
          </span>
        );
    }
  };

  const getDescription = () => {
    switch (view) {
      case 'settings':
        return 'Configure export settings and render your video';
      case 'progress':
        return 'Rendering your video';
      case 'complete':
        return 'Your video is ready to download';
      case 'error':
        return 'Something went wrong during export';
      case 'cancelled':
        return 'The export was cancelled';
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose} modal>
      <DialogContent
        className={`overflow-hidden ${view === 'complete' && isVideoResult ? 'sm:max-w-[1020px]' : 'sm:max-w-[500px]'}`}
        hideCloseButton={preventClose}
        onPointerDownOutside={(e) => preventClose && e.preventDefault()}
        onEscapeKeyDown={(e) => preventClose && e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{getTitle()}</DialogTitle>
          <DialogDescription>{getDescription()}</DialogDescription>
        </DialogHeader>

        {/* Settings View */}
        {view === 'settings' && (
          <div className="space-y-6 py-4">
            {/* Export Mode: Video or Audio Toggle Group */}
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Export Type</Label>
              <div className="flex rounded-md border border-border p-0.5 bg-muted/30">
                <button
                  type="button"
                  onClick={() => setExportMode('video')}
                  className={`flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded transition-colors ${
                    exportMode === 'video'
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Video className="h-3.5 w-3.5" />
                  Video
                </button>
                <button
                  type="button"
                  onClick={() => setExportMode('audio')}
                  className={`flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded transition-colors ${
                    exportMode === 'audio'
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Music className="h-3.5 w-3.5" />
                  Audio
                </button>
              </div>
            </div>

            {/* Export Range Section */}
            <div className="space-y-3 p-3 rounded-lg border border-border bg-muted/20">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Scissors className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Export Range</span>
                </div>
                {hasInOutPoints && (
                  <div className="flex items-center gap-2">
                    <Label htmlFor="render-whole" className="text-xs text-muted-foreground">
                      Render whole project
                    </Label>
                    <Switch
                      id="render-whole"
                      checked={renderWholeProject}
                      onCheckedChange={setRenderWholeProject}
                    />
                  </div>
                )}
              </div>
              <div className="grid grid-cols-3 gap-3 text-sm">
                <div>
                  <div className="text-xs text-muted-foreground mb-0.5">In</div>
                  <div className="font-mono text-foreground">
                    {formatTimecode(exportRange.start, fps)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-0.5">Out</div>
                  <div className="font-mono text-foreground">
                    {formatTimecode(exportRange.end, fps)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-0.5">Duration</div>
                  <div className="font-mono text-foreground">
                    {formatTime(framesToSeconds(exportRange.duration, fps))}
                  </div>
                </div>
              </div>
              {hasInOutPoints && !renderWholeProject && (
                <p className="text-xs text-muted-foreground">
                  Exporting in/out range. Toggle above to export the full timeline.
                </p>
              )}
            </div>

            {/* Video Export Settings */}
            {exportMode === 'video' && (
              <>
                <div className="space-y-4">
                  {!isCheckingVideoSupport && videoSupportError && (
                    <Alert>
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>
                        Could not verify browser codec support. Export will validate again when rendering starts.
                      </AlertDescription>
                    </Alert>
                  )}

                  {!isCheckingVideoSupport && !videoSupportError && !hasSupportedVideoPath && (
                    <Alert>
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>
                        This browser cannot encode video at {settings.resolution.width}x{settings.resolution.height}. Try a lower resolution or another browser.
                      </AlertDescription>
                    </Alert>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="container">Format</Label>
                    <Select
                      value={videoContainer}
                      onValueChange={(v) => setVideoContainer(v as ClientVideoContainer)}
                    >
                      <SelectTrigger id="container">
                        <SelectValue placeholder="Select format" />
                      </SelectTrigger>
                      <SelectContent>
                        {videoContainerOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value} disabled={!option.supported}>
                            <span>{option.label}</span>
                            <span className="ml-2 text-xs text-muted-foreground">
                              {option.description}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="codec">Codec</Label>
                    <Select
                      value={settings.codec}
                      onValueChange={(value) => setSettings({ ...settings, codec: value as ExportSettings['codec'] })}
                    >
                      <SelectTrigger id="codec">
                        <SelectValue placeholder="Select codec" />
                      </SelectTrigger>
                      <SelectContent>
                        {codecOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value} disabled={!option.supported}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="quality">Quality</Label>
                    <Select
                      value={settings.quality}
                      onValueChange={(value) => setSettings({ ...settings, quality: value as ExportSettings['quality'] })}
                    >
                      <SelectTrigger id="quality">
                        <SelectValue placeholder="Select quality" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Low (Faster, smaller file)</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="high">High (Recommended)</SelectItem>
                        <SelectItem value="ultra">Ultra (Slower, larger file)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="resolution">Resolution</Label>
                    <Select
                      value={`${settings.resolution.width}x${settings.resolution.height}`}
                      onValueChange={(value) => {
                        const parts = value.split('x').map(Number);
                        const width = parts[0] ?? projectWidth;
                        const height = parts[1] ?? projectHeight;
                        setSettings({ ...settings, resolution: { width, height } });
                      }}
                    >
                      <SelectTrigger id="resolution">
                        <SelectValue placeholder="Select resolution" />
                      </SelectTrigger>
                      <SelectContent>
                        {resolutionOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </>
            )}

            {/* Audio Export Settings */}
            {exportMode === 'audio' && (
              <div className="space-y-4">
                <Alert>
                  <Music className="h-4 w-4" />
                  <AlertDescription>
                    Exports audio only. Video tracks will be ignored.
                  </AlertDescription>
                </Alert>

                <div className="space-y-2">
                  <Label htmlFor="audio-format">Format</Label>
                  <Select
                    value={audioContainer}
                    onValueChange={(v) => setAudioContainer(v as ClientAudioContainer)}
                  >
                    <SelectTrigger id="audio-format">
                      <SelectValue placeholder="Select format" />
                    </SelectTrigger>
                    <SelectContent>
                      {getAudioContainerOptions().map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          <span>{option.label}</span>
                          <span className="ml-2 text-xs text-muted-foreground">{option.description}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="audio-quality">Quality</Label>
                  <Select
                    value={settings.quality}
                    onValueChange={(value) => setSettings({ ...settings, quality: value as ExportSettings['quality'] })}
                  >
                    <SelectTrigger id="audio-quality">
                      <SelectValue placeholder="Select quality" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low (96 kbps)</SelectItem>
                      <SelectItem value="medium">Medium (192 kbps)</SelectItem>
                      <SelectItem value="high">High (256 kbps)</SelectItem>
                      <SelectItem value="ultra">Ultra (320 kbps)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button
                onClick={handleStartExport}
                disabled={exportMode === 'video' && (!hasSupportedVideoPath || isCheckingVideoSupport)}
              >
                {exportMode === 'audio' ? 'Export Audio' : 'Export Video'}
              </Button>
            </div>
          </div>
        )}

        {/* Progress View */}
        {view === 'progress' && (
          <div className="space-y-4 py-4 overflow-hidden">
            <div className="space-y-4 min-w-0">
              <div className="space-y-2 min-w-0">
                <div className="w-full overflow-hidden">
                  <Progress value={progress} className="h-2 w-full" />
                </div>
                <div className="flex items-center justify-between text-sm gap-2">
                  <span className="text-muted-foreground truncate">
                    {status === 'preparing' && 'Preparing...'}
                    {status === 'rendering' && 'Rendering frames...'}
                    {status === 'encoding' && 'Encoding...'}
                    {status === 'finalizing' && 'Finalizing...'}
                  </span>
                  <span className="font-medium tabular-nums flex-shrink-0">{Math.round(progress)}%</span>
                </div>
              </div>

              <div className="flex flex-wrap gap-x-6 gap-y-2">
                {renderedFrames !== undefined && totalFrames !== undefined && (
                  <div className="flex items-center gap-2 text-sm">
                    <Film className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <span className="text-muted-foreground">Frames:</span>
                    <span className="font-medium tabular-nums">{renderedFrames}/{totalFrames}</span>
                  </div>
                )}
                {elapsedSeconds > 0 && (
                  <div className="flex items-center gap-2 text-sm">
                    <Clock className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <span className="text-muted-foreground">Elapsed:</span>
                    <span className="font-medium tabular-nums">{formatTime(elapsedSeconds)}</span>
                  </div>
                )}
              </div>

              <p className="text-xs text-muted-foreground">
                Keep this tab open while rendering. Longer videos may take several minutes.
              </p>
            </div>

            <div className="flex justify-end">
              <Button variant="outline" onClick={cancelExport}>
                Cancel Export
              </Button>
            </div>
          </div>
        )}

        {/* Complete View */}
        {view === 'complete' && (
          <div className="space-y-4 py-4">
            {tiktokUploadNotice ? (
              <Alert
                className={
                  tiktokUploadNotice.tone === 'success'
                    ? 'border-green-900 bg-green-950'
                    : tiktokUploadNotice.tone === 'error'
                      ? 'border-red-900 bg-red-950'
                      : 'border-blue-900 bg-blue-950'
                }
              >
                {tiktokUploadNotice.tone === 'success' ? (
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                ) : tiktokUploadNotice.tone === 'error' ? (
                  <AlertCircle className="h-4 w-4 text-red-500" />
                ) : (
                  <CircleHelp className="h-4 w-4 text-blue-400" />
                )}
                <AlertDescription
                  className={`flex items-center justify-between gap-2 ${
                    tiktokUploadNotice.tone === 'success'
                      ? 'text-green-300'
                      : tiktokUploadNotice.tone === 'error'
                        ? 'text-red-300'
                        : 'text-blue-300'
                  }`}
                >
                  <span>{tiktokUploadNotice.message}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 shrink-0"
                    onClick={() => setTikTokUploadNotice(null)}
                    aria-label="Close notification"
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </AlertDescription>
              </Alert>
            ) : null}

            <div className="flex flex-wrap gap-x-6 gap-y-2">
              {fileSize && (
                <div className="flex items-center gap-2 text-sm">
                  <HardDrive className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">File size:</span>
                  <span className="font-medium">{formatFileSize(fileSize)}</span>
                </div>
              )}
              {elapsedSeconds > 0 && (
                <div className="flex items-center gap-2 text-sm">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Time taken:</span>
                  <span className="font-medium">{formatTime(elapsedSeconds)}</span>
                </div>
              )}
            </div>

            {!isVideoResult && (
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={handleClose}>
                  Close
                </Button>
                <Button onClick={downloadVideo}>
                  <Download className="mr-2 h-4 w-4" />
                  Download
                </Button>
              </div>
            )}

            {isVideoResult && (
              <div className="grid gap-4 md:grid-cols-[360px_minmax(0,1fr)]">
                <div className="space-y-3 rounded-md border border-border bg-card p-3">
                  <p className="mb-2 text-xs text-muted-foreground">Output</p>
                  {previewUrl ? (
                    <ExportPreviewPlayer src={previewUrl} isVideo={isVideoResult} />
                  ) : (
                    <div className="flex h-[220px] items-center justify-center rounded-md bg-muted text-xs text-muted-foreground">
                      Preview unavailable
                    </div>
                  )}

                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={handleClose}>
                      Close
                    </Button>
                    <Button onClick={downloadVideo}>
                      <Download className="mr-2 h-4 w-4" />
                      Download
                    </Button>
                  </div>
                </div>

                <div className="space-y-3 rounded-md border border-border bg-card p-4">
                  <p className="text-2xl font-semibold leading-tight">
                    Video is ready to upload to TikTok.
                  </p>

                  {isLoadingTikTokChannel && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading TikTok account...
                    </div>
                  )}

                  {!isLoadingTikTokChannel && !tiktokShareData && (
                    <div className="space-y-3 rounded-md border border-dashed border-border bg-muted/20 p-4">
                      <p className="text-sm text-muted-foreground">
                        Connect your TikTok account to upload this video.
                      </p>
                      <Button
                        type="button"
                        onClick={() => void handleTikTokLogin()}
                        disabled={isTikTokOAuthOpening}
                      >
                        {isTikTokOAuthOpening ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Connecting…
                          </>
                        ) : (
                          'Log in to TikTok'
                        )}
                      </Button>
                    </div>
                  )}

                  {!isLoadingTikTokChannel && tiktokShareData && (
                    <>
                      <div className="flex items-start gap-3">
                        {tiktokCreatorInfo?.creator_avatar_url ? (
                          <img
                            src={tiktokCreatorInfo.creator_avatar_url}
                            alt=""
                            className="h-10 w-10 shrink-0 rounded-full object-cover"
                            onError={(e) => {
                              e.currentTarget.style.visibility = 'hidden';
                              e.currentTarget.style.display = 'none';
                              e.currentTarget.style.width = '0';
                              e.currentTarget.style.height = '0';
                            }}
                          />
                        ) : null}
                        <div className="min-w-0 flex-1 space-y-0.5">
                          <p className="truncate text-sm font-semibold leading-tight">
                            {tiktokCreatorInfo?.creator_nickname ??
                              tiktokShareData.channel.name ??
                              tiktokShareData.channel.platform_page_id ??
                              'TikTok'}
                          </p>
                          {(tiktokCreatorInfo?.creator_username ?? tiktokShareData.channel.platform_page_id) ? (
                            <p className="truncate text-sm">
                              @{tiktokCreatorInfo?.creator_username ?? tiktokShareData.channel.platform_page_id}
                            </p>
                          ) : null}
                        </div>
                        <button
                          type="button"
                          className="shrink-0 text-xs font-medium text-primary hover:underline disabled:opacity-50"
                          onClick={handleTikTokLogout}
                          disabled={isPostingToTikTok || isTikTokDisconnecting}
                        >
                          {isTikTokDisconnecting ? 'Logging out…' : 'Log out'}
                        </button>
                      </div>

                      {tiktokCreatorErr ? (
                        <Alert variant="destructive">
                          <AlertCircle className="h-4 w-4" />
                          <AlertDescription>
                            <span className="font-medium">{tiktokCreatorErr.code}</span>
                            {tiktokCreatorErr.message ? `: ${tiktokCreatorErr.message}` : null}
                            {tiktokCreatorErr.log_id ? (
                              <span className="mt-1 block text-xs opacity-90">Log ID: {tiktokCreatorErr.log_id}</span>
                            ) : null}
                          </AlertDescription>
                        </Alert>
                      ) : null}

                      {!tiktokCreatorErr && !tiktokCreatorInfo ? (
                        <Alert>
                          <AlertDescription>
                            TikTok creator settings could not be loaded. Try again in a moment or reconnect your
                            account — visibility and interaction options must come from TikTok before you can post.
                          </AlertDescription>
                        </Alert>
                      ) : null}

                      {!tiktokCreatorErr && tiktokCreatorInfo && tiktokCreatorInfo.privacy_level_options.length === 0 ? (
                        <Alert variant="destructive">
                          <AlertCircle className="h-4 w-4" />
                          <AlertDescription>
                            TikTok did not return any visibility options for this account.
                          </AlertDescription>
                        </Alert>
                      ) : null}

                      {tiktokCreatorInfo && tiktokDurationExceeded ? (
                        <Alert variant="destructive">
                          <AlertCircle className="h-4 w-4" />
                          <AlertDescription>
                            This export is about {exportVideoDurationSec.toFixed(1)}s long. TikTok allows up to{' '}
                            {tiktokCreatorInfo.max_video_post_duration_sec}s for your account. Shorten the export
                            before posting.
                          </AlertDescription>
                        </Alert>
                      ) : null}

                      {tiktokFormReady ? (
                        <>
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <Label htmlFor="tiktok-description">Caption</Label>
                              <span className="text-xs text-muted-foreground">{tiktokDescription.length}/150</span>
                            </div>
                            <Textarea
                              id="tiktok-description"
                              value={tiktokDescription}
                              rows={2}
                              maxLength={150}
                              onChange={(e) => setTikTokDescription(e.target.value)}
                              disabled={isPostingToTikTok}
                              placeholder="Add a caption that describes your video"
                            />
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor="tiktok-visibility">Visibility</Label>
                            <Select
                              value={selectedTikTokPrivacyLevel ?? undefined}
                              onValueChange={(value) => setSelectedTikTokPrivacyLevel(value as TikTokPrivacyLevel)}
                              disabled={isPostingToTikTok}
                            >
                              <SelectTrigger id="tiktok-visibility">
                                <SelectValue placeholder="Choose who can watch" />
                              </SelectTrigger>
                              <SelectContent>
                                {tiktokCreatorInfo.privacy_level_options.map((level) => (
                                  <SelectItem key={level} value={level}>
                                    {TIKTOK_PRIVACY_LABELS[level] ?? level}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <p className="text-xs text-muted-foreground">
                              Only options returned by TikTok for your account are listed.
                            </p>
                          </div>

                          <div className="space-y-2">
                            <p className="text-sm font-medium">Allow</p>
                            <div className="flex flex-wrap gap-4 text-sm">
                              <label
                                className={`flex items-center gap-2 ${tiktokCreatorInfo.comment_disabled ? 'cursor-not-allowed opacity-50' : ''}`}
                              >
                                <input
                                  type="checkbox"
                                  checked={tiktokCreatorInfo.comment_disabled ? false : allowComment}
                                  onChange={(e) => setAllowComment(e.target.checked)}
                                  disabled={isPostingToTikTok || tiktokCreatorInfo.comment_disabled}
                                />
                                Comment
                              </label>
                              <label
                                className={`flex items-center gap-2 ${tiktokCreatorInfo.duet_disabled ? 'cursor-not-allowed opacity-50' : ''}`}
                              >
                                <input
                                  type="checkbox"
                                  checked={tiktokCreatorInfo.duet_disabled ? false : allowDuet}
                                  onChange={(e) => setAllowDuet(e.target.checked)}
                                  disabled={isPostingToTikTok || tiktokCreatorInfo.duet_disabled}
                                />
                                Duet
                              </label>
                              <label
                                className={`flex items-center gap-2 ${tiktokCreatorInfo.stitch_disabled ? 'cursor-not-allowed opacity-50' : ''}`}
                              >
                                <input
                                  type="checkbox"
                                  checked={tiktokCreatorInfo.stitch_disabled ? false : allowStitch}
                                  onChange={(e) => setAllowStitch(e.target.checked)}
                                  disabled={isPostingToTikTok || tiktokCreatorInfo.stitch_disabled}
                                />
                                Stitch
                              </label>
                            </div>
                          </div>

                          <Separator />

                          <div className="space-y-3">
                            <div className="flex items-center justify-between gap-3">
                              <div className="flex min-w-0 items-center gap-1.5">
                                <span className="text-sm font-medium">Disclose video content</span>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button
                                      type="button"
                                      className="shrink-0 rounded-full p-0.5 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                      aria-label="About disclosing video content"
                                    >
                                      <CircleHelp className="h-4 w-4" />
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent className="max-w-xs text-left font-normal">
                                    Turn on if this video promotes you, a brand, or a third party. TikTok may require
                                    disclosure for commercial content.
                                  </TooltipContent>
                                </Tooltip>
                              </div>
                              <Switch
                                checked={discloseVideoContent}
                                onCheckedChange={setDiscloseVideoContent}
                                disabled={isPostingToTikTok}
                              />
                            </div>

                            {discloseVideoContent && (
                              <div className="space-y-4 rounded-md border border-border bg-muted/30 p-4">
                                <div className="space-y-1.5">
                                  <label className="flex cursor-pointer items-start gap-3 text-sm">
                                    <input
                                      type="checkbox"
                                      className="mt-0.5 h-4 w-4 shrink-0 rounded border-input accent-primary"
                                      checked={discloseYourBrand}
                                      onChange={(e) => setDiscloseYourBrand(e.target.checked)}
                                      disabled={isPostingToTikTok}
                                    />
                                    <span>
                                      <span className="font-medium text-foreground">Your brand</span>
                                      <span className="mt-1 block text-xs text-muted-foreground">
                                        You are promoting yourself or your own business.
                                      </span>
                                    </span>
                                  </label>
                                </div>
                                <div className="space-y-1.5">
                                  <label className="flex cursor-pointer items-start gap-3 text-sm">
                                    <input
                                      type="checkbox"
                                      className="mt-0.5 h-4 w-4 shrink-0 rounded border-input accent-primary"
                                      checked={discloseBrandedContent}
                                      onChange={(e) => setDiscloseBrandedContent(e.target.checked)}
                                      disabled={isPostingToTikTok}
                                    />
                                    <span>
                                      <span className="font-medium text-foreground">Branded content</span>
                                      <span className="mt-1 block text-xs text-muted-foreground">
                                        You are promoting another brand or a third party.
                                      </span>
                                    </span>
                                  </label>
                                </div>

                                {discloseVideoContent && (discloseYourBrand || discloseBrandedContent) && (
                                  <p className="text-xs leading-relaxed text-muted-foreground">
                                    {discloseYourBrand && !discloseBrandedContent ? (
                                      <>
                                        By posting, you agree to TikTok&apos;s{' '}
                                        <a
                                          href={TIKTOK_MUSIC_USAGE_CONFIRMATION_URL}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="font-medium text-primary underline-offset-4 hover:underline"
                                        >
                                          Music Usage Confirmation
                                        </a>
                                        .
                                      </>
                                    ) : (
                                      <>
                                        By posting, you agree to TikTok&apos;s{' '}
                                        <a
                                          href={TIKTOK_BRANDED_CONTENT_POLICY_URL}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="font-medium text-primary underline-offset-4 hover:underline"
                                        >
                                          Branded Content Policy
                                        </a>{' '}
                                        and{' '}
                                        <a
                                          href={TIKTOK_MUSIC_USAGE_CONFIRMATION_URL}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="font-medium text-primary underline-offset-4 hover:underline"
                                        >
                                          Music Usage Confirmation
                                        </a>
                                        .
                                      </>
                                    )}
                                  </p>
                                )}
                              </div>
                            )}
                          </div>

                          <div className="flex justify-end gap-2 pt-1">
                            <Button variant="outline" onClick={handleClose} disabled={isPostingToTikTok}>
                              Cancel
                            </Button>
                            <Button
                              onClick={handlePostToTikTok}
                              disabled={
                                isPostingToTikTok ||
                                !tiktokChannelRow?.id ||
                                !tiktokDescription.trim() ||
                                !selectedTikTokPrivacyLevel ||
                                !tiktokFormReady
                              }
                            >
                              {isPostingToTikTok ? (
                                <>
                                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                  Posting...
                                </>
                              ) : (
                                'Share'
                              )}
                            </Button>
                          </div>
                        </>
                      ) : null}
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Error View */}
        {view === 'error' && (
          <div className="space-y-4 py-4">
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>

            <div className="flex justify-end">
              <Button variant="outline" onClick={handleClose}>
                Close
              </Button>
            </div>
          </div>
        )}

        {/* Cancelled View */}
        {view === 'cancelled' && (
          <div className="space-y-4 py-4">
            <Alert>
              <X className="h-4 w-4" />
              <AlertDescription>The export process was cancelled.</AlertDescription>
            </Alert>

            <div className="flex justify-end">
              <Button variant="outline" onClick={handleClose}>
                Close
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
