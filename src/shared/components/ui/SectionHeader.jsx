import React from 'react';
import PropTypes from 'prop-types';

/**
 * Reusable section heading row — title left, optional action right.
 * Renders the `.section-header-row` pattern used across Home, Profile, TitleDetail.
 */
export function SectionHeader({ title, subtitle, action, level = 'h2', className = '' }) {
  const Tag = level;
  return (
    <div className={`section-header-row${className ? ` ${className}` : ''}`}>
      <div>
        <Tag className="section-heading">{title}</Tag>
        {subtitle}
      </div>
      {action}
    </div>
  );
}

SectionHeader.propTypes = {
  title: PropTypes.node.isRequired,
  /** Pass a pre-styled ReactNode (e.g. <p className="editorial-subtitle">…</p>) */
  subtitle: PropTypes.node,
  /** Right-side slot: link, sort toolbar, badge, etc. */
  action: PropTypes.node,
  level: PropTypes.oneOf(['h1', 'h2', 'h3', 'h4']),
  className: PropTypes.string,
};
