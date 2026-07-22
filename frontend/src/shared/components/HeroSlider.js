import React, { useState, useEffect, useCallback } from 'react';
import ServiceNav from './ServiceNav';
import { SUPPORT_PHONE_HREF } from '../constants/supportContact';
import './HeroSlider.css';

const ROTATE_MS = 5000;

function HeroSlider({ slides, variant, serviceNavActive, inquiryHref = '#inquiry', offerTag }) {
  const [current, setCurrent] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const count = slides.length;

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
    slides.forEach((item) => {
      const src = item.image || item.backgroundImage;
      if (src) {
        const img = new Image();
        img.src = src;
      }
    });
  }, [slides]);

  if (count === 0) return null;

  const slide = slides[current];
  const btnPrefix = variant === 'rail' ? 'amtrak' : 'flights';

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
        {slides.map((item, index) => (
          <div
            key={item.id}
            className={`hero-slider__slide${item.type === 'image' ? ' hero-slider__slide--photo' : ''}${
              index === current ? ' hero-slider__slide--active' : ''
            }`}
            aria-hidden={index !== current}
          >
            {item.type === 'content' ? (
              <>
                {item.backgroundImage ? (
                  <img
                    src={item.backgroundImage}
                    alt=""
                    className="hero-slider__slide-img hero-slider__slide-img--intro"
                    loading="eager"
                    decoding="async"
                    aria-hidden="true"
                  />
                ) : null}
                <div
                  className={
                    item.backgroundImage
                      ? 'hero-slider__slide-bg hero-slider__slide-bg--intro'
                      : 'hero-slider__slide-bg hero-slider__slide-bg--gradient'
                  }
                />
              </>
            ) : (
              <>
                <img
                  src={item.image}
                  alt={item.alt}
                  className="hero-slider__slide-img"
                  loading="eager"
                  decoding="async"
                />
                <div className="hero-slider__slide-bg hero-slider__slide-bg--overlay" />
                {item.caption && (
                  <p className="hero-slider__slide-caption">{item.caption}</p>
                )}
              </>
            )}
          </div>
        ))}
      </div>

      <div className="container hero-slider__ui">
        <ServiceNav active={serviceNavActive} />

        <div className="hero-slider__main">
          {slide.type === 'content' ? (
            <div key={slide.id} className="hero-slider__content">
              <p className="hero-slider__eyebrow">{slide.eyebrow}</p>
              <h1>{slide.title}</h1>
              <p className="hero-slider__lead">{slide.lead}</p>
              {slide.showActions && (
                <div className="hero-slider__actions">
                  <a href={inquiryHref} className={`${btnPrefix}-btn ${btnPrefix}-btn--primary`}>
                    Request a Quote
                  </a>
                  <a href={SUPPORT_PHONE_HREF} className={`${btnPrefix}-btn ${btnPrefix}-btn--outline`}>
                    <i className="fas fa-phone" aria-hidden="true" />
                    Customer Support
                  </a>
                </div>
              )}
            </div>
          ) : (
            <div key={slide.id} className="hero-slider__content hero-slider__content--image">
              <h2 className="hero-slider__image-title">{slide.caption}</h2>
            </div>
          )}

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
