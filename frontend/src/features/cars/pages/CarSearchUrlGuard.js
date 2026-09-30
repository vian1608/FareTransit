import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import CarSearchResultsPage from './CarSearchResultsPage';

/**
 * Enterprise result URLs are shareable search documents. Keep the human-readable
 * pickup value for the existing URL contract, while also requiring the supplier
 * location ID so free-form text cannot be mistaken for a valid Enterprise depot.
 */
export default function CarSearchUrlGuard() {
  const location = useLocation();
  const query = new URLSearchParams(location.search || '');
  const pickup = String(query.get('pickup') || '').trim();
  const pickupId = String(query.get('pickupId') || '').trim();
  const pickupDate = String(query.get('pickupDate') || '').trim();
  const dropoffDate = String(query.get('dropoffDate') || '').trim();

  if (!pickup || !pickupId || !pickupDate || !dropoffDate) {
    return <Navigate to="/car-rentals" replace />;
  }

  return <CarSearchResultsPage />;
}
