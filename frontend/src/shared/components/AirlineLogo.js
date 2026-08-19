import React, { useMemo, useState } from 'react';
import './AirlineLogo.css';

const publicUrl = process.env.PUBLIC_URL || '';

function AirlineLogo({ slug, airlineName = 'Airline', className = '', src = '' }) {
  const [failedSources, setFailedSources] = useState(0);

  const sources = useMemo(() => {
    const normalizedSlug = String(slug || '').trim();
    return [
      src,
      normalizedSlug ? `${publicUrl}/assets/logos/${normalizedSlug}.png` : '',
      normalizedSlug ? `${publicUrl}/logo/${normalizedSlug}.png` : '',
    ].filter(Boolean);
  }, [slug, src]);

  const handleError = () => {
    setFailedSources((n) => n + 1);
  };

  if (failedSources >= sources.length) {
    return (
      <span className={`airline-logo-fallback ${className}`} aria-label={`${airlineName} logo unavailable`} role="img">
        <i className="fas fa-plane" aria-hidden="true" />
      </span>
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
