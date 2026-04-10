import React, { useEffect, useState } from 'react';

export function Chip({ active, onClick, disabled, children, color }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
        padding: '0.45rem 0.85rem', borderRadius: 999, cursor: disabled ? 'not-allowed' : 'pointer',
        fontSize: '0.82rem', fontWeight: 700, whiteSpace: 'nowrap',
        border: `1.5px solid ${active ? (color || 'var(--primary-500)') : 'var(--border-default)'}`,
        background: active ? `color-mix(in srgb, ${color || 'var(--primary-500)'} 14%, transparent)` : 'var(--bg-primary)',
        color: active ? (color || 'var(--primary-700)') : 'var(--text-secondary)',
        transition: 'all 0.15s ease', opacity: disabled ? 0.5 : 1,
      }}
    >
      {children}
    </button>
  );
}

export function Stepper({ value, onChange, min, max, disabled, step = 1 }) {
  const [draft, setDraft] = useState(String(value));

  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  const commitValue = (rawValue) => {
    const trimmed = String(rawValue ?? '').trim();
    if (!trimmed) {
      setDraft(String(value));
      return;
    }

    const numericValue = Number(trimmed);
    if (!Number.isFinite(numericValue)) {
      setDraft(String(value));
      return;
    }

    const nextValue = Math.min(max, Math.max(min, Math.round(numericValue)));
    setDraft(String(nextValue));
    onChange(nextValue);
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0, borderRadius: 'var(--radius-lg)', border: '1.5px solid var(--border-default)', overflow: 'hidden', background: 'var(--bg-primary)' }}>
      <button type="button" onClick={() => onChange(Math.max(min, value - step))} disabled={disabled || value <= min}
        style={{ width: 36, height: 38, border: 'none', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '1.1rem', fontWeight: 700 }}>-</button>
      <input
        type="number"
        inputMode="numeric"
        value={draft}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={(event) => commitValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.currentTarget.blur();
          }
          if (event.key === 'Escape') {
            setDraft(String(value));
            event.currentTarget.blur();
          }
        }}
        aria-label="Number input"
        style={{
          width: 72,
          height: 38,
          border: 'none',
          borderLeft: '1px solid var(--border-default)',
          borderRight: '1px solid var(--border-default)',
          background: 'transparent',
          color: 'var(--text-primary)',
          textAlign: 'center',
          fontWeight: 700,
          fontSize: '0.95rem',
          outline: 'none',
          padding: '0 0.4rem',
          MozAppearance: 'textfield',
        }}
      />
      <button type="button" onClick={() => onChange(Math.min(max, value + step))} disabled={disabled || value >= max}
        style={{ width: 36, height: 38, border: 'none', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '1.1rem', fontWeight: 700 }}>+</button>
    </div>
  );
}

export function Toggle({ checked, onChange, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      disabled={disabled}
      style={{
        width: 44, height: 24, borderRadius: 999, border: 'none', cursor: disabled ? 'not-allowed' : 'pointer',
        background: checked ? 'var(--primary-500)' : 'var(--bg-tertiary)',
        position: 'relative', transition: 'background 0.2s', flexShrink: 0, opacity: disabled ? 0.5 : 1,
      }}
    >
      <span style={{
        position: 'absolute', top: 3, left: checked ? 23 : 3,
        width: 18, height: 18, borderRadius: '50%',
        background: 'white', transition: 'left 0.2s',
        boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
      }} />
    </button>
  );
}

export function Section({ title, children }) {
  return (
    <div style={{
      background: 'linear-gradient(180deg, color-mix(in srgb, var(--paper-tint) 96%, transparent), color-mix(in srgb, var(--bg-elevated) 98%, transparent))',
      border: '1px solid color-mix(in srgb, var(--ink-900) 8%, transparent)',
      borderRadius: 24, padding: 'var(--space-6)',
    }}>
      <p style={{ margin: '0 0 var(--space-4)', fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-tertiary)' }}>
        {title}
      </p>
      {children}
    </div>
  );
}
