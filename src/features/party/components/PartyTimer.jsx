import React, { useEffect, useState } from 'react';

export const PartyTimer = React.memo(function PartyTimer({
  targetTimeMs = 0,
  intervalMs = 250,
  children,
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!targetTimeMs) {
      return undefined;
    }

    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, intervalMs);

    return () => {
      window.clearInterval(timer);
    };
  }, [intervalMs, targetTimeMs]);

  const msLeft = targetTimeMs ? Math.max(0, targetTimeMs - now) : 0;

  return children({
    msLeft,
    now,
  });
});
