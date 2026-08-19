import React, { useState, useEffect, useCallback } from 'react';
import ServiceNav from './ServiceNav';
import './HeroSlider.css';
import './HeroSliderMobileOverrides.css';

const ROTATE_MS = 5000;

function HeroSlider({ slides, variant = 'flights', serviceNavActive, offerTag }) {
  const [current, setCurrent] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const count = slides ? slides.length : 0;

  const goTo = useCallback(
    (index) => {
      if (count === 0) return;
      setCurrent(((index % count) + count) % count);
    },
    [count]
  );

  const goNext = useCallback(() => goTo(current + 1), [current, goTo]);
  const goPrev = useCallback(() => goTo(current - 1), [current, goTo]);

  useEffect(() => {
    if (count <= 1 || isPaused) return undefined;
    const timer = setInterval(() => {
      setCurrent((prev) => (prev + 1) % count);
    }, ROTATE_MS);
    return () => clearInterval(timer);
  }, [count, isPaused]);

  useEffect(() => {
    if (!slides) return;
    slides.forEach((item) => {
      const src = item.image || item.backgroundImage;
      if (src) {
        const img = new Image();
        img.src = src;
      }
    });
  }, [slides]);

  if (!slides || count === 0) return null;

  const slide = slides[current];
  const isHotelSection = serviceNavActive === 'hotels';
  const isCarSection = serviceNavActive === 'cars';
  const defaultEyebrow = isHotelSection
    ? 'FareTransit — Hotel Booking Assistance'
    : isCarSection
      ? 'FareTransit — Car Rental Search'
      : variant === 'rail'
        ? 'FareTransit — Rail Travel Support'
        : 'FareTransit — Flight Booking Assistance';

  const defaultChips = isHotelSection ? [
    { icon: 'fas fa-user-shield', label: 'Human Hotel Assistance' },
    { icon: 'fas fa-hotel', label: 'Clear Stay Comparison' },
    { icon: 'fas fa-users', label: 'Guest & Family Support' },
    { icon: 'fas fa-lock', label: 'Secure Reservation Process' },
  ] : isCarSection ? [
    { icon: 'fas fa-headset', label: 'Human Rental Support' },
    { icon: 'fas fa-tags', label: 'Clear Rental Pricing' },
    { icon: 'fas fa-car-side', label: 'Wide Vehicle Selection' },
    { icon: 'fas fa-shield-alt', label: 'Secure Supplier Handoff' },
  ] : variant === 'rail' ? [
    { icon: 'fas fa-user-shield', label: 'Human Rail Assistance' },
    { icon: 'fas fa-tasks', label: 'Clear Train Comparison' },
    { icon: 'fas fa-users', label: 'Family Travel Support' },
    { icon: 'fas fa-lock', label: 'Secure Reservation Process' },
  ] : [
    { icon: 'fas fa-user-shield', label: 'Human Travel Assistance' },
    { icon: 'fas fa-tasks', label: 'Clear Flight Comparison' },
    { icon: 'fas fa-users', label: 'Family Booking Support' },
    { icon: 'fas fa-lock', label: 'Secure Reservation Process' },
  ];

  return (
    <div className="hero-stack">
      <section
        className={`hero-slider hero-slider--${variant}`}
        aria-roledescription="carousel"
        aria-label="Hero highlights"
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
        onFocus={() => setIsPaused(true)}
        onBlur={() => setIsPaused(false)}
      >
        <div className="hero-slider__slides" aria-live="polite">
          {slides.map((item, index) => {
            const bgSrc = item.image || item.backgroundImage;
            return (
              <div
                key={item.id}
                className={`hero-slider__slide${index === current ? ' hero-slider__slide--active' : ''}`}
                aria-hidden={index !== current}
              >
                {bgSrc && (
                  <img
                    src={bgSrc}
                    alt={item.alt || ''}
                    className="hero-slider__slide-img"
                    loading="eager"
                    decoding="async"
                  />
                )}
                <div className="hero-slider__slide-bg hero-slider__slide-bg--overlay" />
              </div>
            );
          })}
        </div>

        <div className="container hero-slider__ui">
          <ServiceNav active={serviceNavActive} />

          <div className="hero-slider__main">
            <div className="hero-slider__content-wrapper">
              <div key={slide.id} className="hero-slider__content">
                <p className="hero-slider__eyebrow">{slide.eyebrow || defaultEyebrow}</p>
                <h1 className="hero-slider__title">{slide.title || slide.caption}</h1>
                {(slide.lead || slide.description) && (
                  <p className="hero-slider__lead">
                    <span className="hero-lead-desktop">{slide.lead || slide.description}</span>
                    <span className="hero-lead-mobile">{slide.mobileLead || slide.lead || slide.description}</span>
                  </p>
                )}

                <div className="hero-trust-statement">
                  <div className="hero-trust-badges">
                    {defaultChips.map((chip, idx) => (
                      <span
                        key={idx}
                        className={`hero-trust-badge ${idx === 1 || idx === 2 ? 'hero-trust-badge--desktop-only' : ''}`}
                      >
                        <i className={chip.icon} aria-hidden="true" /> {chip.label}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="hero-slider__controls">
              <button
                type="button"
                className="hero-slider__arrow"
                onClick={goPrev}
                aria-label="Previous slide"
              >
                <i className="fas fa-chevron-left" aria-hidden="true" />
              </button>
              <div className="hero-slider__dots" role="tablist" aria-label="Hero slides">
                {slides.map((item, index) => (
                  <button
                    key={item.id}
                    type="button"
                    role="tab"
                    aria-selected={index === current}
                    aria-label={`Slide ${index + 1} of ${count}`}
                    className={`hero-slider__dot ${index === current ? 'hero-slider__dot--active' : ''}`}
                    onClick={() => goTo(index)}
                  />
                ))}
              </div>
              <button
                type="button"
                className="hero-slider__arrow"
                onClick={goNext}
                aria-label="Next slide"
              >
                <i className="fas fa-chevron-right" aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
      </section>

      {offerTag && (
        <aside className={`hero-offer-bar hero-offer-bar--${variant}`} aria-label="Current offer">
          <div className="container hero-offer-bar__inner">
            <div className="hero-offer-bar__tag" role="note">
              <span className="hero-offer-bar__label">{offerTag.label}</span>
              <span className="hero-offer-bar__highlight">{offerTag.highlight}</span>
              <span className="hero-offer-bar__detail">{offerTag.detail}</span>
            </div>
          </div>
        </aside>
      )}
    </div>
  );
}

export default HeroSlider;
