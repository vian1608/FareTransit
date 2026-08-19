import React, { useRef, useEffect, useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import './RouteSlider.css';

const AUTO_INTERVAL_MS = 4500;

const RouteSlider = ({ routes, btnClassPrefix = 'flights', autoPlay = true, title = 'Popular Flight Options' }) => {
  const sliderRef = useRef(null);
  const [isPaused, setIsPaused] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const scrollToIndex = useCallback((index) => {
    const el = sliderRef.current;
    if (!el || !routes.length) return;
    const cards = Array.from(el.querySelectorAll('.route-slider-card'));
    if (!cards.length) return;
    const nextIndex = ((index % cards.length) + cards.length) % cards.length;
    el.scrollTo({ left: cards[nextIndex].offsetLeft, behavior: 'smooth' });
    setActiveIndex(nextIndex);
  }, [routes.length]);

  const scrollByCard = useCallback((direction) => {
    scrollToIndex(activeIndex + direction);
  }, [activeIndex, scrollToIndex]);

  const handleScroll = useCallback(() => {
    const el = sliderRef.current;
    if (!el) return;
    const cards = Array.from(el.querySelectorAll('.route-slider-card'));
    if (!cards.length) return;

    const viewportCenter = el.scrollLeft + (el.clientWidth / 2);
    let nearestIndex = 0;
    let nearestDistance = Number.POSITIVE_INFINITY;

    cards.forEach((card, index) => {
      const cardCenter = card.offsetLeft + (card.offsetWidth / 2);
      const distance = Math.abs(cardCenter - viewportCenter);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = index;
      }
    });

    setActiveIndex(nearestIndex);
  }, []);

  useEffect(() => {
    if (!autoPlay || isPaused || routes.length < 2) return undefined;
    const timer = setInterval(() => scrollToIndex(activeIndex + 1), AUTO_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [autoPlay, isPaused, routes.length, activeIndex, scrollToIndex]);

  return (
    <div
      className="route-slider-container"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onFocus={() => setIsPaused(true)}
      onBlur={() => setIsPaused(false)}
    >
      <div className="route-slider-header">
        <h2 className={`${btnClassPrefix}-section__title route-slider-title`}>{title}</h2>
        <div className="route-slider-controls">
          <button type="button" className="slider-control-btn" onClick={() => scrollByCard(-1)} aria-label="Previous route">
            <i className="fas fa-chevron-left" aria-hidden="true" />
          </button>
          <button type="button" className="slider-control-btn" onClick={() => scrollByCard(1)} aria-label="Next route">
            <i className="fas fa-chevron-right" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="route-slider" ref={sliderRef} onScroll={handleScroll}>
        {routes.map((route) => (
          <article className="route-slider-card" key={route.path}>
            <div className="route-slider-img-container">
              <img
                src={route.image}
                alt=""
                loading="lazy"
                onError={(e) => {
                  e.currentTarget.src = `${process.env.PUBLIC_URL || ''}/images/flight_route_1.png`;
                }}
              />
            </div>
            <div className="route-slider-content">
              <h3>{route.title}</h3>
              <p>{route.desc}</p>
              <Link to={route.path} className={`${btnClassPrefix}-btn ${btnClassPrefix}-btn--cta route-slider-cta`}>
                Check Flight Options
              </Link>
            </div>
          </article>
        ))}
      </div>

      {routes.length > 1 && (
        <div className="route-slider-mobile-nav" aria-label="Route navigation controls">
          <button type="button" className="route-slider-mobile-arrow" onClick={() => scrollByCard(-1)} aria-label="Previous route">
            <i className="fas fa-chevron-left" aria-hidden="true" />
          </button>
          <div className="route-slider-mobile-dots" role="tablist" aria-label="Routes">
            {routes.map((route, index) => (
              <button
                key={route.path}
                type="button"
                role="tab"
                aria-selected={index === activeIndex}
                aria-label={`Route ${index + 1}: ${route.title}`}
                className={`route-slider-mobile-dot ${index === activeIndex ? 'route-slider-mobile-dot--active' : ''}`}
                onClick={() => scrollToIndex(index)}
              />
            ))}
          </div>
          <button type="button" className="route-slider-mobile-arrow" onClick={() => scrollByCard(1)} aria-label="Next route">
            <i className="fas fa-chevron-right" aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
};

export default RouteSlider;
