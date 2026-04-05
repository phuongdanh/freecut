export type AudioFadeHandle = 'in' | 'out';

export function getAudioFadePixels(
  fadeSeconds: number | undefined,
  fps: number,
  frameToPixels: (frame: number) => number,
  maxWidth: number,
): number {
  if (!fadeSeconds || fadeSeconds <= 0) return 0;
  return Math.max(0, Math.min(maxWidth, frameToPixels(fadeSeconds * fps)));
}

export function getAudioFadeSecondsFromOffset(params: {
  handle: AudioFadeHandle;
  clipWidthPixels: number;
  pointerOffsetPixels: number;
  fps: number;
  maxDurationFrames: number;
  pixelsToFrame: (pixels: number) => number;
}): number {
  const offsetPixels = Math.max(0, Math.min(params.clipWidthPixels, params.pointerOffsetPixels));
  const fadePixels = params.handle === 'in'
    ? offsetPixels
    : params.clipWidthPixels - offsetPixels;
  const fadeFrames = Math.max(0, Math.min(params.maxDurationFrames, params.pixelsToFrame(fadePixels)));
  return fadeFrames / params.fps;
}

export function getAudioFadeHandleLeft(params: {
  handle: AudioFadeHandle;
  clipWidthPixels: number;
  fadePixels: number;
}): number {
  const x = params.handle === 'in'
    ? params.fadePixels
    : params.clipWidthPixels - params.fadePixels;
  return Math.max(0, Math.min(params.clipWidthPixels, x));
}
