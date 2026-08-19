import React, { useState, useRef } from 'react';
import analytics from '../utils/analytics';
import './HowFareTransitHelps.css';

const TABS = [
  { id: 'who_we_help', fullLabel: 'Who We Help', shortLabel: 'Who We Help' },
  { id: 'why_choose_us', fullLabel: 'Why Choose Us', shortLabel: 'Why Us' },
  { id: 'what_we_compare', fullLabel: 'What We Compare', shortLabel: 'We Compare' },
];

const TAB_DATA = {
  who_we_help: [
    {
      icon: 'fas fa-user-check',
      title: 'Personal Assistance',
      description: 'Personal help for travelers who prefer guidance instead of automated forms.',
    },
    {
      icon: 'fas fa-users',
      title: 'Family Booking',
      description: 'Dedicated support for booking flights for parents, relatives and friends.',
    },
    {
      icon: 'fas fa-route',
      title: 'Complex Routes',
      description: 'Expert help for multi-city travel, layovers and connecting flights.',
    },
    {
      icon: 'fas fa-suitcase-rolling',
      title: 'Fare & Baggage Rules',
      description: 'Clear explanations of baggage allowances and fare conditions.',
    },
  ],
  why_choose_us: [
    {
      icon: 'fas fa-headset',
      title: 'Personal Travel Assistance',
      description: 'Direct help comparing flights, layovers and route options.',
    },
    {
      icon: 'fas fa-heart',
      title: 'Support For Family Bookings',
      description: 'Support for booking flights for parents, relatives and friends.',
    },
    {
      icon: 'fas fa-balance-scale',
      title: 'More Than Just The Cheapest Fare',
      description: 'We evaluate connection times, total travel time and journey quality.',
    },
    {
      icon: 'fas fa-check-circle',
      title: 'Simple Reservation Experience',
      description: 'Transparent guidance and human support from search to confirmation.',
    },
  ],
  what_we_compare: [
    {
      icon: 'fas fa-plane-arrival',
      title: 'Number of Stops',
      description: 'Identifying routes with minimal layovers and comfortable transfers.',
    },
    {
      icon: 'fas fa-clock',
      title: 'Connection Duration',
      description: 'Ensuring adequate transfer time to make every connection comfortably.',
    },
    {
      icon: 'fas fa-exchange-alt',
      title: 'Airport Changes',
      description: 'Clear alerts for terminal transfers or airport changes.',
    },
    {
      icon: 'fas fa-stopwatch',
      title: 'Total Journey Time',
      description: 'Balancing flight duration, schedule convenience and comfort.',
    },
    {
      icon: 'fas fa-luggage-cart',
      title: 'Baggage Allowance',
      description: 'Checking included carry-on and checked bag limits for your fare.',
    },
    {
      icon: 'fas fa-shield-alt',
      title: 'Refund & Change Rules',
      description: 'Explaining ticket flexibility, cancellation fees and change terms.',
    },
    {
      icon: 'fas fa-sun',
      title: 'Departure & Arrival Times',
      description: 'Finding daytime flights to avoid inconvenient early or late arrivals.',
    },
    {
      icon: 'fas fa-wheelchair',
      title: 'Mobility Assistance',
      description: 'Requesting wheelchair handling and special airport assistance.',
    },
  ],
};

