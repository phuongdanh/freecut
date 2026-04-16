import { api } from '@/services/api';
import { TIKTOK_OAUTH_COMPLETE_MESSAGE_TYPE } from '@/shared/tiktok-oauth';
import type { AxiosError } from 'axios';

/**
 * Shared `api` uses a 10s default timeout — too short for multipart video uploads.
 * Override with `VITE_UPLOAD_FILE_TIMEOUT_MS` (milliseconds; `0` = no limit per axios).
 */
function getUploadFileTimeoutMs(): number {
  const raw = import.meta.env.VITE_UPLOAD_FILE_TIMEOUT_MS;
  if (typeof raw === 'string' && raw.trim() !== '') {
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 0) {
      return n;
    }
  }
  return 60 * 60 * 1000;
}

/** TikTok privacy enum from Query Creator Info — only use values returned in `privacy_level_options`. */
export type TikTokPrivacyLevel =
  | 'PUBLIC_TO_EVERYONE'
  | 'MUTUAL_FOLLOW_FRIENDS'
  | 'SELF_ONLY'
  | 'FOLLOWER_OF_CREATOR';

export interface TikTokCreatorInformation {
  creator_avatar_url: string;
  creator_username: string;
  creator_nickname: string;
  privacy_level_options: TikTokPrivacyLevel[];
  comment_disabled: boolean;
  duet_disabled: boolean;
  stitch_disabled: boolean;
  max_video_post_duration_sec: number;
}

export interface TikTokCreatorQueryError {
  code: string;
  message: string;
  log_id?: string;
}

/** Channel row from GET /channels/latest-tiktok (safe fields, no tokens). */
export interface TikTokChannelSummary {
  id: number;
  user_id?: number;
  platform_type?: string;
  platform_page_id?: string;
  name?: string;
  default_title?: string;
  default_description?: string;
  default_keyword?: string;
  expiry?: string;
  token_type?: string;
  is_active?: boolean;
  default_upload_mode?: string;
  default_schedule_times?: string[];
  created?: string;
  updated?: string;
  expired_in?: number;
}

/**
 * GET /channels/latest-tiktok envelope when user has a channel row.
 * @see docs/task/get_latest_tiktok_channel_information_changes.md
 */
export interface LatestTikTokShareData {
  channel: TikTokChannelSummary;
  creator_information?: TikTokCreatorInformation;
  creator_query_error?: TikTokCreatorQueryError;
}

type LatestTikTokApiEnvelope = {
  data: LatestTikTokShareData | null;
};

export interface TikTokPublishRequest {
  channelId: number;
  title: string;
  description?: string;
  /** Legacy upload `mode` expected by current backend (`public | private | schedule`). */
  mode?: 'public' | 'private' | 'schedule';
  /** TikTok Direct Post privacy level enum. */
  privacyLevel: TikTokPrivacyLevel;
  allowComment?: boolean;
  allowDuet?: boolean;
  allowStitch?: boolean;
  discloseVideoContent?: boolean;
  discloseYourBrand?: boolean;
  discloseBrandedContent?: boolean;
}

export interface TikTokUploadInitResponse {
  message?: string;
  status?: string;
  history_id?: number;
  history_ids?: number[];
  channel_count?: number;
}

export interface TikTokUploadHistoryRecord {
  id: number;
  status: 'pending' | 'processing' | 'completed' | 'failed' | string;
  error_message?: string | null;
  platform_video_id?: string | null;
}

type TikTokUploadHistoryEnvelope = {
  data?: TikTokUploadHistoryRecord;
};

function isValidChannelSummary(ch: unknown): ch is TikTokChannelSummary {
  if (!ch || typeof ch !== 'object') return false;
  const id = (ch as TikTokChannelSummary).id;
  return typeof id === 'number' && id > 0;
}

/** Map TikTok privacy enum to legacy `mode` field where the API still expects it. */
export function tikTokPrivacyLevelToLegacyMode(
  level: TikTokPrivacyLevel
): 'public' | 'private' | 'schedule' {
  switch (level) {
    case 'PUBLIC_TO_EVERYONE':
      return 'public';
    case 'SELF_ONLY':
      return 'private';
    case 'MUTUAL_FOLLOW_FRIENDS':
      // Legacy upload API doesn't support a `friends` mode.
      // Keep this conservative so visibility never becomes broader than user intent.
      return 'private';
    case 'FOLLOWER_OF_CREATOR':
      return 'private';
    default:
      return 'private';
  }
}

class TikTokPublishService {
  /**
   * Returns latest TikTok share payload, or null when no linked channel (`data: null`).
   */
  async getLatestTikTokShareData(): Promise<LatestTikTokShareData | null> {
    try {
      const response = await api.get<LatestTikTokApiEnvelope>('/channels/latest-tiktok');
      const envelope = response.data.data;
      if (envelope == null) {
        return null;
      }
      if (!isValidChannelSummary(envelope.channel)) {
        return null;
      }
      return {
        channel: envelope.channel,
        creator_information: envelope.creator_information,
        creator_query_error: envelope.creator_query_error,
      };
    } catch (err) {
      const status = (err as AxiosError)?.response?.status;
      if (status === 404) {
        return null;
      }
      throw err;
    }
  }

