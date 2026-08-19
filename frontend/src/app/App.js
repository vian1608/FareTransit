import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useParams } from 'react-router-dom';
import Header from '../shared/components/Header';
import Footer from '../shared/components/Footer';
import PageTransition from '../shared/components/PageTransition';
import ScrollToTop from '../shared/components/ScrollToTop';
import SeoRouteGuard from '../shared/components/SeoRouteGuard';
import Home from '../features/flights/pages/Home';
import SearchResults from '../features/flights/pages/SearchResultsPage';
import SignIn from '../features/customers/pages/SignInPage';
import SignUp from '../features/customers/pages/SignUpPage';
import AdminLogin from '../features/admin/pages/AdminLoginPage';
import AdminDashboard from '../features/admin/pages/AdminDashboardPage';
import AdminCreateBookingPage from '../features/admin/pages/AdminCreateBookingPage';
import AdminVouchersPage from '../features/admin/pages/AdminVouchersPage';
import AdminVoucherShortcut from '../features/admin/components/AdminVoucherShortcut';
import OneWayConfirmation from '../features/bookings/pages/OneWayConfirmationPage';
import RoundTripConfirmation from '../features/bookings/pages/RoundTripConfirmationPage';
import TermsAndConditions from '../shared/pages/TermsAndConditionsPage';
import ContactInfo from '../shared/pages/ContactInfoPage';
import NotFoundPage from '../shared/pages/NotFoundPage';
import './App.css';
import PrivacyPolicy from '../shared/pages/PrivacyPolicyPage';
import RefundPolicy from '../shared/pages/RefundPolicyPage';
import TrainRoute from '../features/flights/pages/TrainRoutePage';
import FlightRoute from '../features/flights/pages/FlightRoutePage';
import AirlineActionPage from '../features/flights/pages/AirlineActionPage';
import RouteDispatcher from '../features/flights/pages/RouteDispatcher';
import MyBookings from '../features/bookings/pages/MyBookingsPage';
import PassengerAuthorization from '../features/authorizations/pages/PassengerAuthorizationPage';
import TravelAssistance from '../features/flights/pages/TravelAssistancePage';
import BookingForParents from '../features/flights/pages/BookingForParentsPage';
import UrgentTravel from '../features/flights/pages/UrgentTravelPage';
import AppErrorBoundary from '../shared/components/AppErrorBoundary';
import { Analytics } from '@vercel/analytics/react';
import SeniorTravelSearchPage from '../features/flights/pages/SeniorTravelSearchPage';
import {
  BookingBootstrap,
  BookingConfirmationRoute,
  LegacyPaymentSuccessRoute,
  ReturnFlightBootstrap,
  TokenizedBookingPage,
  TokenizedReturnFlightPage,
} from '../features/journey/TokenizedJourneyRoutes';
import { PaymentBootstrap, TokenizedPaymentPage } from '../features/journey/TokenizedPaymentRoutes';

import CarRentalsHomePage from '../features/cars/pages/CarRentalsHomePage';
import CarSearchUrlGuard from '../features/cars/pages/CarSearchUrlGuard';
import HotelSearchPage from '../features/hotels/pages/HotelSearchPage';

function LegacyAirlineRedirect() {
  const { airlineSlug } = useParams();
  return <Navigate to={`/book/${airlineSlug}`} replace />;
}

function AdminDashboardWithVoucherShortcut() {
  return (
    <>
      <AdminDashboard />
      <AdminVoucherShortcut />
    </>
  );
}

