import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import './index.css';
import './shared/styles/ProductionSafetyOverrides.css';
import './shared/styles/ModernInteractionSystem.css';
import './shared/styles/ModernDetailsMotion.css';
import './shared/styles/BookingFlowOverrides.css';
import './shared/styles/BookingValidationUX.css';
import './shared/styles/ItineraryPriceLayoutFix.css';
import './shared/styles/FareBreakdownUX.css';
import './shared/styles/ItineraryDirectionFix.css';
import './shared/styles/MobileBookingUX.css';
import './shared/styles/BookingChoiceUX.css';
import './shared/styles/MobileItineraryCompact.css';
import './shared/styles/MobileItineraryRoutePolish.css';
import './features/bookings/addons/BaggageAncillary.css';
import './features/bookings/addons/TripAddonsEnhancement.css';
import './shared/styles/SitewideInteractionPolish.css';
import './shared/styles/ResponsiveTravelRedundancy.css';
import './shared/styles/CarCallMobileBottomFix.css';
import './features/backoffice/AdminLegacyCompatibility.css';
import App from './app/App';
import BackOfficeRouter from './features/backoffice/BackOfficeRouter';
import SecurePaymentPage from './features/secure-payments/SecurePaymentPage';
import BaggagePaymentPage from './features/bookings/addons/BaggagePaymentPage';
import SupportCallLayer from './shared/components/SupportCallLayer';
import { boPatch } from './features/backoffice/backofficeApi';
import { adminAPI } from './shared/api/api';
import { HelmetProvider } from 'react-helmet-async';
import { installSensitiveDataGuards } from './shared/security/installSensitiveDataGuards';
import { installBookingValidationUX } from './shared/validation/installBookingValidationUX';
import { installFareBreakdownUX } from './shared/pricing/installFareBreakdownUX';
import { installMobileBookingUX } from './shared/mobile/installMobileBookingUX';
import { installCarVehicleCarouselUX } from './shared/mobile/installCarVehicleCarousel';
import { installPrimaryContactSyncUX } from './shared/contact/installPrimaryContactSyncUX';
import { installTripAddonsUX } from './features/bookings/addons/installTripAddonsUX';

installSensitiveDataGuards();
installBookingValidationUX();
installFareBreakdownUX();
installMobileBookingUX();
installCarVehicleCarouselUX();
installPrimaryContactSyncUX();
installTripAddonsUX();

document.documentElement.dataset.faretransitBuild = 'admin-operations-redesign-2026-09-14';

const pathname = window.location.pathname;
const query = new URLSearchParams(window.location.search);
const crmLeadId = pathname === '/admin/bookings/new' ? query.get('leadId') : null;
if (crmLeadId && !adminAPI.__tfsCrmFlightCreateBridge) {
  const originalCreateBooking = adminAPI.createBooking.bind(adminAPI);
  adminAPI.createBooking = async (...args) => {
    const result = await originalCreateBooking(...args);
    const resultData = result?.data ?? result;
    const createdBooking = result?.booking || resultData?.booking || resultData;
    const createdBookingId = createdBooking?.id;
    if (createdBookingId) {
      try {
        await boPatch(`/bookings/flights/${createdBookingId}/link`, { leadId: crmLeadId });
      } catch (error) {
        window.dispatchEvent(new CustomEvent('admin-api-error', { detail: { code: error.code || 'CRM_BOOKING_LINK_FAILED', message: `Booking was created, but CRM linking failed: ${error.message}` } }));
      }
    }
    return result;
  };
  Object.defineProperty(adminAPI, '__tfsCrmFlightCreateBridge', { value: true, configurable: false, enumerable: false, writable: false });
}

const isAdminPath = /^\/admin(?:\/|$)/.test(pathname) && !/^\/admin\/login\/?$/.test(pathname);
const isSecurePaymentPath = /^\/secure-payment\/[^/]+\/?$/.test(pathname);
const isBaggagePaymentPath = /^\/addons\/pay\/[^/]+\/?$/.test(pathname);

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <HelmetProvider>
      {isAdminPath ? (
        <BrowserRouter><BackOfficeRouter /></BrowserRouter>
      ) : isSecurePaymentPath ? (
        <BrowserRouter><Routes><Route path="/secure-payment/:token" element={<SecurePaymentPage />} /></Routes></BrowserRouter>
      ) : isBaggagePaymentPath ? (
        <BrowserRouter><Routes><Route path="/addons/pay/:token" element={<BaggagePaymentPage />} /></Routes></BrowserRouter>
      ) : <App />}
      {!isAdminPath && <SupportCallLayer />}
    </HelmetProvider>
  </React.StrictMode>
);
