import React, { useRef, useEffect, useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import './RouteSlider.css';

const AUTO_INTERVAL_MS = 4500;

const RouteSlider = ({ routes, btnClassPrefix = 'flights', autoPlay = true }) => {
  const sliderRef = useRef(null);
  const [isPaused, setIsPaused] = useState(false);

  const scrollByCard = useCallback((direction) => {
    const el = sliderRef.current;
    if (!el) return;
    const card = el.querySelector('.route-slider-card');
    const gap = 24;
    const amount = (card?.offsetWidth || 280) + gap;
    const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 8;
    const atStart = el.scrollLeft <= 8;

    if (direction > 0 && atEnd) {
      el.scrollTo({ left: 0, behavior: 'smooth' });
      return;
    }
    if (direction < 0 && atStart) {
      el.scrollTo({ left: el.scrollWidth, behavior: 'smooth' });
      return;
    }
    el.scrollBy({ left: direction * amount, behavior: 'smooth' });
  }, []);

  useEffect(() => {
    if (!autoPlay || isPaused || routes.length < 2) return undefined;
    const timer = setInterval(() => scrollByCard(1), AUTO_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [autoPlay, isPaused, routes.length, scrollByCard]);

  return (
    <div
      className="route-slider-container"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onFocus={() => setIsPaused(true)}
      onBlur={() => setIsPaused(false)}
    >
      <div className="route-slider-header">
        <h2 className={`${btnClassPrefix}-section__title route-slider-title`}>Famous Routes</h2>
        <div className="route-slider-controls">
          <button
            type="button"
            className="slider-control-btn"
            onClick={() => scrollByCard(-1)}
            aria-label="Scroll left"
          >
            <i className="fas fa-chevron-left" aria-hidden="true" />
          </button>
          <button
            type="button"
            className="slider-control-btn"
            onClick={() => scrollByCard(1)}
            aria-label="Scroll right"
          >
            <i className="fas fa-chevron-right" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="route-slider" ref={sliderRef}>
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
              <Link
                to={route.path}
                className={`${btnClassPrefix}-btn ${btnClassPrefix}-btn--cta route-slider-cta`}
              >
                Request a Quote
              </Link>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
};

export default RouteSlider;
