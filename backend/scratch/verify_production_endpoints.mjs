import { bookingService } from '../src/modules/bookings/booking.service.mjs';
import { adminController } from '../src/modules/admin/admin.controller.mjs';
import bookingRepository from '../src/modules/bookings/booking.repository.mjs';

async function runProductionDiagnosticTests() {
  console.log('=== RUNNING ADMIN CREATE BOOKING PRODUCTION DIAGNOSTICS ===');

  // Test Case A: Create Booking Without Payment (EWR -> IAH -> MDE, MDE -> IAH -> EWR, $741 USD)
  const reqAKey = `test_no_pay_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const payloadA = {
    actionType: 'create_without_payment',
    clientRequestId: reqAKey,
    customerName: 'Senior Traveler',
    email: 'seniortraveler@example.com',
    phone: '+1 555-019-2831',
    customer_price: 741,
    supplier_price: 650,
    currency: 'USD',
    passengers: [
      { role: 'adult', title: 'Mr', firstName: 'Senior', lastName: 'Traveler', dateOfBirth: '1955-04-12', gender: 'Male' }
    ],
    flight: {
      tripType: 'round-trip',
      outbound: [
        { carrier_code: 'UA', carrierCode: 'UA', flight_number: '1234', flightNumber: '1234', origin_airport: 'EWR', departureAirport: 'EWR', destination_airport: 'IAH', arrivalAirport: 'IAH', departure_date: '2026-09-15', departureDate: '2026-09-15', departure_time: '08:00', departureTime: '08:00', arrival_date: '2026-09-15', arrivalDate: '2026-09-15', arrival_time: '11:00', arrivalTime: '11:00', cabin: 'Economy' }
      ],
      return: [
        { carrier_code: 'UA', carrierCode: 'UA', flight_number: '4321', flightNumber: '4321', origin_airport: 'IAH', departureAirport: 'IAH', destination_airport: 'EWR', arrivalAirport: 'EWR', departure_date: '2026-09-25', departureDate: '2026-09-25', departure_time: '15:30', departureTime: '15:30', arrival_date: '2026-09-25', arrivalDate: '2026-09-25', arrival_time: '20:15', arrivalTime: '20:15', cabin: 'Economy' }
      ],
      price: 741
    },
    billingDetails: {
      cardholderName: 'Senior Traveler',
      addressLine1: '456 Oak Avenue',
      city: 'Newark',
      state: 'NJ',
      postalCode: '07102',
      country: 'United States',
      cardBrand: 'visa',
      cardLast4: '4321',
      expMonth: '10',
      expYear: '2028'
    }
  };

  const tAStart = Date.now();
  const resA = await bookingService.create(payloadA);
  const durA = Date.now() - tAStart;
  console.log(`[Test A — Create Without Payment] Duration: ${durA}ms | ID: ${resA.id} | Code: ${resA.confirmation_code} | Price: $${resA.customer_price}`);

  // Test Case B: Save Draft (Incomplete info, no DOB, no flight itinerary required)
  const reqBKey = `test_draft_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const payloadB = {
    actionType: 'create_draft',
    clientRequestId: reqBKey,
    customerName: 'Draft Customer',
    email: 'draftcustomer@example.com',
    passengers: [
      { role: 'adult', firstName: 'Draft', lastName: 'Customer', dateOfBirth: '' }
    ]
  };

  const tBStart = Date.now();
  const resB = await bookingService.create(payloadB);
  const durB = Date.now() - tBStart;
  console.log(`[Test B — Save Draft] Duration: ${durB}ms | ID: ${resB.id} | Status: ${resB.status} | Code: ${resB.confirmation_code} | Emails: ${resB.emailDeliveryStatus}`);

  // Test Case C: Create & Send Auth (Phase 1 Creation + Phase 2 Auth Endpoint)
  const reqCKey = `test_auth_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const payloadC = {
    actionType: 'create_and_send_auth',
    clientRequestId: reqCKey,
    customerName: 'Jane Smith',
    email: 'janesmith@example.com',
    phone: '+1 555-019-4920',
    customer_price: 741,
    currency: 'USD',
    passengers: [
      { role: 'adult', title: 'Ms', firstName: 'Jane', lastName: 'Smith', dateOfBirth: '1980-07-22', gender: 'Female' }
    ],
    flight: {
      tripType: 'one-way',
      outbound: [
        { carrier_code: 'UA', carrierCode: 'UA', flight_number: '100', flightNumber: '100', origin_airport: 'EWR', departureAirport: 'EWR', destination_airport: 'IAH', arrivalAirport: 'IAH', departure_date: '2026-10-01', departureDate: '2026-10-01', departure_time: '09:00', departureTime: '09:00', arrival_date: '2026-10-01', arrivalDate: '2026-10-01', arrival_time: '12:00', arrivalTime: '12:00', cabin: 'Economy' }
      ],
      price: 741
    },
    billingDetails: {
      cardholderName: 'Jane Smith',
      addressLine1: '789 Pine St',
      city: 'Jersey City',
      state: 'NJ',
      postalCode: '07302',
      country: 'United States',
      cardBrand: 'mastercard',
      cardLast4: '9876',
      expMonth: '12',
      expYear: '2029'
    }
  };

  const tCStart = Date.now();
  const resC = await bookingService.create(payloadC);
  const durCPhase1 = Date.now() - tCStart;
  console.log(`[Test C — Phase 1 Creation] Duration: ${durCPhase1}ms | ID: ${resC.id} | Code: ${resC.confirmation_code}`);

  // Test Reconciliation via clientRequestId
  const tReconStart = Date.now();
  const reconRes = await bookingRepository.getBookingByClientRequestId(reqAKey);
  const durRecon = Date.now() - tReconStart;
  console.log(`[Test Reconciliation] Duration: ${durRecon}ms | Found: ${!!reconRes} | ID: ${reconRes?.id}`);

  console.log('=== DIAGNOSTICS COMPLETE ===');
}

runProductionDiagnosticTests().catch(err => {
  console.error('Diagnostic run error:', err);
  process.exit(1);
});
