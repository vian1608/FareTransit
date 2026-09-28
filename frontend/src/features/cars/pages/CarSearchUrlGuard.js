import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import CarSearchResultsPage from './CarSearchResultsPage';

/**
 * Car result URLs are shareable search documents. Parse/Enterprise searches
 * require the provider location ID, so never revive an unrelated session search
 * when that ID is absent from the URL.
 */
export default function CarSearchUrlGuard() {
  const location = useLocation();
  const query = new URLSearchParams(location.search || '');
  const pickupId = String(query.get('pickupId') || '').trim();
  const pickup = String(query.get('pickup') || '').trim();
  const pickupDate = String(query.get('pickupDate') || '').trim();
  const dropoffDate = String(query.get('dropoffDate') || '').trim();

  if (!pickupId || !pickup || !pickupDate || !dropoffDate) {
    return <Navigate to="/car-rentals" replace />;
  }

  return <CarSearchResultsPage />;
}
