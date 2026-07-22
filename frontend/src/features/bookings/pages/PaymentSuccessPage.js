import React, { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { paymentAPI, bookingAPI, inquiryAPI } from '../../../shared/api/api';
import { SUPPORT_PHONE_DISPLAY } from '../../../shared/constants/supportContact';
import './PaymentSuccessPage.css';

function PaymentSuccess() {
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get('session_id');
  const type = searchParams.get('type');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sessionDetails, setSessionDetails] = useState(null);
  const [bookingRef, setBookingRef] = useState('');
  const [isProcessingRecord, setIsProcessingRecord] = useState(false);
  const [bookingDataFromDb, setBookingDataFromDb] = useState(null);

  useEffect(() => {
    if (!sessionId) {
      setError('Invalid checkout session. Missing session identifier.');
      setLoading(false);
      return;
    }

    const fetchSession = async () => {
      try {
        setLoading(true);
        const data = await paymentAPI.getStripeSessionStatus(sessionId);
        if (data.success) {
          if (data.status === 'paid' || data.status === 'no_payment_required') {
            setSessionDetails(data);
            // Process the transaction record (once)
            await processRecord(data);
          } else {
            setError('Payment was not completed successfully. Current status: ' + data.status);
            setLoading(false);
          }
        } else {
          setError('Failed to retrieve secure checkout status.');
          setLoading(false);
        }
      } catch (err) {
        console.error('Session retrieval failed:', err);
        setError('Unable to fetch transaction confirmation. Please contact support.');
        setLoading(false);
      }
    };

    fetchSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, type]);

  // Fetch full details from database once confirmation code is available
  useEffect(() => {
    if (bookingRef) {
      const fetchBookingFromDb = async () => {
        try {
          const res = await bookingAPI.getByReference(bookingRef);
          if (res.success) {
            setBookingDataFromDb(res.data);
          }
        } catch (err) {
          console.error('Failed to fetch detailed booking from database:', err);
        }
      };
      fetchBookingFromDb();
    }
  }, [bookingRef]);

  const processRecord = async (session) => {
    if (isProcessingRecord) return;
    setIsProcessingRecord(true);

    const storageKey = `processed_${type}_${sessionId}`;
    const alreadyProcessed = sessionStorage.getItem(storageKey);

    if (alreadyProcessed) {
      if (type === 'booking') {
        setBookingRef(alreadyProcessed);
      }
      setLoading(false);
      return;
    }

    try {
      const metadata = session.metadata;

      if (type === 'booking') {
        let bookingData = {};
        const pendingData = JSON.parse(sessionStorage.getItem('pendingPassenger') || 'null');
        const flightData = JSON.parse(sessionStorage.getItem('selectedFlight') || 'null');
        const returnFlightData = JSON.parse(sessionStorage.getItem('returnFlight') || 'null');

        if (pendingData && flightData) {
          // Reconstruct using rich sessionStorage data (multi-passenger support!)
          const customerName = `${pendingData.primaryContact.firstName} ${pendingData.primaryContact.lastName}`;
          
          // Combine outbound and inbound flights inside flight object
          const flightObj = {
            ...flightData,
            returnFlight: returnFlightData,
            billingAddress: pendingData.billingAddress,
            specialRequests: pendingData.specialRequests
          };

          const originalOut = parseFloat(flightData.price?.originalApiPrice || 0);
          const originalRet = returnFlightData ? parseFloat(returnFlightData.price?.originalApiPrice || 0) : 0;

          const pricingTotalStr = sessionStorage.getItem('pricingTotal');
          const displayedPrice = pricingTotalStr ? parseFloat(pricingTotalStr) : session.amount_total;

          bookingData = {
            customerName,
            email: pendingData.primaryContact.email,
            phone: pendingData.primaryContact.phone,
            passengers: pendingData.passengers,
            flight: flightObj,
            originalApiPrice: (originalOut + originalRet).toFixed(2),
            displayedWebsitePrice: displayedPrice.toFixed(2),
            paymentStatus: 'paid',
            transactionId: sessionId,
            currency: 'USD',
            status: 'PENDING'
          };
        } else {
          // Fallback to legacy metadata for single traveler if sessionStorage is cleared
          const flightDetails = {
            airline: metadata.flight_airline,
            flightNumber: metadata.flight_number,
            departure: {
              airport: metadata.flight_route.split(' to ')[0],
              date: metadata.flight_dep_time.split(' ')[0],
              time: metadata.flight_dep_time.split(' ')[1]
            },
            arrival: {
              airport: metadata.flight_route.split(' to ')[1],
              date: metadata.flight_arr_time.split(' ')[0],
              time: metadata.flight_arr_time.split(' ')[1]
            },
            class: metadata.flight_class,
            stops: parseInt(metadata.flight_stops || '0')
          };

          bookingData = {
            customerName: `${metadata.firstName} ${metadata.lastName}`,
            email: metadata.email,
            phone: metadata.phone,
            passengers: [{
              firstName: metadata.firstName,
              lastName: metadata.lastName,
              role: 'adult',
              gender: metadata.gender,
              dateOfBirth: metadata.dateOfBirth,
              nationality: metadata.nationality,
              passportNumber: metadata.passportNumber,
              passportExpiry: metadata.passportExpiry
            }],
            flight: flightDetails,
            originalApiPrice: (session.amount_total * 1.11).toFixed(2), // generic fallback estimation
            displayedWebsitePrice: session.amount_total.toFixed(2),
            paymentStatus: 'paid',
            transactionId: sessionId,
            currency: 'USD',
            status: 'PENDING'
          };
        }

        // Create booking in the backend
        const res = await bookingAPI.create(bookingData);
        if (res.success) {
          const ref = res.data.confirmation_code || res.data.bookingReference;
          setBookingRef(ref);
          sessionStorage.setItem(storageKey, ref);
        } else {
          throw new Error('Failed to record flight booking on backend');
        }
      } else if (type === 'consulting') {
        // Send consulting payment details to inquiries logs
        await inquiryAPI.submitConsulting(
          {
            name: metadata.name,
            email: metadata.email,
            phone: metadata.phone,
            origin: metadata.origin,
            destination: metadata.destination,
            notes: metadata.notes,
          },
          'consulting-payment'
        );
        sessionStorage.setItem(storageKey, 'completed');
      }
    } catch (err) {
      console.error('Record writing failed:', err);
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className="success-loading-container">
        <i className="fas fa-circle-notch fa-spin"></i>
        <p>Verifying secure transaction...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="success-error-container">
        <div className="error-icon-circle">
          <i className="fas fa-times-circle"></i>
        </div>
        <h2>Transaction Error</h2>
        <p>{error}</p>
        <div className="action-buttons no-print">
          <Link to="/" className="btn-secondary">Go to Homepage</Link>
          <Link to="/booking" className="btn-primary">Try Payment Again</Link>
        </div>
      </div>
    );
  }

  const { metadata, amount_total } = sessionDetails;
  
  // Choose the price from DB or Stripe session total
  const displayedPrice = bookingDataFromDb ? parseFloat(bookingDataFromDb.amount) : amount_total;

  return (
    <div className="payment-success-page">
      <Helmet>
        <title>Payment Successful | FareTransit</title>
      </Helmet>

      <div className="success-inner-wrapper">
        
        {/* Print-friendly Invoice Header */}
        <div className="invoice-print-header">
          <h2>FareTransit LLC</h2>
          <p>Temporary Booking Confirmation Receipt</p>
          <small>5830 E 2nd St, Ste 7000, Casper, WY 82609 · support@faretransit.com</small>
        </div>

        {/* Success Card Header */}
        <div className="success-card-header no-print">
          <div className="success-checkmark-wrapper">
            <svg className="checkmark-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 52 52">
              <circle className="checkmark-circle" cx="26" cy="26" r="25" fill="none"/>
              <path className="checkmark-check" fill="none" d="M14.1 27.2l7.1 7.2 16.7-16.8"/>
            </svg>
          </div>
          <h2>Thank you!</h2>
          <p style={{ fontSize: '1.15rem', color: '#1e293b', fontWeight: 'bold', margin: '0.5rem 0' }}>Your reservation request has been received successfully.</p>
          <p style={{ maxWidth: '600px', margin: '0 auto', color: '#475569' }}>Our travel specialists will verify your itinerary and manually issue your ticket shortly. A confirmation email has been sent.</p>
          
          <div className="booking-status-badge-container" style={{ margin: '1.5rem 0' }}>
            <span style={{ fontSize: '0.8rem', color: '#64748b', display: 'block', textTransform: 'uppercase', fontWeight: 'bold', letterSpacing: '0.05em' }}>Booking Status</span>
            <strong style={{ fontSize: '1.15rem', color: '#d97706', display: 'inline-block', padding: '6px 20px', backgroundColor: '#fef3c7', borderRadius: '30px', border: '1px solid #fcd34d', marginTop: '6px', fontWeight: '700' }}>
              {bookingDataFromDb?.status === 'DONE' ? 'Confirmed & Done' : 'Pending Confirmation'}
            </strong>
          </div>
        </div>

        {/* Receipt / Invoice Details */}
        <div className="receipt-main-card">
          <div className="receipt-section-header">
            <h3>Receipt & Order Summary</h3>
            <span className="receipt-badge">Paid</span>
          </div>

          <div className="receipt-details-grid">
            <div className="details-item">
              <span className="details-label">Amount Charged</span>
              <strong className="amount-highlight">${displayedPrice.toFixed(2)} USD</strong>
            </div>
            <div className="details-item">
              <span className="details-label">Payment Gateway</span>
              <span>Stripe (PCI Compliant)</span>
            </div>
            <div className="details-item">
              <span className="details-label">Transaction Reference</span>
              <span className="ref-code">{sessionId.substring(0, 20)}...</span>
            </div>
            <div className="details-item">
              <span className="details-label">Billing Name</span>
              <span>{bookingDataFromDb?.passenger_name || (type === 'booking' ? `${metadata.firstName} ${metadata.lastName}` : metadata.name)}</span>
            </div>
          </div>

          {/* Conditional view: Flight Booking Temporary Confirmation Ticket */}
          {type === 'booking' && (() => {
            const isAmtrak = (bookingDataFromDb?.flight_details?.airline || metadata.flight_airline || '').toLowerCase().includes('amtrak');
            const passengers = bookingDataFromDb?.traveller_details || [];
            
            return (
              <div className="receipt-item-details-box">
                <div className="ticket-label-overlay">
                  TEMPORARY BOOKING CONFIRMATION
                </div>
                
                <div className="boarding-pass-visual">
                  <div className="boarding-pass-header" style={{ borderBottom: isAmtrak ? '2px dashed #8b1538' : '2px dashed #1e3a5f' }}>
                    <span>{isAmtrak ? 'Operator' : 'Carrier'}: <strong>{bookingDataFromDb?.flight_details?.airline || metadata.flight_airline}</strong></span>
                    <span>{isAmtrak ? 'Train' : 'Flight'}: <strong>{bookingDataFromDb?.flight_details?.flightNumber || metadata.flight_number}</strong></span>
                    {bookingRef && <span className="ref-tag">Confirmation Code: <strong>{bookingRef}</strong></span>}
                  </div>
                  
                  <div className="boarding-pass-route">
                    <div className="route-terminal">
                      <h4>{bookingDataFromDb?.flight_details?.departure?.airport || metadata.flight_route?.split(' to ')[0]}</h4>
                      <span>Departure</span>
                      <small>{bookingDataFromDb?.flight_details?.departure?.date} {bookingDataFromDb?.flight_details?.departure?.time || metadata.flight_dep_time}</small>
                    </div>
                    
                    <div className="route-flight-symbol">
                      <i className={`fas ${isAmtrak ? 'fa-subway' : 'fa-plane'}`} style={{ color: isAmtrak ? '#8b1538' : '#1e3a5f' }}></i>
                      <span className="flight-dot-line"></span>
                    </div>
  
                    <div className="route-terminal">
                      <h4>{bookingDataFromDb?.flight_details?.arrival?.airport || metadata.flight_route?.split(' to ')[1]}</h4>
                      <span>Arrival</span>
                      <small>{bookingDataFromDb?.flight_details?.arrival?.date} {bookingDataFromDb?.flight_details?.arrival?.time || metadata.flight_arr_time}</small>
                    </div>
                  </div>

                  <div className="boarding-pass-passenger">
                    <div>
                      <span>Primary Contact</span>
                      <strong>{bookingDataFromDb?.passenger_name || `${metadata.firstName} ${metadata.lastName}`}</strong>
                    </div>
                    <div>
                      <span>Contact Info</span>
                      <strong style={{ fontSize: '0.85rem' }}>
                        {bookingDataFromDb?.email || metadata.email}<br/>
                        {bookingDataFromDb?.phone || metadata.phone}
                      </strong>
                    </div>
                    <div>
                      <span>{isAmtrak ? 'Seat Class' : 'Cabin Class'}</span>
                      <strong>{bookingDataFromDb?.flight_details?.class || metadata.flight_class}</strong>
                    </div>
                    <div>
                      <span>Travelers</span>
                      <strong>{passengers.length || 1}</strong>
                    </div>
                  </div>

                  {passengers.length > 0 && (
                    <div className="boarding-pass-manifest">
                      <div className="manifest-header">Passenger Manifest</div>
                      <table className="manifest-table">
                        <thead>
                          <tr>
                            <th>#</th>
                            <th>Name</th>
                            <th>DOB</th>
                            <th>Gender</th>
                            <th>Passport</th>
                            <th>Nationality</th>
                          </tr>
                        </thead>
                        <tbody>
                          {passengers.map((p, idx) => (
                            <tr key={idx}>
                              <td data-label="No.">{idx + 1}</td>
                              <td data-label="Name"><strong>{p.firstName} {p.middleName || ''} {p.lastName}</strong></td>
                              <td data-label="DOB">{p.dateOfBirth}</td>
                              <td data-label="Gender" style={{ textTransform: 'capitalize' }}>{p.gender}</td>
                              <td data-label="Passport">{p.passportNumber || 'N/A'}</td>
                              <td data-label="Nationality">{p.nationality || 'N/A'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                <div className="next-steps-info">
                  <strong>Notice of Reservation:</strong>
                  <ul>
                    <li>Your {isAmtrak ? 'train transit reservation' : 'flight reservation'} is registered under reference <strong>{bookingRef || 'Pending'}</strong>.</li>
                    <li>This is a temporary confirmation showing details recorded after successful checkout. Your final airline ticket is being issued.</li>
                    <li>A detailed confirmation itinerary and {isAmtrak ? 'train ticket receipt' : 'flight e-ticket'} has been sent to <strong>{bookingDataFromDb?.email || metadata.email}</strong>.</li>
                    <li>For support or changes, call us anytime at {SUPPORT_PHONE_DISPLAY}.</li>
                  </ul>
                </div>
              </div>
            );
          })()}

          {/* Conditional view: Consulting Payment */}
          {type === 'consulting' && (
            <div className="receipt-item-details-box">
              <div className="receipt-sub-header">
                <i className="fas fa-concierge-bell"></i> Consulting Service Plan
              </div>
              
              <div className="consulting-receipt-visual">
                <h4>{metadata.plan_name}</h4>
                <p>Urgent travel logistics advisory, itinerary coordination, and support services.</p>
                <div className="consulting-meta-row">
                  <div>
                    <span>Associated Email</span>
                    <strong>{metadata.email}</strong>
                  </div>
                  <div>
                    <span>Contact Number</span>
                    <strong>{metadata.phone || 'Not provided'}</strong>
                  </div>
                </div>
              </div>

              <div className="next-steps-info">
                <strong>What Happens Next:</strong>
                <ul>
                  <li>An advisor has been assigned to your travel request and is reviewing your details.</li>
                  <li>We will contact you via email or phone at <strong>{metadata.phone || metadata.email}</strong> within 2 hours.</li>
                  <li>If you require immediate dispatch, call our hotline at {SUPPORT_PHONE_DISPLAY}.</li>
                </ul>
              </div>
            </div>
          )}
        </div>

        {/* Buttons */}
        <div className="action-buttons-wrapper no-print">
          <button onClick={handlePrint} className="success-btn success-btn-secondary">
            <i className="fas fa-print"></i> View / Download Temporary Ticket
          </button>
          <Link to="/my-bookings" className="success-btn success-btn-accent">
            <i className="fas fa-calendar-check"></i> Go to My Bookings
          </Link>
          <Link to="/" className="success-btn success-btn-primary">
            Go to Homepage
          </Link>
        </div>

        <div className="success-footer">
          <p>FareTransit LLC · Casper, WY · support@faretransit.com</p>
        </div>
      </div>
    </div>
  );
}

export default PaymentSuccess;
