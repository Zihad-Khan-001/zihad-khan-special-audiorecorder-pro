// Lossless PCM WAV encoder (16-bit / 24-bit), RIFF container.

export function encodeWavBytes(
  channels: Float32Array[],
  sampleRate: number,
  bitDepth: 16 | 24
): Uint8Array {
  const numCh = channels.length;
  const n = channels[0].length;
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numCh * bytesPerSample;
  const dataSize = n * blockAlign;
  const buffer = new ArrayBuffer(44 + dataSize);
  const v = new DataView(buffer);

  const wstr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i));
  };
  wstr(0, 'RIFF');
  v.setUint32(4, 36 + dataSize, true);
  wstr(8, 'WAVE');
  wstr(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, numCh, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * blockAlign, true);
  v.setUint16(32, blockAlign, true);
  v.setUint16(34, bitDepth, true);
  wstr(36, 'data');
  v.setUint32(40, dataSize, true);

  let off = 44;
  if (bitDepth === 16) {
    for (let i = 0; i < n; i++) {
      for (let c = 0; c < numCh; c++) {
        let s = channels[c][i];
        s = s < -1 ? -1 : s > 1 ? 1 : s;
        v.setInt16(off, Math.round(s * 32767), true);
        off += 2;
      }
    }
  } else {
    for (let i = 0; i < n; i++) {
      for (let c = 0; c < numCh; c++) {
        let s = channels[c][i];
        s = s < -1 ? -1 : s > 1 ? 1 : s;
        const val = Math.round(s * 8388607);
        v.setUint8(off, val & 0xff);
        v.setUint8(off + 1, (val >> 8) & 0xff);
        v.setUint8(off + 2, (val >> 16) & 0xff);
        off += 3;
      }
    }
  }
  return new Uint8Array(buffer);
}
