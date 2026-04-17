import React from 'react';
import PropTypes from 'prop-types';

/**
 * Label + select pattern shared across list/filter surfaces.
 */
export function SortSelect({ value, onChange, label, className = 'results-sorter', children, selectAriaLabel }) {
  const classes = ['results-sorter', className].filter(Boolean).join(' ');

  return (
    <label className={classes}>
      <span>{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label={selectAriaLabel || label}
      >
        {children}
      </select>
    </label>
  );
}

SortSelect.propTypes = {
  value: PropTypes.string.isRequired,
  onChange: PropTypes.func.isRequired,
  label: PropTypes.string.isRequired,
  className: PropTypes.string,
  children: PropTypes.node.isRequired,
  selectAriaLabel: PropTypes.string,
};
