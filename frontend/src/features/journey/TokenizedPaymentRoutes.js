import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import ConsultingPayment from '../payments/pages/ConsultingPaymentPage';
import journeySessionAPI from '../../shared/api/journeySessionApi';

function PaymentJourneyState({ error = '', message }) {
  return (
    <div style={{ minHeight: '58vh', display: 'grid', placeItems: 'center', padding: '2rem 1rem', background: '#f8fafc' }}>
      <div style={{ width: 'min(640px, 100%)', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 20, padding: '2.2rem', textAlign: 'center', boxShadow: '0 16px 40px rgba(15,23,42,.08)' }}>
        <i className={`fas ${error ? 'fa-exclamation-triangle' : 'fa-circle-notch fa-spin'}`} style={{ fontSize: 30, color: error ? '#be123c' : '#8b1538', marginBottom: 14 }} />
        <h2>{error ? 'Secure payment link needs attention' : 'Preparing your secure payment link'}</h2>
        <p style={{ color: '#64748b', lineHeight: 1.65 }}>{error || message}</p>
      </div>
    </div>
  );
}

export function PaymentBootstrap() {
  const navigate = useNavigate();
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    journeySessionAPI.createPayment({ serviceId: 'urgent', billing: null })
      .then((response) => {
        if (cancelled) return;
        const token = response?.data?.token;
        if (!token) throw new Error('The server did not return a payment-session link.');
        sessionStorage.setItem('paymentSessionToken', token);
        navigate(`/payment/${encodeURIComponent(token)}`, { replace: true });
      })
      .catch((err) => !cancelled && setError(err?.userMessage || err?.message || 'Unable to create a secure payment link.'));
    return () => { cancelled = true; };
  }, [navigate]);

  return <PaymentJourneyState error={error} message="Creating an opaque payment-session ID so this form can be refreshed, duplicated, or copied without exposing billing details in the URL." />;
}

export function TokenizedPaymentPage() {
  const { paymentToken } = useParams();
  const [state, setState] = useState({ loading: true, error: '', payload: null });

  useEffect(() => {
    let cancelled = false;
    journeySessionAPI.getPayment(paymentToken)
      .then((response) => {
        if (cancelled) return;
        const payload = response?.data?.payload || {};
        sessionStorage.setItem('paymentSessionToken', paymentToken);
        setState({ loading: false, error: '', payload });
      })
      .catch((err) => !cancelled && setState({ loading: false, error: err?.userMessage || err?.message || 'Unable to restore this secure payment link.', payload: null }));
    return () => { cancelled = true; };
  }, [paymentToken]);

  if (state.loading || state.error) {
    return <PaymentJourneyState error={state.error} message="Restoring the non-sensitive service and billing context attached to this payment link." />;
  }

  return <ConsultingPayment paymentToken={paymentToken} initialSession={state.payload} />;
}