function App() {
  return (
    <Router>
      <ScrollToTop />
      <Analytics />
      <div className="App">
        <Header />
        <main className="main">
          <AppErrorBoundary>
            <PageTransition>
              <Routes>
                <Route path="/" element={<Home />} />

                {/* Hotel search is URL-authoritative; all booking requests return through CRM. */}
                <Route path="/hotels" element={<HotelSearchPage />} />
                <Route path="/hotels/results" element={<HotelSearchPage />} />

                {/* Car Rentals: results are URL-authoritative and copy/paste safe. */}
                <Route path="/car-rentals" element={<CarRentalsHomePage />} />
                <Route path="/car-rentals/search" element={<CarSearchUrlGuard />} />
                <Route path="/car-rentals/results" element={<CarSearchUrlGuard />} />

                {/* Legacy Amtrak Route Redirect */}
                <Route path="/amtrak" element={<Navigate to="/car-rentals" replace />} />
                <Route path="/amtrak-assistance" element={<Navigate to="/car-rentals" replace />} />

                {/* Admin Routes */}
                <Route path="/admin" element={<Navigate to="/admin/login" replace />} />
                <Route path="/admin/login" element={<AdminLogin />} />
                <Route path="/admin/dashboard" element={<AdminDashboardWithVoucherShortcut />} />
                <Route path="/admin/vouchers" element={<AdminVouchersPage />} />
                <Route path="/admin/bookings/new" element={<AdminCreateBookingPage />} />
                <Route path="/admin/bookings/:code" element={<AdminDashboard />} />

                {/* Train Routes */}
                <Route path="/train-nyc-to-dc" element={
                  <TrainRoute
                    title="Train from NYC to Washington, D.C."
                    metaTitle="Train from NYC to DC | Book Tickets & Schedules | FareTransit"
                    metaDescription="Need a train from NYC to Washington DC? Get optimized schedules, seat selections, and seamless ticketing assistance on the Northeast Corridor."
                    keywords="train from nyc to dc, train new york washington, new york to washington dc train, train to new york"
                    originCity="New York City"
                    destinationCity="Washington, D.C."
                    originCode="NYC"
                    destinationCode="DC"
                  />
                } />
                <Route path="/train-dc-to-nyc" element={
                  <TrainRoute
                    title="Train from D.C. to New York City"
                    metaTitle="Train from DC to NYC | Schedules & Easy Booking | FareTransit"
                    metaDescription="Find the fastest train routes from Washington DC to New York City. Plan your Northeast Corridor travel with zero hassle or booking stress."
                    keywords="train from dc to nyc, train to new york from dc, new york to dc train, boston to nyc train"
                    originCity="Washington, D.C."
                    destinationCity="New York City"
                    originCode="DC"
                    destinationCode="NYC"
                  />
                } />
                <Route path="/train-philly-to-nyc" element={
                  <TrainRoute
                    title="Train from Philadelphia to NYC"
                    metaTitle="Train from Philly to NYC | Fast Passenger Routing | FareTransit"
                    metaDescription="Coordination and support for train travel from Philadelphia to NYC. Book your Amtrak or regional commuter seats instantly."
                    keywords="train from philly to nyc, train from nyc to philadelphia, buy train tickets, amtrak tickets"
                    originCity="Philadelphia"
                    destinationCity="New York City"
                    originCode="PHL"
                    destinationCode="NYC"
                  />
                } />
                <Route path="/train-boston-to-nyc" element={
                  <TrainRoute
                    title="Train from Boston to NYC"
                    metaTitle="Train from Boston to NYC | Premium Tickets | FareTransit"
                    metaDescription="Expert logistics for Northeast Corridor rail from Boston to New York City."
                    keywords="boston to nyc train, train to new york from boston, amtrak boston to nyc"
                    originCity="Boston"
                    destinationCity="New York City"
                    originCode="BOS"
                    destinationCode="NYC"
                  />
                } />

                {/* Flight Routes */}
                <Route path="/flight-nyc-to-mia" element={
                  <FlightRoute
                    title="Flights from NYC to Miami (MIA)"
                    metaTitle="Flights from NYC to Miami | Fast Booking & Deals | FareTransit"
                    metaDescription="Find best flight deals and seamless advisory for non-stop flights from New York to Miami."
                    keywords="flights from nyc to mia, new york to miami flights, nyc to miami plane tickets"
                    originCity="New York City"
                    destinationCity="Miami"
                    originCode="NYC"
                    destinationCode="MIA"
                  />
                } />
                <Route path="/flight-lax-to-jfk" element={
                  <FlightRoute
                    title="Flights from Los Angeles (LAX) to New York (JFK)"
                    metaTitle="Flights from LAX to JFK | Transcontinental Deals | FareTransit"
                    metaDescription="Book premium transcontinental flights from Los Angeles to New York JFK with expert logistics."
                    keywords="flights from lax to jfk, los angeles to new york flights, lax to jfk tickets"
                    originCity="Los Angeles"
                    destinationCity="New York"
                    originCode="LAX"
                    destinationCode="JFK"
                  />
                } />

                {/* Dynamic & Landing Routes */}
                <Route path="/routes/:slug" element={<RouteDispatcher />} />
                <Route path="/book/:airline" element={<AirlineActionPage action="book" />} />
                <Route path="/changes/:airline" element={<AirlineActionPage action="changes" />} />
                <Route path="/cancellation/:airline" element={<AirlineActionPage action="cancellation" />} />
                <Route path="/airlines/:airlineSlug" element={<LegacyAirlineRedirect />} />

                {/* Flight search remains readable/shareable by query string. */}
                <Route path="/search" element={<SearchResults />} />

                {/* Consulting payment uses an opaque p_ session URL. */}
                <Route path="/payment" element={<PaymentBootstrap />} />
                <Route path="/payment/:paymentToken" element={<TokenizedPaymentPage />} />
                <Route path="/pay" element={<Navigate to="/payment" replace />} />

                {/* Durable flight journey URLs. Legacy simple paths bootstrap tokens. */}
                <Route path="/return-flight" element={<ReturnFlightBootstrap />} />
                <Route path="/return-flight/:quoteToken" element={<TokenizedReturnFlightPage />} />
                <Route path="/booking" element={<BookingBootstrap />} />
                <Route path="/booking/:checkoutToken" element={<TokenizedBookingPage />} />

                <Route path="/authorize/:token" element={<PassengerAuthorization />} />
                <Route path="/confirmation/success" element={<LegacyPaymentSuccessRoute />} />
                <Route path="/booking-confirmed/:confirmationCode" element={<BookingConfirmationRoute />} />
                <Route path="/booking-confirmed" element={<LegacyPaymentSuccessRoute />} />

                <Route path="/my-bookings" element={<MyBookings />} />
                <Route path="/signin" element={<SignIn />} />
                <Route path="/signup" element={<SignUp />} />
                <Route path="/confirmation/one-way" element={<OneWayConfirmation />} />
                <Route path="/confirmation/round-trip" element={<RoundTripConfirmation />} />
                <Route path="/terms" element={<TermsAndConditions />} />
                <Route path="/contact" element={<ContactInfo />} />
                <Route path="/privacy-policy" element={<PrivacyPolicy />} />
                <Route path="/refund-policy" element={<RefundPolicy />} />

                {/* Dedicated Landing Pages */}
                <Route path="/travel-assistance" element={<TravelAssistance />} />
                <Route path="/booking-for-parents" element={<BookingForParents />} />
                <Route path="/urgent-travel" element={<UrgentTravel />} />

                {/* Senior Travel Landing — Google Ads campaign page */}
                <Route path="/senior-travel/flight-deals" element={<SeniorTravelSearchPage />} />
                <Route path="/senior-travel" element={<SeniorTravelSearchPage />} />
                <Route path="/privacy" element={<Navigate to="/privacy-policy" replace />} />
                <Route path="/privacypolicy" element={<Navigate to="/privacy-policy" replace />} />
                <Route path="/refund" element={<Navigate to="/refund-policy" replace />} />
                <Route path="/refundpolicy" element={<Navigate to="/refund-policy" replace />} />

                <Route path="*" element={<NotFoundPage />} />
              </Routes>
            </PageTransition>
            <SeoRouteGuard />
          </AppErrorBoundary>
        </main>
        <Footer />
      </div>
    </Router>
  );
}

export default App;
