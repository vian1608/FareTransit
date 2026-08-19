import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

const isoDay = (offset) => {
  const value = new Date();
  value.setHours(12, 0, 0, 0);
  value.setDate(value.getDate() + offset);
  return value.toISOString().slice(0, 10);
};

function buildFlightFixture() {
  const departureDate = isoDay(7);
  return {
    isMock: true,
    testFixture: 'TFS_PAYMENT_FLOW_SANDBOX',
    airline: 'Delta Air Lines',
    airlineName: 'Delta Air Lines',
    carrierCode: 'DL',
    carrier_code: 'DL',
    flightNumber: 'DL1234',
    flight_number: 'DL1234',
    departure: {
      airport: 'BUF',
      city: 'Buffalo',
      date: departureDate,
      time: '10:15'
    },
    arrival: {
      airport: 'JFK',
      city: 'New York',
      date: departureDate,
      time: '11:45'
    },
    departureDate,
    arrivalDate: departureDate,
    duration: '1h 30m',
    stops: 0,
    class: 'Economy',
    cabinClass: 'Economy',
    baggageAllowance: '1 carry-on · Sandbox fixture',
    price: {
      finalPrice: '100.00',
      total: '100.00',
      originalApiPrice: '100.00',
      discountAmount: '0.00',
      currency: 'USD'
    }
  };
}

function buildSearchFixture(selectedFlight) {
  return {
    from: 'Buffalo',
    to: 'New York',
    fromCode: 'BUF',
    toCode: 'JFK',
    departure: selectedFlight.departure.date,
    departureDate: selectedFlight.departure.date,
    return: '',
    returnDate: '',
    tripType: 'one-way',
    adults: 1,
    children: 0,
    infants: 0,
    infantsInSeat: 0,
    infantsOnLap: 0,
    cabinClass: 'Economy'
  };
}

export default function PaymentFlowTestPage() {
  const [launching, setLaunching] = useState(false);
  const fixture = useMemo(() => buildFlightFixture(), []);

  const launchCheckout = () => {
    setLaunching(true);
    const selectedFlight = buildFlightFixture();
    const searchParams = buildSearchFixture(selectedFlight);

    // Clear only journey/checkout state. No flight-search API is called here.
    [
      'checkoutSessionToken',
      'quoteSessionToken',
      'selectedFlight',
      'returnFlight',
      'selectedReturnFlight',
      'searchParams',
      'searchType',
      'bookingDraft',
      'abandonedSessionKey',
      'tfsAppliedVoucher'
    ].forEach((key) => sessionStorage.removeItem(key));

    sessionStorage.setItem('selectedFlight', JSON.stringify(selectedFlight));
    sessionStorage.setItem('searchParams', JSON.stringify(searchParams));
    sessionStorage.setItem('searchType', 'one-way');
    sessionStorage.setItem('tfsPaymentTestRun', JSON.stringify({
      fixture: 'TFS_PAYMENT_FLOW_SANDBOX',
      createdAt: new Date().toISOString(),
      searchApiCalled: false
    }));

    // /booking creates the normal opaque checkout session and then renders the
    // same production BookingPage used by real passengers.
    window.location.assign('/booking');
  };

  return (
    <>
      <div className="bo-page-header">
        <div>
          <h1>Payment Flow Sandbox</h1>
          <div className="bo-muted">End-to-end reservation + VGS testing without calling the flight-search provider.</div>
        </div>
        <div className="bo-actions">
          <Link className="bo-button secondary" to="/admin/payments/authorizations">Authorizations</Link>
        </div>
      </div>

      <div className="bo-card bo-error" style={{ color: '#7c4a03', background: '#fff8e8', borderColor: '#efd28f' }}>
        <strong>Sandbox only.</strong> This creates real test records in your database and uses the real checkout/payment architecture, but the itinerary below is generated locally and does not consume a SerpApi or flight-search request. Use VGS sandbox card data only.
      </div>

      <div className="bo-grid">
        <div className="bo-card bo-kpi">
          <span className="bo-muted">Search API calls</span>
          <strong>0</strong>
        </div>
        <div className="bo-card bo-kpi">
          <span className="bo-muted">Test amount</span>
          <strong>$100.00</strong>
        </div>
        <div className="bo-card bo-kpi">
          <span className="bo-muted">Route</span>
          <strong>BUF → JFK</strong>
        </div>
        <div className="bo-card bo-kpi">
          <span className="bo-muted">Payment vault</span>
          <strong>VGS Sandbox</strong>
        </div>
      </div>

      <div className="bo-card">
        <h2>Test itinerary</h2>
        <div className="bo-detail-grid">
          <div><span>Flight</span><strong>{fixture.airline} {fixture.flightNumber}</strong></div>
          <div><span>Departure</span><strong>BUF · {fixture.departure.date} · {fixture.departure.time}</strong></div>
          <div><span>Arrival</span><strong>JFK · {fixture.arrival.date} · {fixture.arrival.time}</strong></div>
          <div><span>Cabin</span><strong>{fixture.cabinClass}</strong></div>
        </div>
      </div>

      <div className="bo-card">
        <h2>What this test exercises</h2>
        <p className="bo-muted" style={{ lineHeight: 1.7 }}>
          Mock itinerary → real checkout session → real passenger BookingPage → VGS sandbox card fields → real booking record → payment context → payment authorization → CARD_READY → admin authorization/OTP/reveal workflow.
        </p>
        <div className="bo-actions" style={{ marginTop: 16 }}>
          <button className="bo-button" type="button" onClick={launchCheckout} disabled={launching}>
            {launching ? 'Opening checkout…' : 'Launch Real Checkout Test'}
          </button>
          <Link className="bo-button secondary" to="/admin/bookings/flights">Flight Bookings</Link>
        </div>
      </div>
    </>
  );
}