  async disconnectTikTokChannel(channelId: number): Promise<void> {
    await api.delete(`/channels/${channelId}`);
  }

  async uploadVideo(
    videoFile: File,
    payload: TikTokPublishRequest
  ): Promise<TikTokUploadInitResponse> {
    const formData = new FormData();
    formData.append('video_file', videoFile);
    const legacyMode = tikTokPrivacyLevelToLegacyMode(payload.privacyLevel);
    formData.append(
      'channels',
      JSON.stringify([
        {
          channel_id: payload.channelId,
          title: payload.title,
          description: payload.description ?? '',
          mode: payload.mode ?? legacyMode,
          privacy_level: payload.privacyLevel,
          allow_comment: payload.allowComment ?? false,
          allow_duet: payload.allowDuet ?? false,
          allow_stitch: payload.allowStitch ?? false,
          disclose_video_content: payload.discloseVideoContent ?? false,
          disclose_your_brand: payload.discloseYourBrand ?? false,
          disclose_branded_content: payload.discloseBrandedContent ?? false,
        },
      ])
    );

    const response = await api.post<{ data?: TikTokUploadInitResponse }>(
      '/upload/file',
      formData,
      {
        timeout: getUploadFileTimeoutMs(),
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      }
    );

    return response.data.data ?? {};
  }

  async getUploadHistoryById(uploadId: number): Promise<TikTokUploadHistoryRecord> {
    const response = await api.get<TikTokUploadHistoryEnvelope>(`/history/${uploadId}`);
    if (!response.data?.data) {
      throw new Error('Upload history record is unavailable');
    }
    return response.data.data;
  }
}

export const tiktokPublishService = new TikTokPublishService();

/** Response from GET /tiktok/auth/url (authenticated). */
export interface TikTokOAuthUrlPayload {
  url: string;
  state?: string;
}

/** Full URL to start TikTok OAuth (optional fallback if `GET /tiktok/auth/url` is unavailable). */
export function getTikTokOAuthConnectUrl(): string | null {
  const raw = import.meta.env.VITE_TIKTOK_CONNECT_URL;
  if (typeof raw !== 'string' || !raw.trim()) return null;
  return raw.trim();
}

/**
 * Preferred: backend-generated TikTok Login Kit URL (`GET /api/tiktok/auth/url`).
 * Falls back to `VITE_TIKTOK_CONNECT_URL` when the API call fails (e.g. offline mock).
 */
export async function resolveTikTokOAuthStartUrl(): Promise<string | null> {
  try {
    const response = await api.get<TikTokOAuthUrlPayload>('/tiktok/auth/url');
    const u = response.data?.url;
    if (typeof u === 'string' && u.trim()) {
      return u.trim();
    }
  } catch {
    // fall through to env
  }
  return getTikTokOAuthConnectUrl();
}

const TIKTOK_OAUTH_POPUP_FEATURES = 'width=600,height=700,scrollbars=yes,resizable=yes';

/** Opens the TikTok OAuth URL in a named popup window. Returns `null` if the browser blocked it. */
export function openTikTokOAuthPopupWindow(oauthUrl: string): Window | null {
  return window.open(oauthUrl, 'tiktok-oauth', TIKTOK_OAUTH_POPUP_FEATURES);
}

/**
 * Tracks an OAuth popup until it closes, posts `TIKTOK_OAUTH_COMPLETE`, or hits a safety timeout.
 * Does not resolve the OAuth flow itself — use with polling on `/channels/latest-tiktok` if needed.
 */
export function trackTikTokOAuthPopup(popup: Window): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.removeEventListener('message', onMessage);
      window.clearInterval(intervalId);
      window.clearTimeout(timeoutId);
      resolve();
    };

    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const data = event.data as { type?: string; success?: boolean } | null;
      if (data?.type === TIKTOK_OAUTH_COMPLETE_MESSAGE_TYPE) {
        try {
          if (popup && !popup.closed) {
            popup.close();
          }
        } catch {
          // ignore
        }
        finish();
      }
    };

    window.addEventListener('message', onMessage);

    const intervalId = window.setInterval(() => {
      if (popup.closed) {
        finish();
      }
    }, 400);

    const timeoutId = window.setTimeout(() => {
      try {
        if (popup && !popup.closed) {
          popup.close();
        }
      } catch {
        // ignore
      }
      finish();
    }, 5 * 60 * 1000);
  });
}

/**
 * Opens TikTok OAuth in a popup and resolves when the popup flow ends (for callers that only need open+track).
 * @returns whether the popup opened (`false` usually means the browser blocked it).
 */
export function openTikTokOAuthPopup(oauthUrl: string): Promise<boolean> {
  const popup = openTikTokOAuthPopupWindow(oauthUrl);
  if (!popup) {
    return Promise.resolve(false);
  }
  return trackTikTokOAuthPopup(popup).then(() => true);
}
