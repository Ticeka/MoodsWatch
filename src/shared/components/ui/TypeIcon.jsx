import React from 'react';
import ReactCountryFlag from 'react-country-flag';

export function TypeIcon({ option, size = '1.2em' }) {
  if (option?.countryCode) {
    return (
      <ReactCountryFlag
        countryCode={option.countryCode}
        style={{ width: size, height: size }}
        title={option.countryCode}
      />
    );
  }
  return <span>{option?.icon}</span>;
}
