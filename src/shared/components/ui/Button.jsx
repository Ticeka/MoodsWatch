import React from 'react';
import './Button.css';

export function Button({ 
  children, 
  variant = 'primary', 
  size = 'md', 
  fullWidth = false, 
  icon = null,
  iconRight = null,
  className = '', 
  ...props 
}) {
  const classes = [
    'btn',
    `btn-${variant}`,
    `btn-${size}`,
    fullWidth ? 'btn-full' : '',
    className
  ].filter(Boolean).join(' ');

  return (
    <button className={classes} {...props}>
      {icon && <span className="btn-slot" aria-hidden="true">{icon}</span>}
      <span className="btn-text">{children}</span>
      {iconRight && <span className="btn-slot" aria-hidden="true">{iconRight}</span>}
    </button>
  );
}
