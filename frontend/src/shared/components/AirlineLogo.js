import React, { useState } from 'react';
import './AirlineLogo.css';

const publicUrl = process.env.PUBLIC_URL || '';

function AirlineLogo({ slug, airlineName, className = '' }) {
  const [failedSources, setFailedSources] = useState(0);

  const sources = [
    `${publicUrl}/assets/logos/${slug}.png`,
    `${publicUrl}/logo/${slug}.png`,
  ];

  const handleError = () => {
    setFailedSources((n) => n + 1);
  };

  if (failedSources >= sources.length) {
    return (
      <div className={`airline-logo-fallback ${className}`} aria-label={`${airlineName} logo`}>
        <span className="airline-logo-fallback__text">{airlineName}</span>
      </div>
    );
  }

  return (
    <img
      src={sources[failedSources]}
      alt={`${airlineName} logo`}
      className={`airline-logo-img ${className}`}
      onError={handleError}
    />
  );
}

export default AirlineLogo;
