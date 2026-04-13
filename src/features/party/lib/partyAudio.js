let sharedPartyAudioContext = null;
let sharedPartyVoteAmbient = null;

export function getPartyAudioContext() {
  if (typeof window === 'undefined') {
    return null;
  }

  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextCtor) {
    return null;
  }

  if (!sharedPartyAudioContext || sharedPartyAudioContext.state === 'closed') {
    sharedPartyAudioContext = new AudioContextCtor();
  }

  return sharedPartyAudioContext;
}

export async function resumePartyAudioContext() {
  const audioContext = getPartyAudioContext();
  if (!audioContext || audioContext.state !== 'suspended') {
    return audioContext;
  }

  try {
    await audioContext.resume();
  } catch {
    return audioContext;
  }

  return audioContext;
}

function getPartyVoteAmbientTargetGain(volume = 85) {
  const normalizedVolume = Math.min(100, Math.max(0, Number(volume) || 0)) / 100;
  return Math.max(0.0001, normalizedVolume * 0.06);
}

function stopPartyVoteAmbientNodes(context, ambient, fadeOutMs = 320) {
  if (!context || !ambient) {
    return;
  }

  const now = context.currentTime;
  const fadeOutSec = Math.max(0.08, Number(fadeOutMs || 320) / 1000);

  try {
    ambient.masterGain.gain.cancelScheduledValues(now);
    ambient.masterGain.gain.setValueAtTime(Math.max(ambient.masterGain.gain.value, 0.0001), now);
    ambient.masterGain.gain.exponentialRampToValueAtTime(0.0001, now + fadeOutSec);
  } catch {
    // Ignore Web Audio scheduling edge cases.
  }

  ambient.oscillators.forEach((oscillator) => {
    try {
      oscillator.stop(now + fadeOutSec + 0.05);
    } catch {
      // Ignore stop-on-stopped-node errors.
    }
  });
  try {
    ambient.lfo.stop(now + fadeOutSec + 0.05);
  } catch {
    // Ignore stop-on-stopped-node errors.
  }

  window.setTimeout(() => {
    try {
      ambient.masterGain.disconnect();
      ambient.filter.disconnect();
      ambient.lfoGain.disconnect();
      ambient.lfo.disconnect();
    } catch {
      // ignore disconnect errors
    }
  }, Math.ceil((fadeOutSec + 0.1) * 1000));
}

export function stopPartyVoteAmbient(fadeOutMs = 320) {
  const audioContext = getPartyAudioContext();
  if (!audioContext || !sharedPartyVoteAmbient) {
    sharedPartyVoteAmbient = null;
    return;
  }

  stopPartyVoteAmbientNodes(audioContext, sharedPartyVoteAmbient, fadeOutMs);
  sharedPartyVoteAmbient = null;
}

