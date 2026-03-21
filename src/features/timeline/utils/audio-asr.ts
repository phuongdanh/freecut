export function createAudioContext({ sampleRate }: { sampleRate?: number } = {}): AudioContext {
	const AudioContextConstructor =
		window.AudioContext ||
		(window as typeof window & { webkitAudioContext?: typeof AudioContext })
			.webkitAudioContext;

	return new AudioContextConstructor(sampleRate ? { sampleRate } : undefined);
}

/**
 * Preprocessing for ASR:
 * - decode with AudioContext configured to 16kHz
 * - output mono Float32Array
 * - use sqrt(2) scaling when merging stereo channels
 */
export async function processAudioForASR({
	buffer,
}: {
	buffer: ArrayBuffer;
}): Promise<Float32Array> {
	const audioContext = createAudioContext({ sampleRate: 16_000 });

	try {
		const audioBuffer = await audioContext.decodeAudioData(buffer.slice(0));

		if (audioBuffer.numberOfChannels === 2) {
			const scalingFactor = Math.sqrt(2);
			const left = audioBuffer.getChannelData(0);
			const right = audioBuffer.getChannelData(1);
			const merged = new Float32Array(left.length);

			for (let i = 0; i < audioBuffer.length; i++) {
				merged[i] = (scalingFactor * ((left[i] ?? 0) + (right[i] ?? 0))) / 2;
			}

			return merged;
		}

		const mono = audioBuffer.getChannelData(0);
		return new Float32Array(mono);
	} finally {
		await audioContext.close();
	}
}

/**
 * Convert a Float32Array PCM audio buffer to a WAV Blob.
 */
export function float32ToWav(samples: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  const writeString = (view: DataView, offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };

  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, 1, true); // Mono channel
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // Byte rate
  view.setUint16(32, 2, true); // Block align
  view.setUint16(34, 16, true); // Bits per sample
  writeString(view, 36, 'data');
  view.setUint32(40, samples.length * 2, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++, offset += 2) {
    const val = samples[i] ?? 0;
    const s = Math.max(-1, Math.min(1, val));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }

  return new Blob([view], { type: 'audio/wav' });
}
