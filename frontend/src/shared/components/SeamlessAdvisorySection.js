import React, { useState, useRef } from 'react';
import './SeamlessAdvisorySection.css';

const CONTENT = {
  rail: {
    title: 'Seamless Direct Rail Advisory',
    subtitle:
      'Our passenger support model delivers ticket clarity and stress-free logistics in three easy steps.',
    steps: [
      {
        title: 'Specify Route',
        text: 'Enter your departure station, arrival station, and travel dates in the inquiry form above.',
      },
      {
        title: 'Call the Desk',
        text: 'Use our hotline to speak directly with a rail logistics advisor for Amtrak and national rail options.',
      },
      {
        title: 'Travel with Advisory',
        text: 'Receive coordinated options by email and 24/7 disruption guidance through your day of travel.',
      },
    ],
  },
  flight: {
    title: 'Seamless Direct Flight Advisory',
    subtitle:
      'Our passenger support model delivers itinerary clarity and stress-free air logistics in three easy steps.',
    steps: [
      {
        title: 'Specify Itinerary',
        text: 'Enter your origin, destination, travel dates, and cabin preferences in the inquiry form above.',
      },
      {
        title: 'Call the Desk',
        text: 'Use our hotline to speak directly with a flight logistics advisor for domestic and international routing.',
      },
      {
        title: 'Travel with Advisory',
        text: 'Receive coordinated options by email and 24/7 disruption guidance through your day of travel.',
      },
    ],
  },
};

function SeamlessAdvisorySection({ variant = 'rail' }) {
  const { title, subtitle, steps } = CONTENT[variant] || CONTENT.rail;
  const [activeStep, setActiveStep] = useState(0);
  const touchStartX = useRef(null);
  const touchEndX = useRef(null);

  const goTo = (index) => {
    if (index < 0 || index >= steps.length) return;
    setActiveStep(index);
  };

  const handleTouchStart = (e) => {
    touchStartX.current = e.changedTouches[0].clientX;
  };

  const handleTouchEnd = (e) => {
    touchEndX.current = e.changedTouches[0].clientX;
    const diff = touchStartX.current - touchEndX.current;
    if (Math.abs(diff) > 40) {
      if (diff > 0) goTo(activeStep + 1); // swipe left → next
      else goTo(activeStep - 1);           // swipe right → prev
    }
  };

  return (
    <section className={`seamless-advisory seamless-advisory--${variant}`}>
      <div className="container">
        <div className="seamless-advisory__heading">
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>

        {/* ── Desktop: grid layout ── */}
        <div className="seamless-advisory__steps seamless-advisory__steps--desktop">
          {steps.map((step, index) => (
            <div className="seamless-advisory__step" key={step.title}>
              <div className="seamless-advisory__number">{index + 1}</div>
              <h3>{step.title}</h3>
              <p>{step.text}</p>
            </div>
          ))}
        </div>

        {/* ── Mobile: single-card swipe carousel ── */}
        <div
          className="seamless-advisory__carousel"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          <div className="seamless-advisory__carousel-card">
            <div className="seamless-advisory__number">{activeStep + 1}</div>
            <h3>{steps[activeStep].title}</h3>
            <p>{steps[activeStep].text}</p>
          </div>

          {/* Dot navigation */}
          <div className="seamless-advisory__carousel-dots">
            {steps.map((_, i) => (
              <button
                key={i}
                className={`seamless-advisory__dot${i === activeStep ? ' seamless-advisory__dot--active' : ''}`}
                onClick={() => goTo(i)}
                aria-label={`Step ${i + 1}`}
              />
            ))}
          </div>

          {/* Step counter hint */}
          <p className="seamless-advisory__swipe-hint">
            Step {activeStep + 1} of {steps.length} · Swipe to navigate
          </p>
        </div>
      </div>
    </section>
  );
}

export default SeamlessAdvisorySection;
