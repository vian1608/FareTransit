import React from 'react';
import { SUPPORT_PHONE_DISPLAY, SUPPORT_PHONE_HREF } from '../constants/supportContact';
import { analytics } from '../utils/analytics';
import './SupportCallCTA.css';

const COPY = {
  flights: {
    title: 'Prefer booking by phone?',
    subtitle: 'Talk to a flight specialist',
  },
  hotels: {
    title: 'Need help choosing a stay?',
    subtitle: 'Talk to a hotel specialist',
  },
  cars: {
    title: 'Need help with rental options?',
    subtitle: 'Talk to a rental specialist',
  },
};

function normalizeTheme(theme) {
  if (theme === 'hotels' || theme === 'cars') return theme;
  return 'flights';
}

export default function SupportCallCTA({
  theme = 'flights',
  mode = 'card',
  title,
  subtitle,
  className = '',
  compact = false,
}) {
  const resolvedTheme = normalizeTheme(theme);
  const copy = COPY[resolvedTheme];
  const resolvedTitle = title || copy.title;
  const resolvedSubtitle = subtitle || copy.subtitle;

  const handleClick = () => {
    analytics.trackCallCtaClicked(`${resolvedTheme}_${mode}`);
  };

  return (
    <a
      href={SUPPORT_PHONE_HREF}
      className={`support-call-cta support-call-cta--${resolvedTheme} support-call-cta--${mode} ${compact ? 'support-call-cta--compact' : ''} ${className}`.trim()}
      onClick={handleClick}
      aria-label={`Call FareTransit at ${SUPPORT_PHONE_DISPLAY}. ${resolvedTitle}`}
    >
      <span className="support-call-cta__icon" aria-hidden="true">
        <i className="fas fa-phone-alt" />
      </span>
      <span className="support-call-cta__copy">
        <strong>{resolvedTitle}</strong>
        <small>{resolvedSubtitle}</small>
      </span>
      <span className="support-call-cta__action">
        <strong>Call Now</strong>
        <span>{SUPPORT_PHONE_DISPLAY}</span>
      </span>
    </a>
  );
}
