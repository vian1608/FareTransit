import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Helmet } from 'react-helmet-async';
import { inquiryAPI } from '../../../shared/api/api';
import analytics, { trackLeadConversion } from '../../../shared/utils/analytics';
import {
  SUPPORT_PHONE_DISPLAY,
  SUPPORT_PHONE_HREF,
} from '../../../shared/constants/supportContact';
import './SeniorTravelPage.css';

/* ============================================================
   Destination data
   ============================================================ */
const DESTINATIONS = [
  {
    flag: '🇯🇵',
    name: 'Japan',
    cities: ['Tokyo (NRT / HND)', 'Osaka (KIX)', 'Kyoto connections'],
    id: 'japan',
  },
  {
    flag: '🇵🇭',
    name: 'Philippines',
    cities: ['Manila (MNL)', 'Cebu (CEB)', 'Clark (CRK)'],
    id: 'philippines',
  },
  {
    flag: '🇸🇬',
    name: 'Singapore',
    cities: ['Changi Airport (SIN)'],
    id: 'singapore',
  },
  {
    flag: '🌴',
    name: 'Vacation Destinations',
    cities: ['Thailand (BKK)', 'Bali (DPS)', 'Maldives (MLE)', 'Dubai (DXB)', 'Mexico (CUN)', 'Costa Rica (SJO)', 'Caribbean'],
    id: 'vacation',
  },
];

/* ============================================================
   FAQ data
   ============================================================ */
const FAQS = [
  {
    q: 'Do you offer special senior airline discounts?',
    a: 'Available fares depend on the airline, route, travel date and cabin. Our specialists help compare suitable flight options and explain the pricing clearly.',
  },
  {
    q: 'Can someone help me book by phone?',
    a: 'Yes. You can speak with a travel specialist for assistance reviewing routes, dates, cabin options and booking details.',
  },
  {
    q: 'Can a family member book for a senior traveler?',
    a: 'Yes. A family member or caregiver may submit a flight request on behalf of the traveler.',
  },
  {
    q: 'Do you offer business-class flights?',
    a: 'Yes. Economy, premium economy, business-class and first-class options may be requested, depending on route availability.',
  },
  {
    q: 'Which destinations are supported?',
    a: 'We currently accept requests for Japan, the Philippines, Singapore and selected vacation destinations including Thailand, Bali, the Maldives, Dubai, Mexico, Costa Rica and Caribbean destinations.',
  },
  {
    q: 'Can I request wheelchair or airport assistance?',
    a: 'Customers may include special-assistance requests in the form. Airline approval and availability must be confirmed separately.',
  },
];

/* ============================================================
   Helpers
   ============================================================ */
function preserveUtmParams() {
  if (typeof window === 'undefined') return {};
  const params = {};
  const url = new URL(window.location.href);
  ['utm_source','utm_medium','utm_campaign','utm_content','device','network','gclid','gbraid','wbraid']
    .forEach(k => { if (url.searchParams.get(k)) params[k] = url.searchParams.get(k); });
  return params;
}

/* ============================================================
   Sub-components
   ============================================================ */
function FaqItem({ faq }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`st-faq-item${open ? ' open' : ''}`}>
      <button
        className="st-faq-question"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
      >
        <span>{faq.q}</span>
        <span className="st-faq-icon" aria-hidden="true">{open ? '−' : '+'}</span>
      </button>
      {open && <div className="st-faq-answer">{faq.a}</div>}
    </div>
  );
}

/* ============================================================
   Main Page
   ============================================================ */
