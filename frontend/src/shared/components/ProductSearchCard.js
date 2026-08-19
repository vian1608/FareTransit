import React from 'react';
import SupportCallCTA from './SupportCallCTA';
import './ProductSearchCard.css';

function ProductSearchCard({
  theme = 'flights',
  eyebrow,
  title,
  trustIcon = 'fas fa-shield-alt',
  trustText,
  showCallSupport = true,
  children,
  className = ''
}) {
  return (
    <div className={`product-search-card product-search-card--${theme} ${className}`.trim()}>
      {(eyebrow || title || trustText || showCallSupport) && (
        <div className="product-search-card__heading">
          <div className="product-search-card__heading-copy">
            {eyebrow && <span className="product-search-card__eyebrow">{eyebrow}</span>}
            {title && <h2>{title}</h2>}
          </div>
          {showCallSupport ? (
            <SupportCallCTA theme={theme} mode="card" />
          ) : trustText ? (
            <div className="product-search-card__trust-note">
              <i className={trustIcon} aria-hidden="true" />
              <span>{trustText}</span>
            </div>
          ) : null}
        </div>
      )}
      <div className="product-search-card__body">{children}</div>
    </div>
  );
}

export default ProductSearchCard;