export function startPartyVoteAmbient(volume = 85, phase = 'vote') {
  const audioContext = getPartyAudioContext();
  if (!audioContext) {
    return null;
  }

  const ambientPhase = phase === 'reveal' ? 'reveal' : 'vote';
  const targetGain = getPartyVoteAmbientTargetGain(volume);

  if (sharedPartyVoteAmbient?.phase === ambientPhase) {
    const now = audioContext.currentTime;
    try {
      sharedPartyVoteAmbient.masterGain.gain.cancelScheduledValues(now);
      sharedPartyVoteAmbient.masterGain.gain.setValueAtTime(Math.max(sharedPartyVoteAmbient.masterGain.gain.value, 0.0001), now);
      sharedPartyVoteAmbient.masterGain.gain.exponentialRampToValueAtTime(targetGain, now + 0.2);
    } catch {
      // ignore
    }
    return sharedPartyVoteAmbient;
  }

  if (sharedPartyVoteAmbient) {
    stopPartyVoteAmbientNodes(audioContext, sharedPartyVoteAmbient, 220);
    sharedPartyVoteAmbient = null;
  }

  const now = audioContext.currentTime;
  const masterGain = audioContext.createGain();
  const filter = audioContext.createBiquadFilter();
  const lfo = audioContext.createOscillator();
  const lfoGain = audioContext.createGain();
  const voices = ambientPhase === 'reveal'
    ? [
        { frequency: 196.0, type: 'triangle', gain: 0.42, detune: -5 },
        { frequency: 246.94, type: 'sine', gain: 0.24, detune: 4 },
        { frequency: 293.66, type: 'sine', gain: 0.2, detune: 7 },
      ]
    : [
        { frequency: 174.61, type: 'triangle', gain: 0.42, detune: -6 },
        { frequency: 220.0, type: 'sine', gain: 0.24, detune: 3 },
        { frequency: 261.63, type: 'sine', gain: 0.18, detune: 8 },
      ];

  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(ambientPhase === 'reveal' ? 1080 : 860, now);
  filter.Q.setValueAtTime(0.8, now);

  masterGain.gain.setValueAtTime(0.0001, now);
  masterGain.gain.exponentialRampToValueAtTime(targetGain, now + 0.45);

  lfo.type = 'sine';
  lfo.frequency.setValueAtTime(ambientPhase === 'reveal' ? 0.18 : 0.12, now);
  lfoGain.gain.setValueAtTime(ambientPhase === 'reveal' ? 120 : 80, now);

  lfo.connect(lfoGain);
  lfoGain.connect(filter.frequency);
  masterGain.connect(filter);
  filter.connect(audioContext.destination);

  const oscillators = voices.map((voice) => {
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.type = voice.type;
    oscillator.frequency.setValueAtTime(voice.frequency, now);
    oscillator.detune.setValueAtTime(voice.detune || 0, now);

    gainNode.gain.setValueAtTime(voice.gain, now);
    oscillator.connect(gainNode);
    gainNode.connect(masterGain);
    oscillator.start(now);

    return oscillator;
  });

  lfo.start(now);

  sharedPartyVoteAmbient = {
    phase: ambientPhase,
    masterGain,
    filter,
    lfo,
    lfoGain,
    oscillators,
  };

  return sharedPartyVoteAmbient;
}

// ─── Title Guess Sound Effects ────────────────────────────────────────────────

let titleGuessTickInterval = null;
let titleGuessTickMode = null; // 'normal' | 'urgent' | null
let titleGuessSuspenseNodes = null;

function scheduleEnvelope(gainNode, ctx, now, attackSec, sustainGain, decaySec) {
  gainNode.gain.setValueAtTime(0.0001, now);
  gainNode.gain.linearRampToValueAtTime(sustainGain, now + attackSec);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, now + attackSec + decaySec);
}

function playTickOnce(ctx, volume, urgent) {
  if (!ctx || ctx.state !== 'running') return;
  const vol = Math.min(1, (Number(volume) || 85) / 100) * (urgent ? 0.28 : 0.14);
  const now = ctx.currentTime;
  const freq = urgent ? 1200 : 900;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'square';
  osc.frequency.setValueAtTime(freq, now);
  scheduleEnvelope(gain, ctx, now, 0.002, vol, 0.055);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.07);
}

/** Short ping when a clue card reveals */
export function playTitleGuessClueReveal(volume = 85) {
  void resumePartyAudioContext().then((ctx) => {
    if (!ctx || ctx.state !== 'running') return;
    const vol = Math.min(1, (Number(volume) || 85) / 100) * 0.18;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.exponentialRampToValueAtTime(1320, now + 0.06);
    scheduleEnvelope(gain, ctx, now, 0.005, vol, 0.18);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.22);
  });
}

/**
 * Start ticking countdown. Pass mode='normal' (10s) or mode='urgent' (3s).
 * Only restarts the interval when mode actually changes, preventing the
 * "reset every 500ms" bug where the interval never fires.
 */
export function startTitleGuessTick(mode = 'normal', volume = 85) {
  if (titleGuessTickMode === mode) return; // already running in this mode
  stopTitleGuessTick();
  titleGuessTickMode = mode;

  void resumePartyAudioContext().then((ctx) => {
    if (!ctx || ctx.state !== 'running') return;
    // If mode changed while resuming, bail
    if (titleGuessTickMode !== mode) return;

    const urgent = mode === 'urgent';
    const intervalMs = urgent ? 500 : 1000;

    playTickOnce(ctx, volume, urgent);
    titleGuessTickInterval = setInterval(() => playTickOnce(ctx, volume, urgent), intervalMs);
  });
}

