import React from 'react';
import japanFlag from '@/assets/japan.png';
import koreanFlag from '@/assets/korean.png';

const FLAG_ASSETS = {
  JP: japanFlag,
  KR: koreanFlag,
};

export function TypeIcon({ option, className = '' }) {
  const flagAsset = option?.countryCode ? FLAG_ASSETS[option.countryCode] : null;

  if (flagAsset) {
    return <img src={flagAsset} alt="" aria-hidden="true" className={className} />;
  }

  return <span className={className}>{option?.icon}</span>;
}
