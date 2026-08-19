import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { SUPPORT_PHONE_DISPLAY, SUPPORT_PHONE_HREF } from '../../../shared/constants/supportContact';
import './PassengerAuthorizationPage.css';

function PassengerAuthorizationPage() {
  const { token } = useParams();
  const [loading, setLoading] = useState(true);
  const [authData, setAuthData] = useState(null);
  const [error, setError] = useState(null);

  const [checkboxAccepted, setCheckboxAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [authorizedSuccess, setAuthorizedSuccess] = useState(false);

  useEffect(() => {
    async function fetchAuth() {
      try {
        setLoading(true);
        const res = await fetch(`/api/authorizations/${token}`);
        const data = await res.json();

        if (!res.ok || !data.success) {
          throw new Error(data.error?.message || 'Failed to load authorization request.');
        }

        setAuthData(data.authorization);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    if (token) {
      fetchAuth();
    }
  }, [token]);

  const handleAuthorize = async () => {
    if (!checkboxAccepted || !authData) return;

    const rawLast4 = String(authData.cardLast4 || '').replace(/\D/g, '');
    const validLast4 = /^\d{4}$/.test(rawLast4) ? rawLast4 : null;
    const cardDisplayLabel = validLast4 ? `ending in ${validLast4}` : 'reference on file';
    const amount = authData.authorizedAmount;
    const currency = authData.currency || 'USD';

    const acceptedText = `I confirm that the passenger names, itinerary, dates, fare, fees and contact information shown above are correct. I authorize FareTransit to use my previously provided payment method ${cardDisplayLabel} for a charge of up to ${amount} ${currency} for this reservation. I understand that a new authorization will be required if the itinerary or total amount changes.`;

    try {
      setSubmitting(true);
      setError(null);

      const res = await fetch('/api/authorizations/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          acceptedText
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || 'Authorization submission failed.');
      }

      setAuthorizedSuccess(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="auth-page-container">
        <div className="auth-card-shell" style={{ textAlign: 'center', padding: '3rem 1.5rem' }}>
          <i className="fas fa-circle-notch fa-spin fa-2x" style={{ color: '#9f1239', marginBottom: '1rem' }}></i>
          <p style={{ color: '#5f4a53', fontSize: '1.05rem', fontWeight: '600' }}>
            Loading secure passenger authorization details...
          </p>
        </div>
      </div>
    );
  }

  if (error || !authData) {
    return (
      <div className="auth-page-container">
        <Helmet><title>Authorization Request Error | FareTransit</title></Helmet>
        <div className="auth-card-shell">
          <div className="auth-error-banner">
            <i className="fas fa-exclamation-triangle fa-2x" style={{ color: '#991b1b', marginBottom: '0.75rem' }}></i>
            <h2 style={{ color: '#991b1b', margin: '0 0 0.5rem', fontSize: '1.4rem' }}>Authorization Request Issue</h2>
            <p style={{ color: '#7f1d1d', margin: 0, fontSize: '0.98rem', lineHeight: '1.5' }}>
              {error || 'The requested authorization link is invalid or expired.'}
            </p>
          </div>
          <div style={{ textAlign: 'center', marginTop: '1.5rem' }}>
            <Link to="/contact" className="auth-btn-secondary">
              Contact 24/7 Support Desk
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (authorizedSuccess) {
    return (
      <div className="auth-page-container">
        <Helmet><title>Reservation Authorized | FareTransit</title></Helmet>
        <div className="auth-card-shell" style={{ textAlign: 'center', padding: '2.5rem 2rem' }}>
          <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: '#dcfce7', color: '#166534', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.25rem', fontSize: '2rem' }}>
            ✓
          </div>
          <h2 style={{ color: '#7f0d2f', fontSize: '1.75rem', fontWeight: '800', margin: '0 0 0.5rem' }}>
            Reservation Authorized Successfully!
          </h2>
          <p style={{ color: '#5f4a53', fontSize: '1.05rem', lineHeight: '1.6', maxWidth: '480px', margin: '0 auto 1.5rem' }}>
            Thank you for confirming your itinerary. Our travel specialists have received your authorization and are securing your airline tickets.
          </p>

          <div style={{ background: '#fffaf0', border: '2px dashed #e2b84d', borderRadius: '12px', padding: '1.25rem', display: 'inline-block', minWidth: '280px', marginBottom: '1.75rem' }}>
            <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '1px', color: '#8b6b16', fontWeight: '700' }}>
              Confirmation Number
            </div>
            <div style={{ fontSize: '1.6rem', fontWeight: '800', color: '#7f0d2f', letterSpacing: '1px', margin: '0.35rem 0' }}>
              {authData.confirmationCode}
            </div>
          </div>

          <div>
            <Link to={`/my-bookings?code=${authData.confirmationCode}`} className="auth-primary-btn" style={{ display: 'inline-block', width: 'auto', padding: '0.85rem 2rem' }}>
              View My Booking &rarr;
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const outbound = authData.itinerarySnapshot?.outbound || {};
  const returnFlight = authData.itinerarySnapshot?.return || null;
  const rawRenderLast4 = String(authData.cardLast4 || '').replace(/\D/g, '');
  const validRenderLast4 = /^\d{4}$/.test(rawRenderLast4) ? rawRenderLast4 : null;
  const renderCardLabel = validRenderLast4 ? `ending in ${validRenderLast4}` : 'reference on file';
  const cardBrand = authData.cardBrand || null;
  const renderAmount = authData.authorizedAmount;
  const renderCurrency = authData.currency || 'USD';

  const renderCheckboxWording = `I confirm that the passenger names, itinerary, dates, fare, fees and contact information shown above are correct. I authorize FareTransit to use my previously provided payment method ${renderCardLabel} for a charge of up to ${renderAmount} ${renderCurrency} for this reservation. I understand that a new authorization will be required if the itinerary or total amount changes.`;

  return (
    <div className="auth-page-container">
      <Helmet>
        <title>Authorize Flight Reservation {authData.confirmationCode} | FareTransit</title>
      </Helmet>

      <div className="auth-card-shell">
        {/* Header */}
        <div className="auth-card-header">
          <div className="auth-brand-logo">✈ FareTransit</div>
          <div className="auth-header-tag">Passenger Reservation Authorization</div>
        </div>

        <div className="auth-card-body">
          {/* Top Notice */}
          <div className="auth-notice-banner">
            <i className="fas fa-lock" style={{ marginRight: '0.5rem', color: '#9f1239' }}></i>
            <span>
              Please review your flight details below. Your saved card {renderCardLabel} will be used ONLY after you confirm and authorize this reservation.
            </span>
          </div>

          {/* Code Badge */}
          <div className="auth-code-badge">
            <span>Booking Reference: <strong>{authData.confirmationCode}</strong></span>

          </div>

          {/* Passenger Details */}
          <div className="auth-section-block">
            <h4 className="auth-section-title"><i className="fas fa-user-friends"></i> Passenger Details</h4>
            <div className="auth-info-grid">
              <div className="auth-info-row">
                <span className="auth-info-label">Primary Passenger:</span>
                <span className="auth-info-val">{authData.passengerName}</span>
              </div>
              <div className="auth-info-row">
                <span className="auth-info-label">Contact Email:</span>
                <span className="auth-info-val">{authData.customerEmail}</span>
              </div>
            </div>
          </div>

          {/* Itinerary */}
          <div className="auth-section-block">
            <h4 className="auth-section-title"><i className="fas fa-plane-departure"></i> Flight Itinerary</h4>
            
            {/* Outbound & Return Journey */}
            {(() => {
              const outboundList = authData.itinerarySnapshot?.outboundSegments || authData.itinerarySnapshot?.canonical?.outbound || (outbound?.carrier_name || outbound?.airline || outbound?.airlineName || outbound?.carrierCode ? [outbound] : []);
              const returnList = authData.itinerarySnapshot?.returnSegments || authData.itinerarySnapshot?.canonical?.return || (returnFlight?.carrier_name || returnFlight?.airline || returnFlight?.airlineName || returnFlight?.carrierCode ? [returnFlight] : []);

              if (outboundList.length === 0 && returnList.length === 0) {
                return (
                  <div className="auth-flight-card" style={{ textAlign: 'center', color: '#64748b', fontSize: '0.9rem', padding: '1.25rem' }}>
                    <i className="fas fa-info-circle" style={{ marginRight: '0.5rem' }}></i>
                    Flight itinerary details will be updated upon final airline confirmation.
                  </div>
                );
              }

              return (
                <>
                  {outboundList.length > 0 && (
                    <div className="auth-flight-card">
                      <div className="auth-flight-tag">
                        Outbound Journey ({outboundList.length > 1 ? `${outboundList.length - 1} Connection Stop(s)` : 'Nonstop'})
                      </div>
                      {outboundList.map((seg, idx) => (
                        <div key={`out-${idx}`} style={{ marginTop: idx > 0 ? '0.75rem' : '0', paddingTop: idx > 0 ? '0.75rem' : '0', borderTop: idx > 0 ? '1px dashed #cbd5e1' : 'none' }}>
                          <div className="auth-flight-airline">Flight #{idx + 1}: {seg.carrier_name || seg.airline || seg.airlineName || 'Airline'} {seg.flight_number || seg.flightNumber}</div>
                          <div className="auth-flight-route">
                            {seg.origin_city || seg.originCity || seg.origin_airport || seg.originCode} ({seg.origin_airport || seg.originCode}) &rarr; {seg.destination_city || seg.destinationCity || seg.destination_airport || seg.destinationCode} ({seg.destination_airport || seg.destinationCode})
                          </div>
                          <div className="auth-flight-details">
                            <span><strong>Departure:</strong> {seg.departure_date || seg.departureDate} {seg.departure_time || seg.departureTime}</span>
                            <span><strong>Cabin:</strong> {seg.cabin || seg.cabinClass || 'Economy'}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Return Journey */}
                  {returnList.length > 0 && (
                    <div className="auth-flight-card" style={{ marginTop: '0.85rem' }}>
                      <div className="auth-flight-tag" style={{ background: '#9f1239' }}>
                        Return Journey ({returnList.length > 1 ? `${returnList.length - 1} Connection Stop(s)` : 'Nonstop'})
                      </div>
                      {returnList.map((seg, idx) => (
                        <div key={`ret-${idx}`} style={{ marginTop: idx > 0 ? '0.75rem' : '0', paddingTop: idx > 0 ? '0.75rem' : '0', borderTop: idx > 0 ? '1px dashed #cbd5e1' : 'none' }}>
                          <div className="auth-flight-airline">Flight #{idx + 1}: {seg.carrier_name || seg.airline || seg.airlineName || 'Airline'} {seg.flight_number || seg.flightNumber}</div>
                          <div className="auth-flight-route">
                            {seg.origin_city || seg.originCity || seg.origin_airport || seg.originCode} ({seg.origin_airport || seg.originCode}) &rarr; {seg.destination_city || seg.destinationCity || seg.destination_airport || seg.destinationCode} ({seg.destination_airport || seg.destinationCode})
                          </div>
                          <div className="auth-flight-details">
                            <span><strong>Departure:</strong> {seg.departure_date || seg.departureDate} {seg.departure_time || seg.departureTime}</span>
                            <span><strong>Cabin:</strong> {seg.cabin || seg.cabinClass || 'Economy'}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              );
            })()}
          </div>

          {/* Fare & Payment Breakdown */}
          {(() => {
            const splits = authData.splits || authData.quoteSnapshot?.splits || [];
            return (
              <div className="auth-section-block">
                <h4 className="auth-section-title"><i className="fas fa-credit-card"></i> Payment Authorization Breakdown</h4>
                <div className="auth-fare-card">
                  {splits.length > 0 && (
                    <div style={{ marginBottom: '0.75rem', paddingBottom: '0.75rem', borderBottom: '1px dashed #cbd5e1' }}>
                      {splits.map((s, idx) => (
                        <div key={`split-${idx}`} className="auth-fare-row" style={{ marginBottom: '0.35rem', fontSize: '0.95rem' }}>
                          <span style={{ color: '#334155', fontWeight: '600' }}>{s.merchant_name || s.merchantName || 'Merchant Split'}</span>
                          <strong style={{ color: '#1e293b' }}>${parseFloat(s.amount || 0).toFixed(2)} {s.currency || renderCurrency}</strong>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="auth-fare-row">
                    <span style={{ fontWeight: '700', color: '#1e293b' }}>Total Authorized Charge</span>
                    <strong style={{ fontSize: '1.25rem', color: '#7f0d2f' }}>${renderAmount} {renderCurrency}</strong>
                  </div>
                  <div className="auth-fare-row" style={{ marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px solid #e2e8f0', fontSize: '0.9rem', color: '#64748b' }}>
                    <span>Saved Payment Method</span>
                    <span><strong>{cardBrand ? `${cardBrand} ` : ''}{renderCardLabel}</strong></span>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Mandatory Checkbox */}
          <div className="auth-checkbox-container">
            <input
              type="checkbox"
              id="auth-mandatory-check"
              checked={checkboxAccepted}
              onChange={(e) => setCheckboxAccepted(e.target.checked)}
            />
            <label htmlFor="auth-mandatory-check" className="auth-checkbox-label">
              {renderCheckboxWording}
            </label>
          </div>

          {/* Action Button */}
          <div style={{ marginTop: '1.5rem' }}>
            <button
              type="button"
              className="auth-primary-btn"
              onClick={handleAuthorize}
              disabled={!checkboxAccepted || submitting}
            >
              {submitting ? (
                <span><i className="fas fa-circle-notch fa-spin"></i> Processing Authorization...</span>
              ) : (
                <span><i className="fas fa-check-circle"></i> I Authorize</span>
              )}
            </button>
          </div>

        </div>

        <div className="auth-card-footer">
          FareTransit LLC &middot; 24/7 Passenger Support: support@faretransit.com &middot; <a href={SUPPORT_PHONE_HREF} style={{ color: 'inherit', textDecoration: 'none' }}>{SUPPORT_PHONE_DISPLAY}</a>
        </div>
      </div>
    </div>
  );
}

export default PassengerAuthorizationPage;
