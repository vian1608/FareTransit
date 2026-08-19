import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { adminAPI, getApiErrorMessage } from '../../../shared/api/api';
import AddressAutocompleteInput from '../../../shared/components/AddressAutocompleteInput';
import './AdminBookingAddressPanel.css';

const emptyAddress = () => ({
  addressLine1: '',
  addressLine2: '',
  city: '',
  stateProvince: '',
  postalCode: '',
  country: ''
});

const text = value => (value === null || value === undefined ? '' : String(value));
const unwrapBooking = response => response?.booking || response?.data?.booking || response?.data || response || null;

function hydrateAddress(booking) {
  const billing = booking?.billingDetails || booking?.cardReference || booking?.paymentMethod || {};
  return {
    addressLine1: text(billing.addressLine1 || billing.billing_address_line1),
    addressLine2: text(billing.addressLine2 || billing.billing_address_line2),
    city: text(billing.city || billing.billing_city),
    stateProvince: text(billing.stateProvince || billing.billing_state),
    postalCode: text(billing.postalCode || billing.billing_postal_code),
    country: text(billing.country || billing.billing_country)
  };
}

export default function AdminBookingAddressPanel() {
  const { code } = useParams();
  const [bookingId, setBookingId] = useState('');
  const [address, setAddress] = useState(emptyAddress);
  const [billingEmail, setBillingEmail] = useState('');
  const [billingPhone, setBillingPhone] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    if (!code) return;
    setLoading(true);
    setError('');
    try {
      const response = await adminAPI.getBookingById(code);
      const booking = unwrapBooking(response);
      if (!booking?.id) throw new Error('Booking address could not be loaded.');
      const contact = booking.contacts?.[0] || {};
      const billing = booking.billingDetails || booking.cardReference || booking.paymentMethod || {};
      setBookingId(booking.id);
      setAddress(hydrateAddress(booking));
      setBillingEmail(text(billing.billingEmail || billing.billing_email || contact.email || booking.email));
      setBillingPhone(text(billing.billingPhone || billing.billing_phone || contact.phone_number || contact.phone || booking.phone));
    } catch (err) {
      setError(getApiErrorMessage(err, 'Unable to load the saved passenger address.'));
    } finally {
      setLoading(false);
    }
  }, [code]);

  useEffect(() => { load(); }, [load]);

  const formatted = useMemo(() => [
    address.addressLine1,
    address.addressLine2,
    address.city,
    address.stateProvince,
    address.postalCode,
    address.country
  ].filter(Boolean).join(', '), [address]);

  const update = (field, value) => setAddress(current => ({ ...current, [field]: value }));

  const applySuggestion = item => {
    setAddress(current => ({
      ...current,
      addressLine1: item.addressLine1 || current.addressLine1,
      addressLine2: item.addressLine2 || current.addressLine2,
      city: item.city || current.city,
      stateProvince: item.state || item.stateProvince || current.stateProvince,
      postalCode: item.postalCode || current.postalCode,
      country: item.country || current.country
    }));
  };

  const save = async () => {
    if (!bookingId || saving) return;
    if (!address.addressLine1.trim()) {
      setError('Enter an address line before saving.');
      return;
    }
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const response = await adminAPI.patchBillingDetails(bookingId, {
        billingDetails: {
          billingEmail: billingEmail.trim(),
          billingPhone: billingPhone.trim(),
          addressLine1: address.addressLine1.trim(),
          addressLine2: address.addressLine2.trim(),
          city: address.city.trim(),
          stateProvince: address.stateProvince.trim(),
          postalCode: address.postalCode.trim(),
          country: address.country.trim()
        }
      });
      if (response?.success === false) {
        throw new Error(response?.error?.message || 'Address save failed.');
      }
      setMessage('Passenger/contact address saved and verified.');
      setOpen(false);
      await load();
    } catch (err) {
      setError(getApiErrorMessage(err, 'Unable to save the passenger address.'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <section className="abaddr-panel abaddr-panel--loading">Loading saved address…</section>;
  }

  return (
    <section className={`abaddr-panel ${open ? 'abaddr-panel--open' : ''}`}>
      <button className="abaddr-summary" type="button" onClick={() => setOpen(current => !current)} aria-expanded={open}>
        <span className="abaddr-icon" aria-hidden="true">⌖</span>
        <span className="abaddr-summary-copy">
          <strong>Passenger / Contact Address</strong>
          <small>{formatted || 'No address saved yet — click to add with autocomplete'}</small>
        </span>
        <span className="abaddr-edit-label">{open ? 'Close' : (formatted ? 'Edit address' : 'Add address')}</span>
        <span className="abaddr-chevron" aria-hidden="true">⌄</span>
      </button>

      <div className="abaddr-expand" aria-hidden={!open}>
        <div className="abaddr-body">
          <div className="abaddr-field abaddr-field--wide">
            <label htmlFor="admin-passenger-address">Street address</label>
            <AddressAutocompleteInput
              id="admin-passenger-address"
              value={address.addressLine1}
              onChange={value => update('addressLine1', value)}
              onSelectSuggestion={applySuggestion}
              placeholder="Start typing the street address…"
              disabled={saving}
            />
            <p className="abaddr-help">Choose a suggestion to automatically fill city, state/province, postal code and country.</p>
          </div>

          <div className="abaddr-grid">
            <label className="abaddr-field abaddr-field--span2">
              <span>Apartment / Unit / Suite</span>
              <input value={address.addressLine2} onChange={event => update('addressLine2', event.target.value)} disabled={saving} placeholder="Optional" />
            </label>
            <label className="abaddr-field">
              <span>City</span>
              <input value={address.city} onChange={event => update('city', event.target.value)} disabled={saving} />
            </label>
            <label className="abaddr-field">
              <span>State / Province</span>
              <input value={address.stateProvince} onChange={event => update('stateProvince', event.target.value)} disabled={saving} />
            </label>
            <label className="abaddr-field">
              <span>ZIP / Postal Code</span>
              <input value={address.postalCode} onChange={event => update('postalCode', event.target.value)} disabled={saving} />
            </label>
            <label className="abaddr-field">
              <span>Country</span>
              <input value={address.country} onChange={event => update('country', event.target.value)} disabled={saving} />
            </label>
            <label className="abaddr-field">
              <span>Contact Email</span>
              <input type="email" value={billingEmail} onChange={event => setBillingEmail(event.target.value)} disabled={saving} />
            </label>
            <label className="abaddr-field">
              <span>Contact Phone</span>
              <input value={billingPhone} onChange={event => setBillingPhone(event.target.value)} disabled={saving} />
            </label>
          </div>

          {error && <div className="abaddr-alert abaddr-alert--error" role="alert">{error}</div>}
          {message && <div className="abaddr-alert abaddr-alert--success" role="status">{message}</div>}

          <div className="abaddr-actions">
            <button type="button" className="abaddr-button abaddr-button--ghost" onClick={() => setOpen(false)} disabled={saving}>Cancel</button>
            <button type="button" className="abaddr-button abaddr-button--primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save Address'}</button>
          </div>
        </div>
      </div>
    </section>
  );
}