export default function SeniorTravelPage() {
  const formRef = useRef(null);
  const [tripType, setTripType] = useState('round-trip');
  const [formStarted, setFormStarted] = useState(false);
  const [submitStatus, setSubmitStatus] = useState('idle'); // idle | submitting | success | error
  const [submitMessage, setSubmitMessage] = useState('');
  const [bookingRef, setBookingRef] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});

  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    contactMethod: 'phone',
    origin: '',
    destination: '',
    departureDate: '',
    returnDate: '',
    adults: '1',
    seniors: '1',
    cabin: 'economy',
    flexibleDates: 'no',
    notes: '',
    consent: false,
    // prefill
    preferredDestination: '',
  });

  /* ---- Page view ---- */
  useEffect(() => {
    analytics.trackSeoPageView('senior_landing_page_view');
    if (typeof window !== 'undefined' && window.gtag) {
      window.gtag('event', 'senior_landing_page_view');
    }
  }, []);

  /* ---- UTM preservation ---- */
  const utmParams = useRef(preserveUtmParams());

  /* ---- Scroll to form ---- */
  const scrollToForm = useCallback((prefillDestination = '') => {
    if (prefillDestination) {
      setForm(prev => ({ ...prev, preferredDestination: prefillDestination }));
    }
    setTimeout(() => {
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
  }, []);

  /* ---- Form change ---- */
  const handleChange = useCallback((e) => {
    const { name, value, type, checked } = e.target;
    if (!formStarted) {
      setFormStarted(true);
      if (typeof window !== 'undefined' && window.gtag) {
        window.gtag('event', 'senior_form_start');
      }
    }
    setForm(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
    setFieldErrors(prev => ({ ...prev, [name]: '' }));
  }, [formStarted]);

  /* ---- Validation ---- */
  const validate = () => {
    const errors = {};
    if (!form.name.trim()) errors.name = 'Full name is required.';
    if (!form.phone.trim()) errors.phone = 'Phone number is required.';
    if (!form.email.trim()) errors.email = 'Email address is required.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errors.email = 'Enter a valid email address.';
    if (!form.origin.trim()) errors.origin = 'Departure airport or city is required.';
    if (!form.destination.trim()) errors.destination = 'Destination airport or city is required.';
    if (!form.departureDate) errors.departureDate = 'Departure date is required.';
    if (tripType === 'round-trip' && !form.returnDate) errors.returnDate = 'Return date is required for round trips.';
    if (!form.consent) errors.consent = 'You must agree to be contacted.';
    return errors;
  };

  /* ---- Submit ---- */
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitStatus === 'submitting' || submitStatus === 'success') return;

    const errors = validate();
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setSubmitStatus('error');
      setSubmitMessage('Please correct the highlighted fields below.');
      if (typeof window !== 'undefined' && window.gtag) {
        window.gtag('event', 'senior_form_error', { error_count: Object.keys(errors).length });
      }
      return;
    }

    setSubmitStatus('submitting');
    setSubmitMessage('');
    setFieldErrors({});

    if (typeof window !== 'undefined' && window.gtag) {
      window.gtag('event', 'senior_form_submitted');
    }

    try {
      const clientRequestId = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

      const payload = {
        serviceType: 'senior-travel',
        clientRequestId,
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        contactMethod: form.contactMethod,
        origin: form.origin.trim(),
        destination: form.destination.trim(),
        travelDate: form.departureDate,
        returnDate: tripType === 'round-trip' ? form.returnDate : undefined,
        tripType,
        passengers: String(parseInt(form.adults, 10) + parseInt(form.seniors, 10)),
        adults: form.adults,
        seniors: form.seniors,
        cabin: form.cabin,
        flexibleDates: form.flexibleDates,
        preferredDestination: form.preferredDestination || form.destination.trim(),
        notes: form.notes.trim(),
        source: 'senior-travel-landing',
        ...utmParams.current,
      };

      const rawResponse = await inquiryAPI.submitConsulting(payload);
      const result = rawResponse?.data ?? rawResponse;

      if (result?.success === true && result?.persisted === true && result?.leadId) {
        const ref = result.leadId;
        setBookingRef(ref);
        setSubmitStatus('success');
        setSubmitMessage('');

        // Google Ads conversion — only fires here, once, after confirmed backend success
        trackLeadConversion({
          leadId: ref,
          value: 1.0,
          currency: 'USD',
        });

        if (typeof window !== 'undefined' && window.gtag) {
          window.gtag('event', 'senior_form_submitted', { success: true });
        }

        // Reset form
        setForm({
          name: '', email: '', phone: '', contactMethod: 'phone',
          origin: '', destination: '', departureDate: '', returnDate: '',
          adults: '1', seniors: '1', cabin: 'economy', flexibleDates: 'no',
          notes: '', consent: false, preferredDestination: '',
        });
        setTripType('round-trip');
      } else {
        throw new Error(result?.message || 'Request submission failed. Please try again.');
      }
    } catch (err) {
      setSubmitStatus('error');
      setSubmitMessage(
        err?.response?.data?.error ||
        err?.message ||
        'Unable to submit your request right now. Please call us directly.'
      );
    }
  };

  const today = new Date().toISOString().split('T')[0];

  return (
    <>
      {/* =========================================================
          SEO — Helmet
          ========================================================= */}
      <Helmet>
        <title>Senior Flight Assistance &amp; International Flight Deals | FareTransit</title>
        <meta
          name="description"
          content="Get personal help comparing international economy and business-class flights for senior travelers, including Japan, the Philippines, Singapore and vacation destinations."
        />
        <meta
          name="keywords"
          content="senior travel flights, flight assistance for seniors, international flights for seniors, Japan flights, Philippines flights, Singapore flights, business class senior travel"
        />
        <link rel="canonical" href="https://faretransit.com/senior-travel/flight-deals" />
        <meta property="og:title" content="Senior Flight Assistance & International Flight Deals | FareTransit" />
        <meta
          property="og:description"
          content="Personal help comparing international economy and business-class flights for senior travelers."
        />
        <meta property="og:url" content="https://faretransit.com/senior-travel/flight-deals" />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Senior Flight Assistance & International Flight Deals | FareTransit" />
        <meta
          name="twitter:description"
          content="Personal help comparing international economy and business-class flights for senior travelers."
        />
        {/* Structured Data */}
        <script type="application/ld+json">{JSON.stringify({
          '@context': 'https://schema.org',
          '@graph': [
            {
              '@type': 'Organization',
              name: 'FareTransit',
              url: 'https://faretransit.com',
              telephone: '+12139659727',
              contactPoint: {
                '@type': 'ContactPoint',
                telephone: '+1-213-965-9727',
                contactType: 'customer service',
                areaServed: 'US',
                availableLanguage: 'English',
              },
            },
            {
              '@type': 'Service',
              name: 'Senior Flight Booking Assistance',
              provider: { '@type': 'Organization', name: 'FareTransit' },
              description: 'Personal flight booking assistance for senior travelers including international economy and business-class options to Japan, Philippines, Singapore and vacation destinations.',
              areaServed: 'US',
              serviceType: 'Travel Assistance',
            },
            {
              '@type': 'BreadcrumbList',
              itemListElement: [
                { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://faretransit.com' },
                { '@type': 'ListItem', position: 2, name: 'Senior Travel', item: 'https://faretransit.com/senior-travel' },
                { '@type': 'ListItem', position: 3, name: 'Flight Deals', item: 'https://faretransit.com/senior-travel/flight-deals' },
              ],
            },
            {
              '@type': 'FAQPage',
              mainEntity: FAQS.map(f => ({
                '@type': 'Question',
                name: f.q,
                acceptedAnswer: { '@type': 'Answer', text: f.a },
              })),
            },
          ],
        })}</script>
      </Helmet>

      <div className="senior-travel-page">

        {/* =========================================================
            HERO
            ========================================================= */}
        <section className="st-hero" aria-labelledby="st-hero-heading">
          <div className="container">
            <div className="st-hero__content">
              <span className="st-hero__eyebrow">
                <i className="fas fa-plane" aria-hidden="true"></i>
                FareTransit — Senior Travel Assistance
              </span>
              <h1 id="st-hero-heading">
                Personal Flight Booking Assistance for Senior Travelers
              </h1>
              <p className="st-hero__sub">
                Compare international economy and business-class flight options with personal support from a travel specialist.
              </p>
              <p className="st-hero__reassurance">
                <i className="fas fa-shield-check" aria-hidden="true"></i>
                Clear options, human assistance and support throughout your booking journey.
              </p>
              <div className="st-hero__actions">
                <button
                  id="hero-request-btn"
                  className="btn-hero-primary"
                  onClick={() => scrollToForm()}
                  aria-label="Request flight options — scroll to form"
                >
                  <i className="fas fa-paper-plane" aria-hidden="true"></i>
                  Request Flight Options
                </button>
                <a
                  id="hero-call-btn"
                  href={SUPPORT_PHONE_HREF}
                  className="btn-hero-call"
                  onClick={() => {
                    if (typeof window !== 'undefined' && window.gtag) {
                      window.gtag('event', 'senior_phone_click', { location: 'hero' });
                    }
                  }}
                  aria-label={`Call us at ${SUPPORT_PHONE_DISPLAY}`}
                >
                  <i className="fas fa-phone" aria-hidden="true"></i>
                  Call {SUPPORT_PHONE_DISPLAY}
                </a>
              </div>
            </div>
            <div className="st-hero__image" role="img" aria-label="Senior couple traveling together">
              <img
                src="https://images.unsplash.com/photo-1504598318550-17eba1008a68?w=800&q=80"
                alt="Senior couple at an airport departure lounge, smiling and ready to travel"
                loading="eager"
                width="800"
                height="600"
              />
            </div>
          </div>
        </section>

        {/* =========================================================
            BENEFITS
            ========================================================= */}
        <section className="st-section" aria-labelledby="benefits-heading">
          <div className="container">
            <p className="st-section-label">Why Choose Us</p>
            <h2 id="benefits-heading" className="st-section-title">
              Flight Assistance Designed for Senior Travelers
            </h2>
            <p className="st-section-sub">
              Our travel specialists make the booking process comfortable, clear and personal from start to finish.
            </p>
            <div className="st-benefits-grid">
              {[
                {
                  icon: 'fas fa-headset',
                  title: 'Personal Booking Support',
                  desc: 'Speak with a travel specialist who can help review your trip details.',
                },
                {
                  icon: 'fas fa-route',
                  title: 'Flexible Itinerary Options',
                  desc: 'Compare routes, schedules, stops and travel dates.',
                },
                {
                  icon: 'fas fa-chair',
                  title: 'Economy & Business Class',
                  desc: 'Explore comfortable options based on your preferred budget and cabin.',
                },
                {
                  icon: 'fas fa-globe-americas',
                  title: 'International Destinations',
                  desc: 'Request flights to Japan, the Philippines, Singapore and selected vacation destinations.',
                },
              ].map((b) => (
                <article key={b.title} className="st-benefit-card">
                  <div className="st-benefit-icon" aria-hidden="true">
                    <i className={b.icon}></i>
                  </div>
                  <h3>{b.title}</h3>
                  <p>{b.desc}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* =========================================================
            DESTINATIONS
            ========================================================= */}
        <section className="st-section st-section--alt" aria-labelledby="destinations-heading">
          <div className="container">
            <p className="st-section-label">Where We Can Help</p>
            <h2 id="destinations-heading" className="st-section-title">
              Popular International Destinations
            </h2>
            <p className="st-section-sub">
              Our team regularly assists travelers heading to these destinations.
            </p>
            <div className="st-destinations-grid">
              {DESTINATIONS.map((dest) => (
                <article key={dest.id} className="st-dest-card">
                  <div className="st-dest-card__header">
                    <span className="st-dest-flag" role="img" aria-label={dest.name}>{dest.flag}</span>
                    <h3>{dest.name}</h3>
                  </div>
                  <div className="st-dest-card__body">
                    <ul className="st-dest-card__cities" aria-label={`Cities in ${dest.name}`}>
                      {dest.cities.map(c => (
                        <li key={c}>{c}</li>
                      ))}
                    </ul>
                    <button
                      className="btn-dest"
                      id={`dest-btn-${dest.id}`}
                      onClick={() => {
                        if (typeof window !== 'undefined' && window.gtag) {
                          window.gtag('event', 'senior_destination_selected', { destination: dest.name });
                        }
                        scrollToForm(dest.name);
                      }}
                      aria-label={`Request flights to ${dest.name}`}
                    >
                      Request This Route
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* =========================================================
            HOW IT WORKS
            ========================================================= */}
        <section className="st-section" aria-labelledby="how-it-works-heading">
          <div className="container">
            <p className="st-section-label">The Process</p>
            <h2 id="how-it-works-heading" className="st-section-title">
              How Senior Flight Assistance Works
            </h2>
            <p className="st-section-sub">Three clear steps from inquiry to confirmed itinerary.</p>
            <div className="st-steps">
              {[
                {
                  num: '1',
                  title: 'Tell Us About Your Trip',
                  desc: 'Share your preferred route, dates, number of passengers and cabin preference.',
                },
                {
                  num: '2',
                  title: 'Review Available Options',
                  desc: 'A travel specialist helps compare suitable flight options for your journey.',
                },
                {
                  num: '3',
                  title: 'Complete Your Booking',
                  desc: 'Review the itinerary and pricing before completing authorization and payment.',
                },
              ].map((step) => (
                <div key={step.num} className="st-step">
                  <div className="st-step__num" aria-hidden="true">{step.num}</div>
                  <h3>{step.title}</h3>
                  <p>{step.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* =========================================================
            FLIGHT REQUEST FORM
            ========================================================= */}
        <section
          id="flight-request-form"
          className="st-section st-section--alt"
          aria-labelledby="form-heading"
          ref={formRef}
        >
          <div className="container">
            <p className="st-section-label">Get Started</p>
            <h2 id="form-heading" className="st-section-title" style={{ textAlign: 'center' }}>
              Request Flight Options
            </h2>
            <p className="st-section-sub" style={{ textAlign: 'center', margin: '0 auto 32px' }}>
              Fill in the details below and a travel specialist will review your request and get back to you.
            </p>

            <div className="st-form-container">
              {/* ---- Success State ---- */}
              {submitStatus === 'success' ? (
                <div className="st-form-success" role="status" aria-live="polite">
                  <i className="fas fa-check-circle" style={{ fontSize: '2.5rem', color: '#15803d', marginBottom: '12px' }} aria-hidden="true"></i>
                  <h3>Your flight request has been received.</h3>
                  <p>A travel specialist will review your trip details and contact you shortly.</p>
                  {bookingRef && (
                    <p className="ref-badge">
                      <i className="fas fa-tag" aria-hidden="true"></i>
                      Reference: {bookingRef}
                    </p>
                  )}
                  <div style={{ marginTop: '24px' }}>
                    <button
                      className="btn-hero-primary"
                      onClick={() => {
                        setSubmitStatus('idle');
                        setBookingRef('');
                      }}
                    >
                      Submit Another Request
                    </button>
                  </div>
                </div>
              ) : (
                <form
                  id="senior-flight-request-form"
                  onSubmit={handleSubmit}
                  noValidate
                  aria-label="Senior flight request form"
                >
                  {/* Trip Type */}
                  <p className="st-form-section-label">Trip Type</p>
                  <div className="st-trip-types" role="group" aria-label="Select trip type">
                    {[
                      { val: 'round-trip', label: 'Round Trip' },
                      { val: 'one-way', label: 'One Way' },
                      { val: 'multi-city', label: 'Multi-City' },
                    ].map(({ val, label }) => (
                      <button
                        key={val}
                        type="button"
                        id={`trip-type-${val}`}
                        className={`st-trip-type-btn${tripType === val ? ' active' : ''}`}
                        onClick={() => setTripType(val)}
                        aria-pressed={tripType === val}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  <hr className="st-form-divider" />

                  {/* Route */}
                  <p className="st-form-section-label">Flight Details</p>
                  <div className="st-form-grid">
                    <div className="st-form-group">
                      <label htmlFor="origin">
                        Departure Airport or City <span className="required" aria-hidden="true">*</span>
                      </label>
                      <input
                        id="origin"
                        name="origin"
                        type="text"
                        value={form.origin}
                        onChange={handleChange}
                        placeholder="e.g. New York (JFK), Los Angeles (LAX)"
                        className={fieldErrors.origin ? 'error' : ''}
                        aria-required="true"
                        aria-describedby={fieldErrors.origin ? 'origin-error' : undefined}
                        autoComplete="off"
                      />
                      {fieldErrors.origin && (
                        <span id="origin-error" className="st-field-error" role="alert">
                          <i className="fas fa-exclamation-circle" aria-hidden="true"></i>
                          {fieldErrors.origin}
                        </span>
                      )}
                    </div>
                    <div className="st-form-group">
                      <label htmlFor="destination">
                        Destination Airport or City <span className="required" aria-hidden="true">*</span>
                      </label>
                      <input
                        id="destination"
                        name="destination"
                        type="text"
                        value={form.destination}
                        onChange={handleChange}
                        placeholder="e.g. Tokyo (NRT), Manila (MNL)"
                        className={fieldErrors.destination ? 'error' : ''}
                        aria-required="true"
                        aria-describedby={fieldErrors.destination ? 'destination-error' : undefined}
                        autoComplete="off"
                      />
                      {fieldErrors.destination && (
                        <span id="destination-error" className="st-field-error" role="alert">
                          <i className="fas fa-exclamation-circle" aria-hidden="true"></i>
                          {fieldErrors.destination}
                        </span>
                      )}
                    </div>
                    <div className="st-form-group">
                      <label htmlFor="departureDate">
                        Departure Date <span className="required" aria-hidden="true">*</span>
                      </label>
                      <input
                        id="departureDate"
                        name="departureDate"
                        type="date"
                        value={form.departureDate}
                        onChange={handleChange}
                        min={today}
                        className={fieldErrors.departureDate ? 'error' : ''}
                        aria-required="true"
                        aria-describedby={fieldErrors.departureDate ? 'depdate-error' : undefined}
                      />
                      {fieldErrors.departureDate && (
                        <span id="depdate-error" className="st-field-error" role="alert">
                          <i className="fas fa-exclamation-circle" aria-hidden="true"></i>
                          {fieldErrors.departureDate}
                        </span>
                      )}
                    </div>
                    {tripType === 'round-trip' && (
                      <div className="st-form-group">
                        <label htmlFor="returnDate">
                          Return Date <span className="required" aria-hidden="true">*</span>
                        </label>
                        <input
                          id="returnDate"
                          name="returnDate"
                          type="date"
                          value={form.returnDate}
                          onChange={handleChange}
                          min={form.departureDate || today}
                          className={fieldErrors.returnDate ? 'error' : ''}
                          aria-required="true"
                          aria-describedby={fieldErrors.returnDate ? 'retdate-error' : undefined}
                        />
                        {fieldErrors.returnDate && (
                          <span id="retdate-error" className="st-field-error" role="alert">
                            <i className="fas fa-exclamation-circle" aria-hidden="true"></i>
                            {fieldErrors.returnDate}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  <hr className="st-form-divider" />

                  {/* Passengers */}
                  <p className="st-form-section-label">Passengers &amp; Cabin</p>
                  <div className="st-form-grid three-col">
                    <div className="st-form-group">
                      <label htmlFor="adults">Number of Adults</label>
                      <select id="adults" name="adults" value={form.adults} onChange={handleChange}>
                        {[1,2,3,4,5,6].map(n => (
                          <option key={n} value={n}>{n} Adult{n > 1 ? 's' : ''}</option>
                        ))}
                      </select>
                    </div>
                    <div className="st-form-group">
                      <label htmlFor="seniors">Number of Senior Travelers</label>
                      <select id="seniors" name="seniors" value={form.seniors} onChange={handleChange}>
                        {[0,1,2,3,4,5,6].map(n => (
                          <option key={n} value={n}>{n} Senior{n !== 1 ? 's' : ''}</option>
                        ))}
                      </select>
                    </div>
                    <div className="st-form-group">
                      <label htmlFor="cabin">Cabin Preference</label>
                      <select id="cabin" name="cabin" value={form.cabin} onChange={handleChange}>
                        <option value="economy">Economy</option>
                        <option value="premium-economy">Premium Economy</option>
                        <option value="business">Business Class</option>
                        <option value="first">First Class</option>
                      </select>
                    </div>
                  </div>

                  <div className="st-form-grid" style={{ marginTop: '16px' }}>
                    <div className="st-form-group">
                      <label htmlFor="preferredDestination">Preferred Destination (optional)</label>
                      <select
                        id="preferredDestination"
                        name="preferredDestination"
                        value={form.preferredDestination}
                        onChange={handleChange}
                      >
                        <option value="">— Select a region —</option>
                        <option value="Japan">Japan</option>
                        <option value="Philippines">Philippines</option>
                        <option value="Singapore">Singapore</option>
                        <option value="Thailand">Thailand</option>
                        <option value="Bali">Bali</option>
                        <option value="Maldives">Maldives</option>
                        <option value="Dubai">Dubai</option>
                        <option value="Mexico">Mexico</option>
                        <option value="Costa Rica">Costa Rica</option>
                        <option value="Caribbean">Caribbean</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>
                    <div className="st-form-group">
                      <label htmlFor="flexibleDates">Are your travel dates flexible?</label>
                      <select id="flexibleDates" name="flexibleDates" value={form.flexibleDates} onChange={handleChange}>
                        <option value="no">No — fixed dates</option>
                        <option value="yes">Yes — flexible by a few days</option>
                      </select>
                    </div>
                  </div>

                  <hr className="st-form-divider" />

                  {/* Contact */}
                  <p className="st-form-section-label">Your Contact Details</p>
                  <div className="st-form-grid">
                    <div className="st-form-group">
                      <label htmlFor="name">
                        Full Name <span className="required" aria-hidden="true">*</span>
                      </label>
                      <input
                        id="name"
                        name="name"
                        type="text"
                        value={form.name}
                        onChange={handleChange}
                        placeholder="Your full name"
                        className={fieldErrors.name ? 'error' : ''}
                        aria-required="true"
                        aria-describedby={fieldErrors.name ? 'name-error' : undefined}
                        autoComplete="name"
                      />
                      {fieldErrors.name && (
                        <span id="name-error" className="st-field-error" role="alert">
                          <i className="fas fa-exclamation-circle" aria-hidden="true"></i>
                          {fieldErrors.name}
                        </span>
                      )}
                    </div>
                    <div className="st-form-group">
                      <label htmlFor="email">
                        Email Address <span className="required" aria-hidden="true">*</span>
                      </label>
                      <input
                        id="email"
                        name="email"
                        type="email"
                        value={form.email}
                        onChange={handleChange}
                        placeholder="your@email.com"
                        className={fieldErrors.email ? 'error' : ''}
                        aria-required="true"
                        aria-describedby={fieldErrors.email ? 'email-error' : undefined}
                        autoComplete="email"
                      />
                      {fieldErrors.email && (
                        <span id="email-error" className="st-field-error" role="alert">
                          <i className="fas fa-exclamation-circle" aria-hidden="true"></i>
                          {fieldErrors.email}
                        </span>
                      )}
                    </div>
                    <div className="st-form-group">
                      <label htmlFor="phone">
                        Phone Number <span className="required" aria-hidden="true">*</span>
                      </label>
                      <input
                        id="phone"
                        name="phone"
                        type="tel"
                        value={form.phone}
                        onChange={handleChange}
                        placeholder="(555) 000-0000"
                        className={fieldErrors.phone ? 'error' : ''}
                        aria-required="true"
                        aria-describedby={fieldErrors.phone ? 'phone-error' : undefined}
                        autoComplete="tel"
                      />
                      {fieldErrors.phone && (
                        <span id="phone-error" className="st-field-error" role="alert">
                          <i className="fas fa-exclamation-circle" aria-hidden="true"></i>
                          {fieldErrors.phone}
                        </span>
                      )}
                    </div>
                    <div className="st-form-group">
                      <label htmlFor="contactMethod">Preferred Contact Method</label>
                      <select id="contactMethod" name="contactMethod" value={form.contactMethod} onChange={handleChange}>
                        <option value="phone">Phone</option>
                        <option value="email">Email</option>
                      </select>
                    </div>
                  </div>

                  <div className="st-form-grid full" style={{ marginTop: '16px' }}>
                    <div className="st-form-group">
                      <label htmlFor="notes">Special Requests or Travel Assistance Notes</label>
                      <textarea
                        id="notes"
                        name="notes"
                        rows={4}
                        value={form.notes}
                        onChange={handleChange}
                        placeholder="e.g. wheelchair assistance, dietary needs, preferred airlines, connection preferences…"
                      />
                    </div>
                  </div>

                  <hr className="st-form-divider" />

                  {/* Consent */}
                  <div className="st-consent">
                    <input
                      id="consent"
                      name="consent"
                      type="checkbox"
                      checked={form.consent}
                      onChange={handleChange}
                      aria-required="true"
                      aria-describedby={fieldErrors.consent ? 'consent-error' : undefined}
                    />
                    <label htmlFor="consent">
                      I agree to be contacted about my flight request and accept the{' '}
                      <a href="/terms" target="_blank" rel="noopener noreferrer">Terms &amp; Conditions</a>{' '}
                      and{' '}
                      <a href="/privacy-policy" target="_blank" rel="noopener noreferrer">Privacy Policy</a>.
                    </label>
                  </div>
                  {fieldErrors.consent && (
                    <span id="consent-error" className="st-field-error" role="alert" style={{ marginTop: '6px', display: 'flex' }}>
                      <i className="fas fa-exclamation-circle" aria-hidden="true"></i>
                      {fieldErrors.consent}
                    </span>
                  )}

                  {/* Global error */}
                  {submitStatus === 'error' && submitMessage && (
                    <div className="st-form-error-msg" role="alert" style={{ marginTop: '16px' }}>
                      <i className="fas fa-exclamation-triangle" aria-hidden="true"></i>
                      {submitMessage}
                    </div>
                  )}

                  <div className="st-form-footer">
                    <button
                      id="senior-submit-btn"
                      type="submit"
                      className="btn-submit-request"
                      disabled={submitStatus === 'submitting'}
                      aria-live="polite"
                      aria-busy={submitStatus === 'submitting'}
                    >
                      {submitStatus === 'submitting' ? (
                        <>
                          <i className="fas fa-spinner fa-spin" aria-hidden="true"></i>
                          Submitting…
                        </>
                      ) : (
                        <>
                          <i className="fas fa-paper-plane" aria-hidden="true"></i>
                          Request Flight Options
                        </>
                      )}
                    </button>
                    <span className="st-form-secure">
                      <i className="fas fa-lock" aria-hidden="true"></i>
                      Secure request — no card details collected on this page
                    </span>
                  </div>
                </form>
              )}
            </div>
          </div>
        </section>

        {/* =========================================================
            PHONE SUPPORT
            ========================================================= */}
        <section className="st-phone-section" aria-labelledby="phone-section-heading">
          <h2 id="phone-section-heading">Prefer speaking with someone?</h2>
          <p>Call our travel team at:</p>
          <a
            href={SUPPORT_PHONE_HREF}
            className="st-phone-number"
            onClick={() => {
              if (typeof window !== 'undefined' && window.gtag) {
                window.gtag('event', 'senior_phone_click', { location: 'phone_section' });
              }
            }}
            aria-label={`Call us at ${SUPPORT_PHONE_DISPLAY}`}
          >
            {SUPPORT_PHONE_DISPLAY}
          </a>
          <div>
            <a
              href={SUPPORT_PHONE_HREF}
              className="btn-call-specialist"
              onClick={() => {
                if (typeof window !== 'undefined' && window.gtag) {
                  window.gtag('event', 'senior_phone_click', { location: 'call_specialist_btn' });
                }
              }}
              aria-label="Call a travel specialist"
            >
              <i className="fas fa-phone" aria-hidden="true"></i>
              Call a Travel Specialist
            </a>
          </div>
          <p className="st-hours-note">
            Monday – Friday 9 am – 8 pm ET · Saturday 10 am – 5 pm ET
          </p>
        </section>

        {/* =========================================================
            FAQ
            ========================================================= */}
        <section className="st-section" aria-labelledby="faq-heading">
          <div className="container">
            <p className="st-section-label">Common Questions</p>
            <h2 id="faq-heading" className="st-section-title" style={{ textAlign: 'center' }}>
              Frequently Asked Questions
            </h2>
            <div style={{ marginBottom: '32px' }} />
            <div className="st-faq-list" role="list">
              {FAQS.map((faq) => (
                <div key={faq.q} role="listitem">
                  <FaqItem faq={faq} />
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* =========================================================
            TRUST FOOTER
            ========================================================= */}
        <div className="st-trust" role="contentinfo">
          <div className="st-trust__inner">
            <span className="st-trust__copy">
              © {new Date().getFullYear()} FareTransit. Secure booking-request process.
              No card details collected on this page.
            </span>
            <nav className="st-trust__links" aria-label="Legal links">
              <a href="/terms">Terms &amp; Conditions</a>
              <a href="/privacy-policy">Privacy Policy</a>
              <a href="/refund-policy">Refund Policy</a>
              <a href="/contact">Contact Us</a>
              <a href={SUPPORT_PHONE_HREF}>{SUPPORT_PHONE_DISPLAY}</a>
            </nav>
          </div>
        </div>

      </div>
    </>
  );
}
