import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useParams } from 'react-router-dom';
import Header from '../shared/components/Header';
import Footer from '../shared/components/Footer';
import PageTransition from '../shared/components/PageTransition';
import ScrollToTop from '../shared/components/ScrollToTop';
import Home from '../features/flights/pages/Home';
import SearchResults from '../features/flights/pages/SearchResultsPage';
import SignIn from '../features/customers/pages/SignInPage';
import SignUp from '../features/customers/pages/SignUpPage';
import AdminLogin from '../features/admin/pages/AdminLoginPage';
import AdminDashboard from '../features/admin/pages/AdminDashboardPage';
import OneWayConfirmation from '../features/bookings/pages/OneWayConfirmationPage';
import RoundTripConfirmation from '../features/bookings/pages/RoundTripConfirmationPage';
import ReturnFlightSelection from '../features/flights/pages/ReturnFlightSelectionPage';
import TermsAndConditions from '../shared/pages/TermsAndConditionsPage';
import ContactInfo from '../shared/pages/ContactInfoPage';
import './App.css';
import PrivacyPolicy from '../shared/pages/PrivacyPolicyPage';
import RefundPolicy from '../shared/pages/RefundPolicyPage';
import AmtrakAssistance from '../features/flights/pages/AmtrakAssistancePage';
import TrainRoute from '../features/flights/pages/TrainRoutePage';
import FlightRoute from '../features/flights/pages/FlightRoutePage';
import AirlineActionPage from '../features/flights/pages/AirlineActionPage';
import ConsultingPayment from '../features/payments/pages/ConsultingPaymentPage';
import RouteDispatcher from '../features/flights/pages/RouteDispatcher';
import Booking from '../features/bookings/pages/BookingPage';
import PaymentSuccess from '../features/bookings/pages/PaymentSuccessPage';
import MyBookings from '../features/bookings/pages/MyBookingsPage';


function LegacyAirlineRedirect() {
  const { airlineSlug } = useParams();
  return <Navigate to={`/book/${airlineSlug}`} replace />;
}

