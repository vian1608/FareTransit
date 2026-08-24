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
import App from './app/App';
import BackOfficeRouter from './features/backoffice/BackOfficeRouter';
import SecurePaymentPage from './features/secure-payments/SecurePaymentPage';
import BaggagePaymentPage from './features/bookings/addons/BaggagePaymentPage';
import BaggageAdminPage from './features/admin/pages/BaggageAdminPage';
import SupportCallLayer from './shared/components/SupportCallLayer';
import { boPatch } from './features/backoffice/backofficeApi';
import { adminAPI } from './shared/api/api';
import { HelmetProvider } from 'react-helmet-async';
import { installSensitiveDataGuards } from './shared/security/installSensitiveDataGuards';
import { installBookingValidationUX } from './shared/validation/installBookingValidationUX';
import { installFareBreakdownUX } from './shared/pricing/installFareBreakdownUX';
import { installMobileBookingUX } from './shared/mobile/installMobileBookingUX';
import { installPrimaryContactSyncUX } from './shared/contact/installPrimaryContactSyncUX';
import { installBaggageAncillaryUX } from './features/bookings/addons/installBaggageAncillaryUX';

installSensitiveDataGuards();
installBookingValidationUX();
installFareBreakdownUX();
installMobileBookingUX();
installPrimaryContactSyncUX();
installBaggageAncillaryUX();

// Build marker used to verify that the current FareTransit frontend bundle is live.
document.documentElement.dataset.faretransitBuild = 'baggage-ancillary-2026-08-24';

// CRM launches the EXISTING create-flight workflow with a leadId query parameter.
// Patch only that single request path so the successful legacy create call is
// linked back to CRM without rewriting the production booking form itself.
const query = new URLSearchParams(window.location.search);
const crmLeadId = window.location.pathname === '/admin/bookings/new' ? query.get('leadId') : null;
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

// Preserve every established App.js route. Only additive back-office and payment
// URLs are intercepted here so the stable flight/admin route table does not need a rewrite.
const isNewBackOfficePath = /^\/admin\/(backoffice|crm(?:\/|$)|trips(?:\/|$)|bookings\/(?:flights|hotels|cars)(?:\/|$)|payments(?:\/|$)|testing(?:\/|$)|finance(?:\/|$)|suppliers(?:\/|$)|reports(?:\/|$)|team(?:\/|$)|settings(?:\/|$))/.test(window.location.pathname);
const isSecurePaymentPath = /^\/secure-payment\/[^/]+\/?$/.test(window.location.pathname);
const isBaggagePaymentPath = /^\/addons\/pay\/[^/]+\/?$/.test(window.location.pathname);
const isBaggageAdminPath = /^\/admin\/baggage\/?$/.test(window.location.pathname);

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <HelmetProvider>
      {isNewBackOfficePath ? (
        <BrowserRouter><BackOfficeRouter /></BrowserRouter>
      ) : isSecurePaymentPath ? (
        <BrowserRouter><Routes><Route path="/secure-payment/:token" element={<SecurePaymentPage />} /></Routes></BrowserRouter>
      ) : isBaggagePaymentPath ? (
        <BrowserRouter><Routes><Route path="/addons/pay/:token" element={<BaggagePaymentPage />} /></Routes></BrowserRouter>
      ) : isBaggageAdminPath ? (
        <BrowserRouter><Routes><Route path="/admin/baggage" element={<BaggageAdminPage />} /></Routes></BrowserRouter>
      ) : <App />}
      {!isNewBackOfficePath && !isBaggageAdminPath && <SupportCallLayer />}
    </HelmetProvider>
  </React.StrictMode>
);
