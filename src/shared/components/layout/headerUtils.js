export function scheduleWhenIdle(callback, timeout = 1500) {
  if (typeof window === 'undefined') {
    return () => {};
  }

  if (typeof window.requestIdleCallback === 'function') {
    const handle = window.requestIdleCallback(callback, { timeout });
    return () => window.cancelIdleCallback(handle);
  }

  const handle = window.setTimeout(callback, Math.min(timeout, 400));
  return () => window.clearTimeout(handle);
}

export function getAdultModeLabel(showAdult) {
  return showAdult ? '18+ ON' : '18+ OFF';
}
