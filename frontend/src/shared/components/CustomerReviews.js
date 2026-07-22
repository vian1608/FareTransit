import React, { useState, useEffect, useCallback } from 'react';
import './CustomerReviews.css';

const ROTATE_MS = 2000;

function CustomerReviews({ reviews, variant = 'flights' }) {
  const [current, setCurrent] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const count = reviews.length;

  const goTo = useCallback(
    (index) => {
      if (count === 0) return;
      const next = ((index % count) + count) % count;
      setCurrent(next);
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

  if (count === 0) return null;

  const review = reviews[current];
  const isFlights = variant === 'flights';

  return (
    <section
      className={`customer-reviews customer-reviews--${variant}`}
      aria-labelledby={`reviews-heading-${variant}`}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onFocus={() => setIsPaused(true)}
      onBlur={() => setIsPaused(false)}
    >
      <div className="container">
        <div className="customer-reviews__header">
          <h2 id={`reviews-heading-${variant}`} className="customer-reviews__title">
            Customer Reviews
          </h2>
          <p className="customer-reviews__subtitle">
            {isFlights
              ? 'Real experiences from clients who relied on our air logistics advisory.'
              : 'Real experiences from travelers who used our Amtrak and national rail consultancy.'}
          </p>
        </div>

        <div className="customer-reviews__carousel">
          <button
            type="button"
            className="customer-reviews__arrow customer-reviews__arrow--prev"
            onClick={goPrev}
            aria-label="Previous review"
          >
            <i className="fas fa-chevron-left" aria-hidden="true" />
          </button>

          <article
            className="customer-reviews__card"
            key={review.id}
            aria-live="polite"
            aria-atomic="true"
          >
            <div className="customer-reviews__quote-icon" aria-hidden="true">
              <i className="fas fa-quote-left" />
            </div>
            <div className="customer-reviews__rating" aria-label={`${review.rating} out of 5 stars`}>
              {Array.from({ length: review.rating }, (_, i) => (
                <i key={i} className="fas fa-star" aria-hidden="true" />
              ))}
            </div>
            <p className="customer-reviews__text">&ldquo;{review.text}&rdquo;</p>
            <div className="customer-reviews__meta">
              <div className="customer-reviews__author">
                <span className="customer-reviews__name">{review.name}</span>
                <span className="customer-reviews__location">{review.location}</span>
              </div>
              <span className="customer-reviews__experience">{review.experience}</span>
              <span className="customer-reviews__date">{review.date}</span>
            </div>
          </article>

          <button
            type="button"
            className="customer-reviews__arrow customer-reviews__arrow--next"
            onClick={goNext}
            aria-label="Next review"
          >
            <i className="fas fa-chevron-right" aria-hidden="true" />
          </button>
        </div>

        <div className="customer-reviews__dots" role="tablist" aria-label="Review navigation">
          {reviews.map((item, index) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={index === current}
              aria-label={`View review ${index + 1} of ${count}`}
              className={`customer-reviews__dot ${index === current ? 'customer-reviews__dot--active' : ''}`}
              onClick={() => goTo(index)}
            />
          ))}
        </div>

        <p className="customer-reviews__counter" aria-hidden="true">
          {current + 1} / {count}
        </p>
      </div>
    </section>
  );
}

export default CustomerReviews;
