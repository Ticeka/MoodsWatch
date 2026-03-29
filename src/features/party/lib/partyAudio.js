let sharedPartyAudioContext = null;

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
