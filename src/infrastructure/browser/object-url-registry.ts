const blobsByUrl = new Map<string, Blob>();

export function registerObjectUrl(url: string, blob: Blob): void {
  blobsByUrl.set(url, blob);
}

export function getObjectUrlBlob(url: string): Blob | null {
  return blobsByUrl.get(url) ?? null;
}

export function unregisterObjectUrl(url: string): void {
  blobsByUrl.delete(url);
}

export function clearObjectUrlRegistry(): void {
  blobsByUrl.clear();
}
