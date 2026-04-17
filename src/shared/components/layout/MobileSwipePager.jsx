import React, { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/features/auth/contexts/AuthContext';
import {
  BattleHubPage,
  DiscoverPage,
  HomePage,
  ProfilePage,
  WatchlistPage,
} from '@/app/router/lazyPages';

const ALL_ROUTES = [
  { key: 'home', path: '/', element: <HomePage />, requiresAuth: false },
  { key: 'discover', path: '/discover', element: <DiscoverPage />, requiresAuth: false },
  { key: 'battle', path: '/battle', element: <BattleHubPage />, requiresAuth: false },
  { key: 'watchlist', path: '/watchlist', element: <WatchlistPage />, requiresAuth: false },
  { key: 'profile', path: '/profile', element: <ProfilePage />, requiresAuth: true },
];

function pathToIndex(routes, pathname) {
  for (let i = 0; i < routes.length; i += 1) {
    const { path } = routes[i];
    if (path === '/') {
      if (pathname === '/') return i;
    } else if (pathname === path || pathname.startsWith(`${path}/`)) {
      return i;
    }
  }
  return -1;
}

function shouldIgnoreSwipeTarget(target) {
  if (!(target instanceof Element)) return true;
  let node = target;
  while (node && node !== document.body) {
    if (
      node.matches(
        'input, textarea, select, option, label, summary, [contenteditable="true"], [role="slider"], [role="textbox"], [data-swipe-nav-ignore]',
      )
    ) {
      return true;
    }
    const style = window.getComputedStyle(node);
    if ((style.overflowX === 'auto' || style.overflowX === 'scroll') && node.scrollWidth > node.clientWidth + 8) {
      return true;
    }
    node = node.parentElement;
  }
  return false;
}

export function MobileSwipePager() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();

  const routes = useMemo(
    () => ALL_ROUTES.filter((route) => !route.requiresAuth || user),
    [user],
  );

  const currentIndex = useMemo(() => {
    const i = pathToIndex(routes, location.pathname);
    return i === -1 ? 0 : i;
  }, [routes, location.pathname]);

  const [mounted, setMounted] = useState(() => new Set());
  const [animating, setAnimating] = useState(false);
  const [lastSyncedIndex, setLastSyncedIndex] = useState(currentIndex);

  const dragRef = useRef({ active: false, locked: null, startX: 0, startY: 0, deltaX: 0, targetIndex: null });
  const commitRef = useRef(null);
  const transitionEndRef = useRef(null);
  const slotRefs = useRef([]);
  const trackRef = useRef(null);
  const pagerRef = useRef(null);
  const viewportWidthRef = useRef(typeof window !== 'undefined' ? window.innerWidth : 0);
  const animatingRef = useRef(false);
  const currentIndexRef = useRef(currentIndex);

  const publishActiveScroll = useCallback((scrollTop) => {
    if (typeof window === 'undefined') return;
    window.__swipePagerScrollY = scrollTop;
    window.dispatchEvent(new CustomEvent('swipepagerscroll', { detail: { scrollTop } }));
  }, []);

  const applyTransformPx = useCallback((px) => {
    if (!trackRef.current) return;
    trackRef.current.style.transform = `translate3d(${px}px, 0, 0)`;
  }, []);

  const applyBaseTransform = useCallback(() => {
    const vw = viewportWidthRef.current || (typeof window !== 'undefined' ? window.innerWidth : 0);
    applyTransformPx(-currentIndexRef.current * vw);
  }, [applyTransformPx]);

  if (lastSyncedIndex !== currentIndex) {
    setLastSyncedIndex(currentIndex);
    if (animating) setAnimating(false);
  }

  useLayoutEffect(() => {
    animatingRef.current = animating;
    currentIndexRef.current = currentIndex;
  });

  // Keep transform in sync with currentIndex when not actively dragging/animating.
  useLayoutEffect(() => {
    if (dragRef.current.active || animatingRef.current) return;
    applyBaseTransform();
  }, [currentIndex, applyBaseTransform]);

  useEffect(() => {
    if (commitRef.current) {
      window.clearTimeout(commitRef.current);
      commitRef.current = null;
    }
    dragRef.current = { active: false, locked: null, startX: 0, startY: 0, deltaX: 0, targetIndex: null };
    const slot = slotRefs.current[currentIndex];
    publishActiveScroll(slot ? slot.scrollTop : 0);
  }, [currentIndex, publishActiveScroll]);

  useEffect(() => {
    const handleResize = () => {
      viewportWidthRef.current = window.innerWidth;
      if (!dragRef.current.active && !animatingRef.current) {
        applyBaseTransform();
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [applyBaseTransform]);

  useEffect(() => () => {
    if (commitRef.current) window.clearTimeout(commitRef.current);
    if (transitionEndRef.current && trackRef.current) {
      trackRef.current.removeEventListener('transitionend', transitionEndRef.current);
    }
  }, []);

  const mountIndex = useCallback((i) => {
    if (i < 0 || i >= routes.length) return;
    setMounted((prev) => {
      if (prev.has(i)) return prev;
      const next = new Set(prev);
      next.add(i);
      return next;
    });
  }, [routes.length]);

  const handleTouchStart = useCallback((event) => {
    if (event.touches.length !== 1) return;
    if (shouldIgnoreSwipeTarget(event.target)) return;

    if (commitRef.current) {
      window.clearTimeout(commitRef.current);
      commitRef.current = null;
    }
    if (transitionEndRef.current && trackRef.current) {
      trackRef.current.removeEventListener('transitionend', transitionEndRef.current);
      transitionEndRef.current = null;
    }
    if (animatingRef.current) setAnimating(false);

    const touch = event.touches[0];
    dragRef.current = {
      active: true,
      locked: null,
      startX: touch.clientX,
      startY: touch.clientY,
      deltaX: 0,
      targetIndex: null,
    };
  }, []);

  // Native touchmove — bypasses React re-render per frame for smooth drag.
  useEffect(() => {
    const node = pagerRef.current;
    if (!node) return undefined;

    const handleMove = (event) => {
      const state = dragRef.current;
      if (!state.active || event.touches.length !== 1) return;

      const touch = event.touches[0];
      const dx = touch.clientX - state.startX;
      const dy = touch.clientY - state.startY;
      const absX = Math.abs(dx);
      const absY = Math.abs(dy);

      if (!state.locked) {
        if (absX < 10 && absY < 10) return;
        state.locked = absX > absY * 1.15 ? 'x' : 'y';
      }
      if (state.locked !== 'x') return;

      const idx = currentIndexRef.current;
      const nextIndex = dx < 0 ? idx + 1 : idx - 1;
      const vw = viewportWidthRef.current || window.innerWidth;

      let dragX;
      if (nextIndex < 0 || nextIndex >= routes.length) {
        dragX = dx * 0.22;
        state.targetIndex = null;
      } else {
        if (state.targetIndex !== nextIndex) {
          state.targetIndex = nextIndex;
          mountIndex(nextIndex);
        }
        if (event.cancelable) event.preventDefault();
        dragX = Math.sign(dx) * Math.min(absX, vw);
      }

      state.deltaX = dragX;
      applyTransformPx(-idx * vw + dragX);
    };

    node.addEventListener('touchmove', handleMove, { passive: false });
    return () => node.removeEventListener('touchmove', handleMove);
  }, [mountIndex, routes.length, applyTransformPx]);

  const settleAnimated = useCallback((targetPx, onComplete) => {
    const track = trackRef.current;
    if (!track) {
      onComplete?.();
      return;
    }
    // Flush the class synchronously so CSS transition is armed before we change transform.
    flushSync(() => setAnimating(true));
    void track.offsetHeight;

    applyTransformPx(targetPx);

    const cleanup = () => {
      if (transitionEndRef.current) {
        track.removeEventListener('transitionend', transitionEndRef.current);
        transitionEndRef.current = null;
      }
      if (commitRef.current) {
        window.clearTimeout(commitRef.current);
        commitRef.current = null;
      }
      onComplete?.();
    };

    const handleEnd = (ev) => {
      if (ev && ev.target !== track) return;
      cleanup();
    };
    transitionEndRef.current = handleEnd;
    track.addEventListener('transitionend', handleEnd);
    commitRef.current = window.setTimeout(cleanup, 420);
  }, [applyTransformPx]);

  const handleTouchEnd = useCallback(() => {
    const state = dragRef.current;
    if (!state.active) return;
    dragRef.current.active = false;

    const vw = viewportWidthRef.current || window.innerWidth || 1;
    const idx = currentIndexRef.current;

    if (state.locked !== 'x') {
      applyTransformPx(-idx * vw);
      return;
    }

    const threshold = Math.min(vw * 0.22, 100);
    const shouldCommit =
      state.targetIndex !== null
      && state.targetIndex >= 0
      && state.targetIndex < routes.length
      && Math.abs(state.deltaX) >= threshold;

    if (shouldCommit) {
      const targetIndex = state.targetIndex;
      const targetPath = routes[targetIndex].path;
      settleAnimated(-targetIndex * vw, () => {
        navigate(targetPath);
        // Sync block + useLayoutEffect will finalize state + transform on next render.
      });
    } else {
      settleAnimated(-idx * vw, () => {
        setAnimating(false);
      });
    }
  }, [applyTransformPx, navigate, routes, settleAnimated]);

  const handleTouchCancel = useCallback(() => {
    const state = dragRef.current;
    if (!state.active) return;
    dragRef.current.active = false;
    const vw = viewportWidthRef.current || window.innerWidth || 1;
    settleAnimated(-currentIndexRef.current * vw, () => setAnimating(false));
  }, [settleAnimated]);

  const handleSlotScroll = useCallback((index) => (event) => {
    if (index !== currentIndex) return;
    publishActiveScroll(event.currentTarget.scrollTop);
  }, [currentIndex, publishActiveScroll]);

  if (location.pathname.startsWith('/profile') && !user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return (
    <div
      ref={pagerRef}
      className={`mobile-swipe-pager${animating ? ' is-animating' : ''}`}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchCancel}
    >
      <div
        ref={trackRef}
        className="mobile-swipe-pager-track"
        style={{ width: `${routes.length * 100}%` }}
      >
        {routes.map((route, i) => {
          const isActive = i === currentIndex;
          const shouldRender = i === currentIndex || mounted.has(i);
          const flexBasis = `${100 / routes.length}%`;
          return (
            <div
              key={route.key}
              className={`mobile-swipe-pager-slot${isActive ? ' is-active' : ''}`}
              ref={(el) => { slotRefs.current[i] = el; }}
              aria-hidden={!isActive}
              style={{ flex: `0 0 ${flexBasis}` }}
              onScroll={handleSlotScroll(i)}
            >
              {shouldRender ? (
                <Suspense fallback={<div className="mobile-swipe-pager-fallback" />}>
                  {route.element}
                </Suspense>
              ) : (
                <div className="mobile-swipe-pager-fallback" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
