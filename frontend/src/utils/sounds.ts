import { useSettingsStore } from '../stores/settings';

/** WebAudio beeps for POS feedback — no audio files needed. */
let ctx: AudioContext | null = null;
function audio(): AudioContext | null {
  try {
    if (!ctx) ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    return ctx;
  } catch { return null; }
}

function tone(freq: number, ms: number, type: OscillatorType = 'sine', gain = 0.12, when = 0) {
  const ac = audio();
  if (!ac) return;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  g.gain.value = gain;
  osc.connect(g).connect(ac.destination);
  const t = ac.currentTime + when;
  osc.start(t);
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + ms / 1000);
  osc.stop(t + ms / 1000 + 0.02);
}

function enabled() {
  return useSettingsStore.getState().settings.scan_sounds !== 'false';
}

export const sounds = {
  scanOk: () => { if (enabled()) tone(1320, 90, 'square', 0.08); },
  scanError: () => { if (enabled()) { tone(220, 160, 'sawtooth', 0.1); tone(180, 160, 'sawtooth', 0.1, 0.09); } },
  saleComplete: () => { if (enabled()) { tone(880, 100); tone(1100, 100, 'sine', 0.12, 0.1); tone(1320, 160, 'sine', 0.12, 0.2); } },
  cashDrawer: () => { if (enabled()) tone(660, 60, 'triangle', 0.1); },
};