function App() {
  return (
    <Router>
      <ScrollToTop />
      <div className="App">
        <Header />
        <main className="main">
          <PageTransition>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/amtrak" element={<AmtrakAssistance />} />
              <Route path="/amtrak-assistance" element={<Navigate to="/amtrak" replace />} />
              
              {/* New Optimized Train Routes */}
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
              <Route path="/train-chicago-to-stlouis" element={
                <TrainRoute 
                  title="Train from Chicago to St. Louis" 
                  metaTitle="Train from Chicago to St. Louis | FareTransit"
                  metaDescription="Book your train travel from Chicago to St. Louis easily with our premium rail advisory."
                  keywords="train from chicago to st louis, amtrak chicago to st louis"
                  originCity="Chicago"
                  destinationCity="St. Louis"
                  originCode="CHI"
                  destinationCode="STL"
                />
              } />
              <Route path="/train-la-to-sandiego" element={
                <TrainRoute 
                  title="Train from Los Angeles to San Diego" 
                  metaTitle="Train from LA to San Diego | FareTransit"
                  metaDescription="Enjoy the scenic Pacific Surfliner route with premium bookings from LA to San Diego."
                  keywords="train from la to san diego, los angeles to san diego train, amtrak la to san diego"
                  originCity="Los Angeles"
                  destinationCity="San Diego"
                  originCode="LA"
                  destinationCode="SD"
                />
              } />
              <Route path="/train-seattle-to-portland" element={
                <TrainRoute 
                  title="Train from Seattle to Portland" 
                  metaTitle="Train from Seattle to Portland | Cascades Route | FareTransit"
                  metaDescription="Travel the scenic Pacific Northwest on the Cascades route from Seattle to Portland."
                  keywords="train from seattle to portland, amtrak cascades, seattle to portland train"
                  originCity="Seattle"
                  destinationCity="Portland"
                  originCode="SEA"
                  destinationCode="PDX"
                />
              } />
              <Route path="/train-nyc-to-albany" element={
                <TrainRoute 
                  title="Train from NYC to Albany" 
                  metaTitle="Train from NYC to Albany | FareTransit"
                  metaDescription="Fast and reliable train bookings from New York City to Albany."
                  keywords="train from nyc to albany, amtrak nyc to albany"
                  originCity="New York City"
                  destinationCity="Albany"
                  originCode="NYC"
                  destinationCode="ALB"
                />
              } />

              {/* New Optimized Flight Routes */}
              <Route path="/flight-nyc-to-lon" element={
                <FlightRoute 
                  title="Flights from New York (JFK) to London (LHR)" 
                  metaTitle="Flights from New York to London | FareTransit"
                  metaDescription="Book premium routing and travel logistics for flights from New York JFK to London Heathrow."
                  keywords="flights from new york to london, jfk to lhr, new york to london flights"
                  originCity="New York"
                  destinationCity="London"
                  originCode="JFK"
                  destinationCode="LHR"
                />
              } />
              <Route path="/flight-lax-to-tokyo" element={
                <FlightRoute 
                  title="Flights from Los Angeles (LAX) to Tokyo (NRT/HND)" 
                  metaTitle="Flights from LAX to Tokyo | FareTransit"
                  metaDescription="Seamless premium flight bookings from Los Angeles to Tokyo Narita or Haneda."
                  keywords="flights from los angeles to tokyo, lax to nrt, lax to tokyo flights"
                  originCity="Los Angeles"
                  destinationCity="Tokyo"
                  originCode="LAX"
                  destinationCode="NRT/HND"
                />
              } />
              <Route path="/flight-mia-to-paris" element={
                <FlightRoute 
                  title="Flights from Miami (MIA) to Paris (CDG)" 
                  metaTitle="Flights from Miami to Paris | FareTransit"
                  metaDescription="Expert logistics and premium bookings for flights from Miami to Paris Charles de Gaulle."
                  keywords="flights from miami to paris, mia to cdg, miami to paris flights"
                  originCity="Miami"
                  destinationCity="Paris"
                  originCode="MIA"
                  destinationCode="CDG"
                />
              } />
              <Route path="/flight-ord-to-fra" element={
                <FlightRoute 
                  title="Flights from Chicago (ORD) to Frankfurt (FRA)" 
                  metaTitle="Flights from Chicago to Frankfurt | FareTransit"
                  metaDescription="Premium international flight logistics from Chicago O'Hare to Frankfurt."
                  keywords="flights from chicago to frankfurt, ord to fra, chicago to germany flights"
                  originCity="Chicago"
                  destinationCity="Frankfurt"
                  originCode="ORD"
                  destinationCode="FRA"
                />
              } />
              <Route path="/flight-sfo-to-syd" element={
                <FlightRoute 
                  title="Flights from San Francisco (SFO) to Sydney (SYD)" 
                  metaTitle="Flights from SFO to Sydney | FareTransit"
                  metaDescription="Expert booking support for transpacific flights from San Francisco to Sydney."
                  keywords="flights from san francisco to sydney, sfo to syd, sfo to sydney flights"
                  originCity="San Francisco"
                  destinationCity="Sydney"
                  originCode="SFO"
                  destinationCode="SYD"
                />
              } />
              <Route path="/flight-jfk-to-dxb" element={
                <FlightRoute 
                  title="Flights from New York (JFK) to Dubai (DXB)" 
                  metaTitle="Flights from JFK to Dubai | FareTransit"
                  metaDescription="Luxury flight arrangements and logistics from New York JFK to Dubai."
                  keywords="flights from new york to dubai, jfk to dxb, new york to dubai flights"
                  originCity="New York"
                  destinationCity="Dubai"
                  originCode="JFK"
                  destinationCode="DXB"
                />
              } />
              <Route path="/flight-dfw-to-lhr" element={
                <FlightRoute 
                  title="Flights from Dallas (DFW) to London (LHR)" 
                  metaTitle="Flights from Dallas to London | FareTransit"
                  metaDescription="Premium flight bookings from Dallas Fort Worth to London Heathrow."
                  keywords="flights from dallas to london, dfw to lhr, dallas to london flights"
                  originCity="Dallas"
                  destinationCity="London"
                  originCode="DFW"
                  destinationCode="LHR"
                />
              } />
              <Route path="/flight-bos-to-dub" element={
                <FlightRoute 
                  title="Flights from Boston (BOS) to Dublin (DUB)" 
                  metaTitle="Flights from Boston to Dublin | FareTransit"
                  metaDescription="Seamless premium flight bookings from Boston to Dublin, Ireland."
                  keywords="flights from boston to dublin, bos to dub, boston to ireland flights"
                  originCity="Boston"
                  destinationCity="Dublin"
                  originCode="BOS"
                  destinationCode="DUB"
                />
              } />
              
              {/* Dynamic Route Pages */}
              <Route path="/routes/:slug" element={<RouteDispatcher />} />

              {/* Intent-based airline landing pages (Google Ads) */}
              <Route path="/book/:airline" element={<AirlineActionPage action="book" />} />
              <Route path="/changes/:airline" element={<AirlineActionPage action="changes" />} />
              <Route path="/cancellation/:airline" element={<AirlineActionPage action="cancellation" />} />

              {/* Legacy airline URLs → book intent */}
              <Route path="/airlines/:airlineSlug" element={<LegacyAirlineRedirect />} />

              <Route path="/amtrak-assitance" element={<Navigate to="/amtrak" replace />} />
              <Route path="/amtrak-assisstance" element={<Navigate to="/amtrak" replace />} />
              <Route path="/amtrak-asistance" element={<Navigate to="/amtrak" replace />} />
               <Route path="/search" element={<SearchResults />} />
               <Route path="/payment" element={<ConsultingPayment />} />
               <Route path="/pay" element={<Navigate to="/payment" replace />} />
               <Route path="/booking" element={<Booking />} />
               <Route path="/confirmation/success" element={<PaymentSuccess />} />
               <Route path="/my-bookings" element={<MyBookings />} />
               <Route path="/signin" element={<SignIn />} />
               <Route path="/signup" element={<SignUp />} />
              <Route path="/admin/login" element={<AdminLogin />} />
              <Route path="/admin/dashboard" element={<AdminDashboard />} />
              <Route path="/confirmation/one-way" element={<OneWayConfirmation />} />
              <Route path="/confirmation/round-trip" element={<RoundTripConfirmation />} />
              <Route path="/return-flight" element={<ReturnFlightSelection />} />
              <Route path="/terms" element={<TermsAndConditions />} />
              <Route path="/contact" element={<ContactInfo />} />
              <Route path="/privacy-policy" element={<PrivacyPolicy />} />
              <Route path="/refund-policy" element={<RefundPolicy />} />
              
              {/* Common Aliases / Shortcuts */}
              <Route path="/privacy" element={<Navigate to="/privacy-policy" replace />} />
              <Route path="/privacypolicy" element={<Navigate to="/privacy-policy" replace />} />
              <Route path="/refund" element={<Navigate to="/refund-policy" replace />} />
              <Route path="/refundpolicy" element={<Navigate to="/refund-policy" replace />} />
            </Routes>
          </PageTransition>
        </main>
        <Footer />
      </div>
    </Router>
  );
}

export default App;
