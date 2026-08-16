export function fmtMs(ms: number, showMs = true): string {
  const t = Math.max(0, Math.floor(ms));
  const m = Math.floor(t / 60000);
  const s = Math.floor((t % 60000) / 1000);
  const rem = t % 1000;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return showMs ? `${mm}:${ss}.${String(rem).padStart(3, '0')}` : `${mm}:${ss}`;
}

export function fmtDb(v: number, digits = 1): string {
  const s = v > 0 ? '+' : '';
  return `${s}${v.toFixed(digits)} dB`;
}
