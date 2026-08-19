import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import CarSearchResultsPage from './CarSearchResultsPage';

/**
 * Car result URLs are shareable search documents. Never allow a bare results URL
 * to revive an unrelated browser-session search from sessionStorage.
 */
export default function CarSearchUrlGuard() {
  const location = useLocation();
  const query = new URLSearchParams(location.search || '');
  const pickup = String(query.get('pickup') || '').trim();
  const pickupDate = String(query.get('pickupDate') || '').trim();
  const dropoffDate = String(query.get('dropoffDate') || '').trim();

  if (!pickup || !pickupDate || !dropoffDate) {
    return <Navigate to="/car-rentals" replace />;
  }

  return <CarSearchResultsPage />;
}
