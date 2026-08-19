import React, { useRef, useEffect, useState, useCallback } from 'react';
import './AccordionSection.css';

const MOBILE_ACCORDION_QUERY = '(max-width: 640px)';
const MOBILE_ACCORDION_EVENT = 'tfs:mobile-accordion-open';

function AccordionSection({ id, stepNumber, title, isOpen, onToggle, isComplete = false, children }) {
  const bodyRef = useRef(null);
  const [bodyHeight, setBodyHeight] = useState(0);

  useEffect(() => {
    if (!bodyRef.current) return;

    const updateHeight = () => {
      if (bodyRef.current) {
        setBodyHeight(bodyRef.current.scrollHeight);
      }
    };

    updateHeight();

    // Use ResizeObserver to auto-recalculate height when async components load or resize.
    let observer = null;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(() => {
        updateHeight();
      });
      observer.observe(bodyRef.current);
    }

    return () => {
      if (observer) observer.disconnect();
    };
  }, [isOpen, children]);

  // On phones, opening one major booking section closes the others. This keeps
  // the checkout short without changing desktop behavior or validation state.
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const handleMobileAccordionOpen = (event) => {
      const otherId = event?.detail?.id;
      const isMobile = window.matchMedia?.(MOBILE_ACCORDION_QUERY)?.matches;
      if (isMobile && otherId && otherId !== id && isOpen) {
        onToggle();
      }
    };

    window.addEventListener(MOBILE_ACCORDION_EVENT, handleMobileAccordionOpen);
    return () => window.removeEventListener(MOBILE_ACCORDION_EVENT, handleMobileAccordionOpen);
  }, [id, isOpen, onToggle]);

  const handleToggle = useCallback(() => {
    if (typeof window !== 'undefined') {
      const isMobile = window.matchMedia?.(MOBILE_ACCORDION_QUERY)?.matches;
      if (isMobile && !isOpen) {
        window.dispatchEvent(new CustomEvent(MOBILE_ACCORDION_EVENT, { detail: { id } }));
      }
    }
    onToggle();
  }, [id, isOpen, onToggle]);

  const sectionId = `accordion-body-${id}`;
  const headerId = `accordion-header-${id}`;

  return (
    <section className={`accordion-section ${isOpen ? 'accordion-section--open' : ''}`}>
      <div
        id={headerId}
        className="accordion-section-header"
        role="button"
        tabIndex={0}
        aria-expanded={isOpen}
        aria-controls={sectionId}
        onClick={handleToggle}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleToggle();
          }
        }}
      >
        <div className="accordion-header-left">
          <span className={`accordion-step-badge ${isComplete ? 'accordion-step-badge--complete' : ''}`}>
            {isComplete ? <i className="fas fa-check"></i> : stepNumber}
          </span>
          <h2 className="accordion-section-title">{title}</h2>
        </div>
        <i className={`fas fa-chevron-down accordion-chevron ${isOpen ? 'accordion-chevron--rotated' : ''}`}></i>
      </div>

      <div
        id={sectionId}
        className={`accordion-section-body ${isOpen ? 'accordion-section-body--open' : ''}`}
        role="region"
        aria-labelledby={headerId}
        style={{
          maxHeight: isOpen ? (bodyHeight > 0 ? `${bodyHeight + 60}px` : 'none') : '0px',
          opacity: isOpen ? 1 : 0,
          overflow: isOpen ? 'visible' : 'hidden',
          paddingTop: isOpen ? '1.5rem' : '0',
          paddingBottom: isOpen ? '0.5rem' : '0',
        }}
      >
        <div ref={bodyRef} style={{ width: '100%', boxSizing: 'border-box' }}>
          {children}
        </div>
      </div>
    </section>
  );
}

export default AccordionSection;
