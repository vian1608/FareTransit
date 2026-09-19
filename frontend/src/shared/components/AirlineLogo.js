import React, { useEffect, useMemo, useState } from 'react';
import { getAirlineLogoCandidates, getAirlineName } from '../utils/airlineCatalog';
import './AirlineLogo.css';

const publicUrl = process.env.PUBLIC_URL || '';

function AirlineLogo({ carrierCode, slug, airlineName = '', className = '', src = '', size }) {
  const code = String(carrierCode || '').trim().toUpperCase();
  const [failedSources, setFailedSources] = useState(0);

  const sources = useMemo(() => {
    const normalizedSlug = String(slug || '').trim();
    return [
      src,
      ...getAirlineLogoCandidates(code),
      normalizedSlug ? `${publicUrl}/assets/logos/${normalizedSlug}.png` : '',
      normalizedSlug ? `${publicUrl}/logo/${normalizedSlug}.png` : ''
    ].filter((value, index, list) => value && list.indexOf(value) === index);
  }, [code, slug, src]);

  useEffect(() => setFailedSources(0), [code, slug, src]);

  const label = airlineName || getAirlineName(code);
  const handleError = () => setFailedSources(n => n + 1);

  if (failedSources >= sources.length) {
    return (
      <span className={`airline-logo-fallback ${className}`} aria-label={`${label} logo unavailable`} role="img" style={size ? { width: size, height: size } : undefined}>
        <i className="fas fa-plane" aria-hidden="true" />
      </span>
    );
  }

  return (
    <img
      src={sources[failedSources]}
      alt={`${label} logo`}
      className={`airline-logo-img ${className}`}
      loading="lazy"
      width={size}
      height={size}
      style={size ? { width: size, height: size, objectFit: 'contain' } : undefined}
      onError={handleError}
    />
  );
}

export default AirlineLogo;