export function stopTitleGuessTick() {
  if (titleGuessTickInterval !== null) {
    clearInterval(titleGuessTickInterval);
    titleGuessTickInterval = null;
  }
  titleGuessTickMode = null;
}

/** Rising suspense drone for the reveal delay */
export function startTitleGuessSuspense(durationMs = 1400, volume = 85) {
  stopTitleGuessSuspense();
  void resumePartyAudioContext().then((ctx) => {
    if (!ctx || ctx.state !== 'running') return;
    const vol = Math.min(1, (Number(volume) || 85) / 100) * 0.09;
    const durSec = durationMs / 1000;
    const now = ctx.currentTime;

    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const master = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    osc1.type = 'sawtooth';
    osc1.frequency.setValueAtTime(110, now);
    osc1.frequency.linearRampToValueAtTime(220, now + durSec);

    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(165, now);
    osc2.frequency.linearRampToValueAtTime(330, now + durSec);

    master.gain.setValueAtTime(0.0001, now);
    master.gain.linearRampToValueAtTime(vol, now + 0.05);
    master.gain.setValueAtTime(vol, now + durSec - 0.08);
    master.gain.linearRampToValueAtTime(0.0001, now + durSec);

    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(300, now);
    filter.frequency.linearRampToValueAtTime(900, now + durSec);
    filter.Q.setValueAtTime(2, now);

    osc1.connect(master);
    osc2.connect(master);
    master.connect(filter);
    filter.connect(ctx.destination);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + durSec + 0.05);
    osc2.stop(now + durSec + 0.05);

    titleGuessSuspenseNodes = { osc1, osc2, master, filter };
  });
}

export function stopTitleGuessSuspense() {
  if (!titleGuessSuspenseNodes) return;
  const ctx = getPartyAudioContext();
  if (ctx) {
    const now = ctx.currentTime;
    try {
      titleGuessSuspenseNodes.master.gain.cancelScheduledValues(now);
      titleGuessSuspenseNodes.master.gain.setValueAtTime(
        Math.max(titleGuessSuspenseNodes.master.gain.value, 0.0001), now
      );
      titleGuessSuspenseNodes.master.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
      titleGuessSuspenseNodes.osc1.stop(now + 0.1);
      titleGuessSuspenseNodes.osc2.stop(now + 0.1);
    } catch { /* ignore */ }
  }
  titleGuessSuspenseNodes = null;
}

/** Ascending arpeggio — correct answer */
export function playTitleGuessCorrect(volume = 85) {
  void resumePartyAudioContext().then((ctx) => {
    if (!ctx || ctx.state !== 'running') return;
    const vol = Math.min(1, (Number(volume) || 85) / 100) * 0.22;
    const now = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5 E5 G5 C6
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);
      const t = now + i * 0.09;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.linearRampToValueAtTime(vol * (1 - i * 0.12), t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.25);
    });
  });
}

/** Descending thud — wrong answer */
export function playTitleGuessWrong(volume = 85) {
  void resumePartyAudioContext().then((ctx) => {
    if (!ctx || ctx.state !== 'running') return;
    const vol = Math.min(1, (Number(volume) || 85) / 100) * 0.2;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(180, now);
    osc.frequency.exponentialRampToValueAtTime(60, now + 0.22);
    scheduleEnvelope(gain, ctx, now, 0.005, vol, 0.28);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(400, now);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.32);
  });
}

/** Streak chime — higher pitch per streak level */
export function playTitleGuessStreak(streakCount = 1, volume = 85) {
  void resumePartyAudioContext().then((ctx) => {
    if (!ctx || ctx.state !== 'running') return;
    const vol = Math.min(1, (Number(volume) || 85) / 100) * 0.2;
    const now = ctx.currentTime;
    const baseFreq = 523.25 * Math.pow(1.12, Math.min(streakCount - 1, 6));
    [1, 1.25, 1.5].forEach((mult, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(baseFreq * mult, now);
      const t = now + i * 0.07;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.linearRampToValueAtTime(vol, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.35);
    });
  });
}
