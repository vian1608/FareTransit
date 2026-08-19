import React from 'react';
import { canonicalSearchAirport } from '../utils/airportIdentity';
import './ModifySearchSummaryBar.css';

function formatDate(dateStr) {
  if (!dateStr) return '';
  try {
    const cleanDate = dateStr.includes('T') ? dateStr : `${dateStr}T00:00:00`;
    const d = new Date(cleanDate);
    if (Number.isNaN(d.getTime())) return String(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return String(dateStr || '');
  }
}

function ModifySearchSummaryBar({ searchParams = {}, onOpenModifyModal, className = '' }) {
  const fromCode = canonicalSearchAirport(searchParams, 'from');
  const toCode = canonicalSearchAirport(searchParams, 'to');
  const depDate = searchParams.departureDate || searchParams.departure || '';
  const retDate = searchParams.returnDate || searchParams.return || '';

  const adults = Number.parseInt(searchParams.adults || 1, 10);
  const children = Number.parseInt(searchParams.children || 0, 10);
  const infants = Number.parseInt(searchParams.infants || 0, 10);
  const totalPax = Math.max(1, adults + children + infants);
  const cabin = searchParams.travelClass || searchParams.cabinClass || searchParams.cabin || 'Economy';
  const dateText = retDate ? `${formatDate(depDate)} – ${formatDate(retDate)}` : formatDate(depDate);
  const routeText = fromCode && toCode ? `${fromCode} → ${toCode}` : 'Flight search';

  return (
    <div className={`modify-search-summary-bar ${className}`}>
      <div className="summary-info-chips">
        <div className="chip chip--route">
          <i className="fas fa-plane-departure" />
          <strong>{routeText}</strong>
        </div>

        {dateText && (
          <div className="chip chip--dates">
            <i className="fas fa-calendar-alt" /> {dateText}
          </div>
        )}

        <div className="chip chip--pax">
          <i className="fas fa-user" /> {totalPax} {totalPax === 1 ? 'Passenger' : 'Passengers'}
        </div>

        <div className="chip chip--cabin">
          <i className="fas fa-chair" /> {String(cabin).replace(/-/g, ' ')}
        </div>
      </div>

      <button type="button" className="btn-modify-search-trigger" onClick={onOpenModifyModal}>
        <i className="fas fa-edit" /> Modify Search
      </button>
    </div>
  );
}

export default ModifySearchSummaryBar;
