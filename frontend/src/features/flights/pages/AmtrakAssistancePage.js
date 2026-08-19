import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import HeroSlider from '../../../shared/components/HeroSlider';
import InquiryLocationSelect from '../components/InquiryLocationSelect';
import { amtrakStationSelectGroups } from '../../../shared/data/amtrakStations';
import CustomerReviews from '../../../shared/components/CustomerReviews';
import { inquiryAPI } from '../../../shared/api/api';
import { railReviews } from '../../../shared/data/customerReviews';
import { railHeroSlides, heroOfferTag } from '../../../shared/data/heroSlides';
import RouteSlider from '../../../shared/components/RouteSlider';
import SeamlessAdvisorySection from '../../../shared/components/SeamlessAdvisorySection';
import { trainFamousRoutes } from '../../../shared/data/famousRoutes';
import { SUPPORT_PHONE_DISPLAY, SUPPORT_PHONE_HREF } from '../../../shared/constants/supportContact';
import { trackLeadConversion } from '../../../shared/utils/analytics';
import './AmtrakAssistancePage.css';

const initialFormData = {
  name: '',
  email: '',
  phone: '',
  origin: '',
  destination: '',
  travelDate: '',
  passengers: '1',
  notes: '',
};

function AmtrakAssistance() {
  const [formData, setFormData] = useState(initialFormData);
  const [submitStatus, setSubmitStatus] = useState('idle');
  const [submitMessage, setSubmitMessage] = useState('');

  const handleChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };



  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitStatus('submitting');
    setSubmitMessage('');

    console.info('[Lead] Submitting');
    try {
      const rawResponse = await inquiryAPI.submitConsulting({
        serviceType: 'rail',
        ...formData,
      });
      const result = rawResponse?.data ?? rawResponse;

      if (result?.success || result?.emailed || result?.leadId || result?.messageId) {
        console.info('[Lead] Backend save confirmed', { leadId: result?.leadId || result?.messageId || result?.id });
        setSubmitStatus('success');
        setSubmitMessage(
          result.message ||
            'Thank you. Your inquiry was submitted and our team will contact you shortly.'
        );
        setFormData(initialFormData);

        // Fire Google Ads Lead Conversion tracking event
        trackLeadConversion({
          leadId: result?.leadId || result?.messageId || result?.id,
          value: 1.0,
          currency: 'USD',
        });
      } else {
        throw new Error(result?.message || 'Inquiry submission failed');
      }
    } catch (error) {
      setSubmitStatus('error');
      if (error.response?.data?.error) {
        setSubmitMessage(error.response.data.error);
      } else if (error.code === 'ERR_NETWORK' || !error.response) {
        const isLocal =
          window.location.hostname === 'localhost' ||
          window.location.hostname === '127.0.0.1';
        setSubmitMessage(
          isLocal
            ? 'Unable to reach the server. Start the backend on port 5001 (cd backend && npm run dev), restart the frontend, then try again.'
            : 'Unable to reach our servers. Hard-refresh the page (Cmd+Shift+R) and try again, or email support@faretransit.com.'
        );
      } else {
        setSubmitMessage(
          'Unable to submit right now. Please call us or email support@faretransit.com.'
        );
      }
    }
  };

  return (
    <div className="amtrak-page">
      <Helmet>
        <title>Amtrak Assistance & Auto Train Tickets | FareTransit</title>
        <meta name="keywords" content="buy train tickets, amtrak tickets, amtrak schedule, amtrak student discount, amtrak auto train, autotrain, train car transport, train vehicle transport, move car by train, car transport by train charges, train car carrier, car transport through train, train to new york, train new york washington, train from nyc to dc, train from philly to nyc, train from nyc to philadelphia, train to new york from dc, new york to dc train, new york to boston train, nyc to boston train, boston to nyc train" />
        <meta name="description" content="Expert assistance for booking Amtrak, Auto Train, and vehicle transport. Discover schedules and buy train tickets from NYC, DC, Boston, Philadelphia, and more." />
        <link rel="canonical" href="https://faretransit.com/amtrak" />
      </Helmet>
      <HeroSlider
        slides={railHeroSlides}
        variant="rail"
        serviceNavActive="rail"
        inquiryHref="#inquiry"
        offerTag={heroOfferTag}
      />

<section id="inquiry" className="amtrak-section">
        <div className="container">
          <div className="inquiry-split-layout">
            <div className="inquiry-left-panel">
              <h2 className="inquiry-left-title">Need Immediate Support?</h2>
              <p className="inquiry-left-lead">Skip the form and call us directly to secure your rail logistics immediately.</p>
              
              <a href={SUPPORT_PHONE_HREF} className="call-btn amtrak-btn amtrak-btn--cta amtrak-call-banner-btn">
                <i className="fas fa-phone"></i> Call {SUPPORT_PHONE_DISPLAY}
              </a>
              
              <div className="benefits-list">
                <h3 className="benefits-list-title">Benefits for booking with us:</h3>
                <ul className="benefits-list-items">
                  <li>
                    <i className="fas fa-check-circle icon-check"></i>
                    <span>Includes free 24/7 support till date of travel.</span>
                  </li>
                  <li>
                    <i className="fas fa-check-circle icon-check"></i>
                    <span>No need to wait on long holds like with Amtrak.</span>
                  </li>
                </ul>
              </div>
            </div>

            <div className="inquiry-right-panel">
              <div className="amtrak-inquiry-card">
                <h2 className="inquiry-form-title">Consulting Inquiry</h2>
                <p className="amtrak-inquiry__intro">
                  Submit your rail logistics details. A consultant will respond with advisory options and a quote outline.
                </p>
            <form className="amtrak-form" onSubmit={handleSubmit}>
              <div className="amtrak-form__row">
                <div className="amtrak-form__group">
                  <label htmlFor="amtrak-name">Full name</label>
                  <input
                    id="amtrak-name"
                    type="text"
                    value={formData.name}
                    onChange={(e) => handleChange('name', e.target.value)}
                    required
                    autoComplete="name"
                  />
                </div>
                <div className="amtrak-form__group">
                  <label htmlFor="amtrak-email">Email</label>
                  <input
                    id="amtrak-email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => handleChange('email', e.target.value)}
                    required
                    autoComplete="email"
                  />
                </div>
              </div>
              <div className="amtrak-form__row">
                <div className="amtrak-form__group">
                  <label htmlFor="amtrak-phone">Phone (optional)</label>
                  <input
                    id="amtrak-phone"
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => handleChange('phone', e.target.value)}
                    autoComplete="tel"
                  />
                </div>
                <div className="amtrak-form__group">
                  <label htmlFor="amtrak-passengers">Passengers</label>
                  <select
                    id="amtrak-passengers"
                    value={formData.passengers}
                    onChange={(e) => handleChange('passengers', e.target.value)}
                  >
                    <option value="1">1</option>
                    <option value="2">2</option>
                    <option value="3">3</option>
                    <option value="4">4</option>
                    <option value="5+">5+</option>
                  </select>
                </div>
              </div>
              <div className="amtrak-form__row">
                <div className="amtrak-form__group">
                  <InquiryLocationSelect
                    id="amtrak-origin"
                    label="Origin station"
                    value={formData.origin}
                    onChange={(value) => handleChange('origin', value)}
                    groups={amtrakStationSelectGroups}
                    placeholder="Select origin station"
                    required
                  />
                </div>
                <div className="amtrak-form__group">
                  <InquiryLocationSelect
                    id="amtrak-destination"
                    label="Destination station"
                    value={formData.destination}
                    onChange={(value) => handleChange('destination', value)}
                    groups={amtrakStationSelectGroups}
                    placeholder="Select destination station"
                    required
                  />
                </div>
              </div>
              <div className="amtrak-form__row">
                <div className="amtrak-form__group">
                  <label htmlFor="amtrak-date">Preferred travel date</label>
                  <input
                    id="amtrak-date"
                    type="date"
                    value={formData.travelDate}
                    onChange={(e) => handleChange('travelDate', e.target.value)}
                  />
                </div>
              </div>
              <div className="amtrak-form__group">
                <label htmlFor="amtrak-notes">Advisory notes (urgency, accessibility, etc.)</label>
                <textarea
                  id="amtrak-notes"
                  rows={4}
                  value={formData.notes}
                  onChange={(e) => handleChange('notes', e.target.value)}
                  placeholder="Describe your logistics needs and timeline."
                />
              </div>

              {/* SMS OPT-IN COMPLIANCE DISCLOSURE BLOCK */}
              <div className="amtrak-sms-box">
                <div className="amtrak-sms-inner">
                  <input 
                    type="checkbox" 
                    id="smsOptIn" 
                    name="smsOptIn" 
                    required 
                  />
                  <label htmlFor="smsOptIn">
                    By checking this box and submitting this request, I provide my express written consent to receive automated travel updates, route quotes, and booking notifications via SMS from FareTransit LLC at the number provided. <strong>Consent is not a condition of purchase. Message frequency varies based on booking activity (up to 4 messages per month).</strong> Message and data rates may apply. Text STOP to cancel at any time, or HELP for assistance. View our <Link to="/privacy-policy" style={{ color: '#4f46e5', textDecoration: 'underline' }}>Privacy Policy</Link> and <Link to="/terms" style={{ color: '#4f46e5', textDecoration: 'underline' }}>Terms of Service</Link>.
                  </label>
                </div>
              </div>
              <div className="amtrak-form__actions-group">
                <button
                  type="submit"
                  className="amtrak-btn amtrak-btn--cta amtrak-btn--full"
                  disabled={submitStatus === 'submitting'}
                >
                  {submitStatus === 'submitting' ? 'Submitting Query…' : 'Submit Query'}
                </button>
              </div>
              {submitMessage && (
                <p
                  className={`inquiry-form__message ${
                    submitStatus === 'success'
                      ? 'inquiry-form__message--success'
                      : 'inquiry-form__message--error'
                  }`}
                  role="alert"
                  style={{ marginTop: '1rem' }}
                >
                  {submitMessage}
                </p>
              )}
            </form>
          </div>
            </div>
          </div>
        </div>
      </section>

      <section className="amtrak-section">
        <div className="container route-slider-section">
          <RouteSlider routes={trainFamousRoutes} btnClassPrefix="amtrak" />
        </div>
      </section>

      <SeamlessAdvisorySection variant="rail" />



            <CustomerReviews reviews={railReviews} variant="rail" />
    </div>
  );
}

export default AmtrakAssistance;
