import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import CarSearchResultsPage from './CarSearchResultsPage';

/**
 * Enterprise result URLs are shareable search documents. A supplier location ID
 * is mandatory so a typed/free-form label can never be mistaken for a valid
 * Enterprise rental location.
 */
export default function CarSearchUrlGuard() {
  const location = useLocation();
  const query = new URLSearchParams(location.search || '');
  const pickupId = String(query.get('pickupId') || '').trim();
  const pickupDate = String(query.get('pickupDate') || '').trim();
  const dropoffDate = String(query.get('dropoffDate') || '').trim();

  if (!pickupId || !pickupDate || !dropoffDate) {
    return <Navigate to="/car-rentals" replace />;
  }

  return <CarSearchResultsPage />;
}
