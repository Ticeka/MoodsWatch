import React, { useState } from 'react';

export function StarRating({ score, onRate, disabled = false, label = 'Rate' }) {
  const [hovered, setHovered] = useState(null);
  const currentStars = score != null ? Math.round(score / 10) : 0;
  const activeStars = hovered ?? currentStars;

  const handleClick = (star) => {
    if (disabled) return;
    onRate(star === currentStars ? null : star * 10);
  };

  return (
    <div className="star-rating-row" aria-label={label}>
      <div
        className="star-rating-stars"
        onMouseLeave={() => setHovered(null)}
        role="group"
        aria-label={label}
      >
        {Array.from({ length: 10 }, (_, i) => i + 1).map((star) => (
          <button
            key={star}
            type="button"
            disabled={disabled}
            className={`star-btn${star <= activeStars ? ' star-btn--filled' : ''}`}
            onClick={() => handleClick(star)}
            onMouseEnter={() => !disabled && setHovered(star)}
            aria-label={`${star} / 10`}
            aria-pressed={star === currentStars}
          >
            ★
          </button>
        ))}
      </div>
      <span className={`star-score${currentStars > 0 ? ' star-score--active' : ''}`}>
        {currentStars > 0 ? `${currentStars}/10` : '—'}
      </span>
    </div>
  );
}
