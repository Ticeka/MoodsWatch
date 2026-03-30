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
