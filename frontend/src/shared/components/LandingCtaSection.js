import React from 'react';
import { Link } from 'react-router-dom';
import { SUPPORT_PHONE_DISPLAY, SUPPORT_PHONE_HREF } from '../constants/supportContact';
import './LandingCtaSection.css';

function LandingCtaSection({
  primaryText = 'Search Flights',
  primaryHref = '/#inquiry',
  secondaryText = `Call ${SUPPORT_PHONE_DISPLAY}`,
  secondaryHref = SUPPORT_PHONE_HREF,
  title,
  description,
  variant = 'hero', // 'hero' or 'footer'
}) {
  return (
    <div className={`landing-cta-container landing-cta-container--${variant}`}>
      {title || description ? (
        <div className="landing-cta-header">
          {title && <h2 className="landing-cta-title">{title}</h2>}
          {description && <p className="landing-cta-desc">{description}</p>}
        </div>
      ) : null}

      <div className="landing-cta-actions">
        {primaryHref.startsWith('/') ? (
          <Link to={primaryHref} className="landing-btn landing-btn--primary">
            {primaryText}
          </Link>
        ) : (
          <a href={primaryHref} className="landing-btn landing-btn--primary">
            {primaryText}
          </a>
        )}

        <a href={secondaryHref} className="landing-btn landing-btn--secondary">
          <i className="fas fa-phone-alt" aria-hidden="true"></i>
          <span>{secondaryText}</span>
        </a>
      </div>
    </div>
  );
}

export default LandingCtaSection;
