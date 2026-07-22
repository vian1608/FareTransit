import React from 'react';
import './AirlineLegalFinePrint.css';

/**
 * Low-priority legal copy; data-nosnippet reduces use in Google search snippets.
 */
function AirlineLegalFinePrint() {
  return (
    <aside className="airline-legal-fineprint" data-nosnippet="true" aria-label="Legal notice">
      <small className="airline-legal-fineprint__text">
        <span className="airline-legal-fineprint__brand">FareTransit LLC</span>
        <span className="airline-legal-fineprint__consultancy">
          {' '}
          is an independent logistics consultancy and does not issue tickets directly.
        </span>
        <span className="airline-legal-fineprint__marks">
          {' '}
          All airline names and logos are trademarks of their respective owners.
        </span>
      </small>
    </aside>
  );
}

export default AirlineLegalFinePrint;
