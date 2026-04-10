import React from 'react';

export function BattleVsIcon({ size = 20, className = '', title, ...props }) {
  const labelId = title ? `battle-vs-icon-${String(size).replace(/[^a-zA-Z0-9_-]/g, '')}` : undefined;

  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role={title ? 'img' : 'presentation'}
      aria-hidden={title ? undefined : 'true'}
      aria-labelledby={labelId}
      {...props}
    >
      {title ? <title id={labelId}>{title}</title> : null}
      <path
        d="M4.5 6.75L8.2 17.25L11.9 6.75"
        stroke="currentColor"
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M18.8 7.3C18.1 6.84 17.26 6.58 16.4 6.55C14.86 6.55 13.8 7.35 13.8 8.6C13.8 9.72 14.67 10.26 16.22 10.74C17.6 11.16 18.2 11.58 18.2 12.64C18.2 13.83 17.14 14.7 15.62 14.7C14.74 14.7 13.88 14.43 13.1 13.9"
        stroke="currentColor"
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M12.4 6.1L11.4 7.1"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        opacity="0.62"
      />
      <path
        d="M11.8 16.9L10.8 17.9"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        opacity="0.62"
      />
    </svg>
  );
}
