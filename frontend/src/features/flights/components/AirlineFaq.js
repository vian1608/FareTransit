import React, { useState } from 'react';
import './AirlineFaq.css';

function AirlineFaq({ airlineName, faqs }) {
  const [openIndex, setOpenIndex] = useState(0);

  if (!faqs?.length) return null;

  const toggle = (index) => {
    setOpenIndex((current) => (current === index ? -1 : index));
  };

  return (
    <div className="airline-faq">
      {faqs.map((item, index) => {
        const isOpen = openIndex === index;
        const panelId = `airline-faq-panel-${index}`;
        const buttonId = `airline-faq-button-${index}`;

        return (
          <div key={item.question} className={`airline-faq__item ${isOpen ? 'airline-faq__item--open' : ''}`}>
            <button
              type="button"
              id={buttonId}
              className="airline-faq__question"
              aria-expanded={isOpen}
              aria-controls={panelId}
              onClick={() => toggle(index)}
            >
              <span>{item.question}</span>
              <i className={`fas fa-chevron-${isOpen ? 'up' : 'down'}`} aria-hidden="true" />
            </button>
            <div
              id={panelId}
              role="region"
              aria-labelledby={buttonId}
              className="airline-faq__answer"
              hidden={!isOpen}
            >
              <p>{item.answer}</p>
            </div>
          </div>
        );
      })}
      <p className="airline-faq__note">
        Policies shown reflect common {airlineName} guidelines and may vary by fare type, route, and
        date of purchase. For urgent booking, change, or cancellation support, call our desk above.
      </p>
    </div>
  );
}

export default AirlineFaq;
