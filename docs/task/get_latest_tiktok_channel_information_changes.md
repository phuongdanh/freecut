# GET `/api/channels/latest-tiktok` — response change & frontend integration

This note describes the **current** contract for the latest TikTok channel endpoint and how the frontend should use **`creator_information`** (live data from TikTok’s [Query Creator Info](https://developers.tiktok.com/doc/content-posting-api-reference-query-creator-info) API) instead of hardcoded labels, options, or defaults.

---

## Endpoint

| Item | Value |
|------|--------|
| Method | `GET` |
| Path | `/api/channels/latest-tiktok` |
| Auth | Required: `Authorization: Bearer <JWT>` |

---

## Response shape (`{ data: ... }`)

The handler wraps the payload in the standard `{ data: ... }` envelope (see `utils.RespondOkWithData`).

### 1) No TikTok channel for this user

```json
{ "data": null }
```

### 2) User has a TikTok channel row

`data` is an object with:

| Field | Type | Description |
|-------|------|-------------|
| `channel` | object | Same safe channel fields as other channel APIs (no access/refresh tokens). Includes `expired_in`, schedule JSON as array, etc. |
| `creator_information` | object \| omitted | Present when TikTok returned **success** (`error.code === "ok"`). Mirrors TikTok `data` from Query Creator Info. |
| `creator_query_error` | object \| omitted | Present when TikTok returned **HTTP 200** but **business failure** (`error.code !== "ok"`), e.g. rate limit, posting temporarily blocked. |

Example (success):

```json
{
  "data": {
    "channel": {
      "id": 1,
      "user_id": 1,
      "platform_type": "tiktok",
      "name": "...",
      "platform_page_id": "...",
      "expired_in": 12345,
      "default_schedule_times": [],
      "...": "..."
    },
    "creator_information": {
      "creator_avatar_url": "https://...",
      "creator_username": "tiktok",
      "creator_nickname": "TikTok Official",
      "privacy_level_options": [
        "PUBLIC_TO_EVERYONE",
        "MUTUAL_FOLLOW_FRIENDS",
        "SELF_ONLY"
      ],
      "comment_disabled": false,
      "duet_disabled": false,
      "stitch_disabled": true,
      "max_video_post_duration_sec": 300
    }
  }
}
```

Example (TikTok business error — still 200 from our API; channel may still be present):

```json
{
  "data": {
    "channel": { "...": "..." },
    "creator_query_error": {
      "code": "spam_risk_too_many_posts",
      "message": "...",
      "log_id": "..."
    }
  }
}
```

If the server fails before building this payload (DB error, decrypt error, TikTok HTTP/network error), the client receives **5xx** and a generic error body — not this structured shape.

---

## `creator_information` fields (for UI binding)

| JSON field | Type | UI usage |
|------------|------|----------|
| `creator_nickname` | string | **Primary label** for “which TikTok account will receive the post” (TikTok UX: show nickname so users are aware). You can also show `creator_username` as secondary text if useful. |
| `creator_username` | string | Stable handle-style id; optional subtitle next to nickname. |
| `creator_avatar_url` | string | Avatar image URL (TikTok states TTL ~2 hours — refresh by re-fetching this endpoint if the image breaks). |
| `privacy_level_options` | string[] | **Only** allowed values for the Visibility / privacy dropdown. Values are **enum strings** from TikTok (see below). |
| `comment_disabled` | boolean | If `true`, user has disabled comments in TikTok settings — **disable and grey out** the “Allow comment” control (do not allow enabling). |
| `duet_disabled` | boolean | If `true`, disable/grey **Duet** (video only; see photo note below). |
| `stitch_disabled` | boolean | If `true`, disable/grey **Stitch** (video only). |
| `max_video_post_duration_sec` | number | **Max duration** for video posts for this creator — validate selected/local video length **before** starting upload; block or warn if longer. |

### Privacy enum strings → user-facing labels

Map in the UI (i18n keys recommended); **do not invent options** — only show entries present in `privacy_level_options`:

| Value | Typical label (EN) |
|-------|---------------------|
| `PUBLIC_TO_EVERYONE` | Public |
| `MUTUAL_FOLLOW_FRIENDS` | Friends / mutual follows |
| `SELF_ONLY` | Private |
| `FOLLOWER_OF_CREATOR` | Followers (private accounts) |

Public vs private TikTok accounts yield **different** option sets; the array from the API is authoritative.

---

## TikTok UX rules the frontend must follow

These align with TikTok’s Content Posting guidelines (not optional for app review):

1. **Refresh creator info on the upload screen** — Call this endpoint when rendering the “Post to TikTok” flow so privacy options and interaction flags are current.
2. **Account awareness** — Show **`creator_nickname`** prominently (and optionally username) so the user knows which account receives the upload.
3. **Privacy** — Build the privacy dropdown **only** from `privacy_level_options`. **No default selection** — user must choose explicitly (TikTok requirement).
4. **Interactions (Comment / Duet / Stitch)** — **None checked by default.** If `*_disabled` is `true`, keep the checkbox **disabled and visually greyed** (user cannot override TikTok account settings here). For **photo** posts, TikTok says Duet/Stitch are N/A — show only **Comment** in that flow.
5. **Posting blocked** — If `creator_query_error` is present, **stop** the publish flow and show `message` / `code` (and optionally `log_id` for support). User should try again later when appropriate.
6. **Duration** — Enforce `max_video_post_duration_sec` against the video asset before upload.

---

## Suggested TypeScript types (frontend)

```ts
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
  log_id: string;
}

export interface LatestTikTokChannelData {
  channel: /* reuse existing Channel type from channelService */;
  creator_information?: TikTokCreatorInformation;
  creator_query_error?: TikTokCreatorQueryError;
}
```

---

## Migration from hardcoded UI

1. Replace static privacy options with `data.creator_information.privacy_level_options` mapped to labels.
2. Replace static account string with `creator_nickname` (+ optional `creator_username`).
3. Drive Comment/Duet/Stitch availability from `comment_disabled` / `duet_disabled` / `stitch_disabled` (grey out when `true`).
4. Validate video duration against `max_video_post_duration_sec`.
5. Handle `data === null` (no linked TikTok channel), missing `creator_information` (e.g. token missing server-side), and `creator_query_error` (block post + message).

---

## References

- TikTok: [Query Creator Info](https://developers.tiktok.com/doc/content-posting-api-reference-query-creator-info)
- Backend: `backend/internal/channel/controller.go` (`latestTikTokChannelPayload`), `backend/pkg/tiktok_api.go` (`CreatorInfo`), `backend/actions/channel.go` (`GetLatestTikTokChannelForUser`)