function HowFareTransitHelps() {
  const [activeTab, setActiveTab] = useState('who_we_help');
  const [cardIndex, setCardIndex] = useState(0);
  const touchStartX = useRef(null);

  const cards = TAB_DATA[activeTab] || [];

  const handleTabChange = (tabId) => {
    setActiveTab(tabId);
    setCardIndex(0);
    analytics.trackMobileHelpTabSelected(tabId);
    const firstCard = (TAB_DATA[tabId] || [])[0];
    if (firstCard) {
      analytics.trackMobileHelpCardViewed(tabId, firstCard.title, 0);
    }
  };

  const handlePrev = () => {
    const newIdx = (cardIndex - 1 + cards.length) % cards.length;
    setCardIndex(newIdx);
    if (cards[newIdx]) {
      analytics.trackMobileHelpCardViewed(activeTab, cards[newIdx].title, newIdx);
    }
  };

  const handleNext = () => {
    const newIdx = (cardIndex + 1) % cards.length;
    setCardIndex(newIdx);
    if (cards[newIdx]) {
      analytics.trackMobileHelpCardViewed(activeTab, cards[newIdx].title, newIdx);
    }
  };

  const handleTouchStart = (e) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e) => {
    if (touchStartX.current === null) return;
    const touchEndX = e.changedTouches[0].clientX;
    const diff = touchStartX.current - touchEndX;
    if (Math.abs(diff) > 40) {
      if (diff > 0) {
        handleNext();
      } else {
        handlePrev();
      }
    }
    touchStartX.current = null;
  };

  const currentCard = cards[cardIndex] || cards[0];

  return (
    <section className="how-helps-section" aria-label="How FareTransit Helps">
      <div className="container">
        <div className="how-helps-header">
          <h2>How FareTransit Helps</h2>
          <p className="how-helps-sub">
            Explore who we assist, why travelers choose us and what we review beyond price.
          </p>
        </div>

        {/* 3-Column Segmented Control Container */}
        <div className="how-helps-tablist" role="tablist" aria-label="Help categories">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                id={`tab-${tab.id}`}
                aria-selected={isActive}
                aria-controls={`panel-${tab.id}`}
                aria-label={tab.fullLabel}
                className={`how-helps-tab ${isActive ? 'how-helps-tab--active' : ''}`}
                onClick={() => handleTabChange(tab.id)}
              >
                <span className="tab-label-desktop">{tab.fullLabel}</span>
                <span className="tab-label-mobile">{tab.shortLabel}</span>
              </button>
            );
          })}
        </div>

        {/* Tab Panel & Manual Card Carousel */}
        <div
          id={`panel-${activeTab}`}
          role="tabpanel"
          aria-labelledby={`tab-${activeTab}`}
          className="how-helps-panel"
        >
          <div
            className="how-helps-carousel"
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >
            <div className="how-helps-card-stage">
              {currentCard && (
                <div key={`${activeTab}-${cardIndex}`} className="how-helps-card">
                  <div className="how-helps-icon">
                    <i className={currentCard.icon} aria-hidden="true" />
                  </div>
                  <h3>{currentCard.title}</h3>
                  <p>{currentCard.description}</p>
                  <div className="how-helps-card-counter">
                    {cardIndex + 1} of {cards.length}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Integrated Bottom Navigation Row */}
          <div className="how-helps-nav-row">
            <button
              type="button"
              className="how-helps-arrow how-helps-arrow--prev"
              onClick={handlePrev}
              aria-label="Previous card"
            >
              <i className="fas fa-chevron-left" aria-hidden="true" />
            </button>

            {/* Dots Pagination */}
            <div className="how-helps-dots" role="tablist" aria-label="Card pagination">
              {cards.map((cardItem, idx) => (
                <button
                  key={idx}
                  type="button"
                  role="tab"
                  aria-selected={idx === cardIndex}
                  aria-label={`Go to card ${idx + 1}: ${cardItem.title}`}
                  className={`how-helps-dot ${idx === cardIndex ? 'how-helps-dot--active' : ''}`}
                  onClick={() => {
                    setCardIndex(idx);
                    analytics.trackMobileHelpCardViewed(activeTab, cardItem.title, idx);
                  }}
                />
              ))}
            </div>

            <button
              type="button"
              className="how-helps-arrow how-helps-arrow--next"
              onClick={handleNext}
              aria-label="Next card"
            >
              <i className="fas fa-chevron-right" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

export default HowFareTransitHelps;
