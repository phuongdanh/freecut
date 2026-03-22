/**
 * Absolute URLs for the tools API (`{VITE_API_URL}/api/tools/...`).
 * No Vite proxy — same host logic as `src/services/api.ts` (`API_BASE_URL`).
 * Safe for workers (no axios/localStorage); uses `import.meta.env` only.
 */
function toolsApiBase(): string {
  const raw = import.meta.env.VITE_API_URL ?? 'http://localhost:8080';
  return `${String(raw).replace(/\/$/, '')}/api/tools`;
}

/** e.g. `get-download-url` → `http://localhost:8080/api/tools/get-download-url` */
export function toolsApiUrl(segment: string): string {
  const s = segment.replace(/^\//, '');
  return `${toolsApiBase()}/${s}`;
}
