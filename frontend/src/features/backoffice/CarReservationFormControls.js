import React, { useEffect, useMemo, useRef, useState } from 'react';
import './CarReservationFormControls.css';

export const CARD_BRANDS = [
  { value: '', label: 'Select card brand' },
  { value: 'VISA', label: 'Visa' },
  { value: 'MASTERCARD', label: 'Mastercard' },
  { value: 'AMERICAN_EXPRESS', label: 'American Express' },
  { value: 'DISCOVER', label: 'Discover' },
  { value: 'DINERS_CLUB', label: 'Diners Club' },
  { value: 'JCB', label: 'JCB' },
  { value: 'UNIONPAY', label: 'UnionPay' },
  { value: 'OTHER', label: 'Other' }
];

export function normalizeCardBrand(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const key = raw.toUpperCase().replace(/[\s-]+/g, '_');
  const aliases = {
    AMEX: 'AMERICAN_EXPRESS',
    AMERICANEXPRESS: 'AMERICAN_EXPRESS',
    MASTER_CARD: 'MASTERCARD',
    MC: 'MASTERCARD',
    DINERS: 'DINERS_CLUB'
  };
  const normalized = aliases[key] || key;
  return CARD_BRANDS.some(item => item.value === normalized) ? normalized : 'OTHER';
}

function timeLabel(value) {
  const [h, m] = value.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, '0')} ${suffix}`;
}

export const HALF_HOUR_TIMES = Array.from({ length: 48 }, (_, index) => {
  const hour = Math.floor(index / 2);
  const minute = index % 2 ? 30 : 0;
  const value = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  return { value, label: timeLabel(value) };
});

export function normalizeHalfHourLocalDateTime(value) {
  if (!value) return '';
  const text = String(value);
  const match = text.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/);
  if (!match) return text;
  const [, datePart, hourText, minuteText] = match;
  let hour = Number(hourText);
  const minute = Number(minuteText);
  let snappedMinute;
  if (minute < 15) snappedMinute = 0;
  else if (minute < 45) snappedMinute = 30;
  else {
    snappedMinute = 0;
    hour += 1;
  }
  let date = datePart;
  if (hour >= 24) {
    const next = new Date(`${datePart}T00:00:00`);
    next.setDate(next.getDate() + 1);
    const y = next.getFullYear();
    const m = String(next.getMonth() + 1).padStart(2, '0');
    const d = String(next.getDate()).padStart(2, '0');
    date = `${y}-${m}-${d}`;
    hour = 0;
  }
  return `${date}T${String(hour).padStart(2, '0')}:${String(snappedMinute).padStart(2, '0')}`;
}

export function toIsoOrNull(value) {
  if (!value) return null;
  const normalized = normalizeHalfHourLocalDateTime(value);
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function HalfHourDateTimeInput({ value, onChange, idPrefix, disabled = false }) {
  const normalized = normalizeHalfHourLocalDateTime(value || '');
  const match = normalized.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
  const datePart = match?.[1] || '';
  const timePart = match?.[2] || '';

  const emit = (date, time) => {
    if (!date && !time) return onChange('');
    onChange(`${date || ''}T${time || ''}`);
  };

  return <div className="car-form-datetime">
    <input
      id={`${idPrefix}-date`}
      type="date"
      value={datePart}
      disabled={disabled}
      onChange={event => emit(event.target.value, timePart)}
      aria-label="Date"
    />
    <select
      id={`${idPrefix}-time`}
      value={timePart}
      disabled={disabled}
      onChange={event => emit(datePart, event.target.value)}
      aria-label="Time"
    >
      <option value="">Select time</option>
      {HALF_HOUR_TIMES.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
  </div>;
}

export function CardBrandSelect({ value, onChange }) {
  const normalized = normalizeCardBrand(value);
  return <select value={normalized} onChange={event => onChange(event.target.value)} autoComplete="cc-type">
    {CARD_BRANDS.map(option => <option key={option.value || 'blank'} value={option.value}>{option.label}</option>)}
  </select>;
}

export function BillingAddressAutocomplete({ value, onChange, onSelect }) {
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const requestRef = useRef(0);
  const query = String(value || '').trim();

  useEffect(() => {
    if (query.length < 3) {
      setSuggestions([]);
      setOpen(false);
      setLoading(false);
      return;
    }
    const current = ++requestRef.current;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/address-autocomplete?q=${encodeURIComponent(query)}`);
        const payload = await response.json().catch(() => ({}));
        if (current !== requestRef.current) return;
        const rows = Array.isArray(payload?.suggestions) ? payload.suggestions : [];
        setSuggestions(rows);
        setOpen(rows.length > 0);
      } catch {
        if (current === requestRef.current) {
          setSuggestions([]);
          setOpen(false);
        }
      } finally {
        if (current === requestRef.current) setLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const choose = suggestion => {
    onChange(suggestion.addressLine1 || value || '');
    onSelect?.(suggestion);
    setSuggestions([]);
    setOpen(false);
  };

  return <div className="car-address-autocomplete">
    <input
      value={value || ''}
      onChange={event => onChange(event.target.value)}
      onFocus={() => suggestions.length && setOpen(true)}
      onBlur={() => setTimeout(() => setOpen(false), 150)}
      autoComplete="billing address-line1"
      placeholder="Start typing a billing address"
    />
    {loading && <span className="car-address-loading">Searching…</span>}
    {open && <div className="car-address-suggestions" role="listbox">
      {suggestions.map((item, index) => <button key={`${item.formatted || item.addressLine1}-${index}`} type="button" onMouseDown={event => event.preventDefault()} onClick={() => choose(item)}>
        <strong>{item.addressLine1 || item.formatted}</strong>
        <span>{item.formatted}</span>
      </button>)}
    </div>}
  </div>;
}
