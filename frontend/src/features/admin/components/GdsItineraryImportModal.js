import React, { useState } from 'react';
import {
  parseGdsTextClient,
  CHATGPT_PROMPT_TEMPLATE,
  FORMAT_A_EXAMPLE,
  FORMAT_B_EXAMPLE,
  checkRouteContinuityClient
} from '../utils/gdsParser';

export default function GdsItineraryImportModal({
  isOpen,
  onClose,
  bookingId,
  onItineraryImported
}) {
  const [step, setStep] = useState('input'); // 'input' | 'review'
  const [rawText, setRawText] = useState('');
  const [parseErrors, setParseErrors] = useState([]);
  const [parseWarnings, setParseWarnings] = useState([]);
  const [tripType, setTripType] = useState('ONE_WAY');
  const [segments, setSegments] = useState([]);
  const [copySuccess, setCopySuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  if (!isOpen) return null;

  const handleParse = () => {
    setParseErrors([]);
    setParseWarnings([]);
    setSubmitError('');

    const res = parseGdsTextClient(rawText);
    if (!res.success) {
      setParseErrors(res.errors || ['Parsing failed. Please review text input.']);
      setParseWarnings(res.warnings || []);
      return;
    }

    setTripType(res.tripType || 'ONE_WAY');
    setSegments(res.segments || []);
    setParseWarnings(res.warnings || []);
    setStep('review');
  };

  const handleClear = () => {
    setRawText('');
    setParseErrors([]);
    setParseWarnings([]);
    setSegments([]);
    setSubmitError('');
    setStep('input');
  };

  const handleCopyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(CHATGPT_PROMPT_TEMPLATE);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 3000);
    } catch (e) {
      // Fallback copy
      const textArea = document.createElement('textarea');
      textArea.value = CHATGPT_PROMPT_TEMPLATE;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 3000);
    }
  };

  const handleLoadFormatA = () => {
    setRawText(FORMAT_A_EXAMPLE);
    setParseErrors([]);
    setParseWarnings([]);
  };

  const handleLoadFormatB = () => {
    setRawText(FORMAT_B_EXAMPLE);
    setParseErrors([]);
    setParseWarnings([]);
  };

  // Segment editing functions
  const handleUpdateSegment = (idx, field, value) => {
    setSegments(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value };
      // Re-check route continuity
      const updatedWarnings = checkRouteContinuityClient(next);
      setParseWarnings(updatedWarnings);
      return next;
    });
  };

  const handleDeleteSegment = (idx) => {
    setSegments(prev => {
      const next = prev.filter((_, i) => i !== idx);
      const updatedWarnings = checkRouteContinuityClient(next);
      setParseWarnings(updatedWarnings);
      return next;
    });
  };

  const handleMoveSegment = (idx, dir) => {
    if (dir === 'up' && idx === 0) return;
    if (dir === 'down' && idx === segments.length - 1) return;

    setSegments(prev => {
      const next = [...prev];
      const targetIdx = dir === 'up' ? idx - 1 : idx + 1;
      const temp = next[idx];
      next[idx] = next[targetIdx];
      next[targetIdx] = temp;
      const updatedWarnings = checkRouteContinuityClient(next);
      setParseWarnings(updatedWarnings);
      return next;
    });
  };

  const handleAddSegment = () => {
    const newSeg = {
      id: `seg_manual_${Date.now()}`,
      direction: 'outbound',
      journey_direction: 'outbound',
      segment_sequence: segments.length + 1,
      carrier_code: 'AA',
      carrier_name: 'American Airlines',
      flight_number: '100',
      booking_class: 'Y',
      cabin: 'Economy',
      origin_airport: 'JFK',
      origin_city: 'New York',
      destination_airport: 'LHR',
      destination_city: 'London',
      departure_date: new Date().toISOString().slice(0, 10),
      departure_time: '18:00',
      arrival_date: new Date().toISOString().slice(0, 10),
      arrival_time: '06:30',
      stop_count: 0,
      operated_by: '',
      aircraft: '',
      dep_terminal: '',
      arr_terminal: ''
    };
    setSegments(prev => [...prev, newSeg]);
  };

  const handleApplyToBooking = async () => {
    if (!segments || segments.length === 0) {
      setSubmitError('At least one flight segment is required to update itinerary.');
      return;
    }

    // Frontend validation before submission
    for (let i = 0; i < segments.length; i++) {
      const s = segments[i];
      if (!s.carrier_code || !s.flight_number || !s.origin_airport || !s.destination_airport || !s.departure_date || !s.departure_time || !s.arrival_date || !s.arrival_time) {
        setSubmitError(`Segment #${i + 1} (${s.origin_airport || '?' } → ${s.destination_airport || '?'}) has incomplete required fields.`);
        return;
      }
    }

    setIsSubmitting(true);
    setSubmitError('');

    try {
      const adminToken = localStorage.getItem('token');
      const res = await fetch(`/api/admin/bookings/${bookingId}/import-itinerary`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`
        },
        body: JSON.stringify({
          text: rawText,
          segments,
          tripType,
          warnings: parseWarnings
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || data.message || 'Failed to import itinerary text.');
      }

      // Success
      if (onItineraryImported) {
        onItineraryImported(data.booking || data.data);
      }
      onClose();
    } catch (err) {
      setSubmitError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(15, 23, 42, 0.75)',
      backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 99999, padding: '20px'
    }}>
      <div style={{
        background: '#ffffff',
        borderRadius: '12px',
        width: '100%',
        maxWidth: '900px',
        maxHeight: '90vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
        overflow: 'hidden'
      }}>
        {/* Modal Header */}
        <div style={{
          padding: '16px 24px',
          borderBottom: '1px solid #e2e8f0',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: '#f8fafc'
        }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: '700', color: '#0f172a' }}>
              <i className="fas fa-plane-arrival" style={{ color: '#8b1236', marginRight: '8px' }}></i>
              Import Flight Itinerary
            </h3>
            <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem', color: '#64748b' }}>
              {step === 'input' ? 'Paste standardized GDS-style text or ChatGPT format below.' : 'Review, edit, and apply parsed itinerary segments to booking.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ border: 'none', background: 'transparent', fontSize: '1.2rem', color: '#94a3b8', cursor: 'pointer' }}
          >
            <i className="fas fa-times"></i>
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>
          {step === 'input' && (
            <div>
              {/* Preset Format Quick Buttons & ChatGPT Prompt button */}
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px', alignItems: 'center' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: '600', color: '#475569' }}>Load Example:</span>
                <button
                  type="button"
                  onClick={handleLoadFormatA}
                  style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', padding: '4px 10px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: '600', cursor: 'pointer', color: '#1e293b' }}
                >
                  <i className="fas fa-list" style={{ marginRight: '4px' }}></i> Labeled Format A
                </button>
                <button
                  type="button"
                  onClick={handleLoadFormatB}
                  style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', padding: '4px 10px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: '600', cursor: 'pointer', color: '#1e293b' }}
                >
                  <i className="fas fa-code" style={{ marginRight: '4px' }}></i> Compact Format B (SS...)
                </button>
                <div style={{ marginLeft: 'auto' }}>
                  <button
                    type="button"
                    onClick={handleCopyPrompt}
                    style={{ background: copySuccess ? '#dcfce7' : '#eff6ff', border: copySuccess ? '1px solid #86efac' : '1px solid #bfdbfe', padding: '5px 12px', borderRadius: '6px', fontSize: '0.78rem', fontWeight: '600', color: copySuccess ? '#166534' : '#1d4ed8', cursor: 'pointer' }}
                  >
                    <i className={copySuccess ? "fas fa-check" : "fas fa-robot"} style={{ marginRight: '6px' }}></i>
                    {copySuccess ? 'ChatGPT Prompt Copied!' : 'Copy ChatGPT Prompt'}
                  </button>
                </div>
              </div>

              {/* Text Input Area */}
              <textarea
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                placeholder="Paste the standardized itinerary text here. Example:&#10;&#10;TRIP ROUND_TRIP&#10;OUTBOUND&#10;SS F9 1496 Y 10SEP2026 IAH FLL 0825 1212&#10;&#10;RETURN&#10;SS UA 470 Y 17SEP2026 MIA IAH 1130 1322"
                rows={12}
                style={{
                  width: '100%',
                  fontFamily: 'monospace',
                  fontSize: '0.85rem',
                  padding: '12px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  backgroundColor: '#f8fafc',
                  color: '#0f172a',
                  lineHeight: '1.4'
                }}
              />

              {/* Parsing Errors Display */}
              {parseErrors.length > 0 && (
                <div style={{ marginTop: '16px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '12px 16px' }}>
                  <h4 style={{ margin: '0 0 8px 0', fontSize: '0.85rem', color: '#991b1b', fontWeight: '700' }}>
                    <i className="fas fa-exclamation-triangle" style={{ marginRight: '6px' }}></i>
                    Parsing Errors ({parseErrors.length})
                  </h4>
                  <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '0.8rem', color: '#b91c1c' }}>
                    {parseErrors.map((err, idx) => (
                      <li key={idx} style={{ marginBottom: '4px' }}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {step === 'review' && (
            <div>
              {/* Trip Summary & Selector */}
              <div style={{ display: 'flex', gap: '16px', alignItems: 'center', padding: '12px 16px', background: '#f1f5f9', borderRadius: '8px', marginBottom: '16px' }}>
                <div>
                  <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: '600', display: 'block' }}>TRIP TYPE</span>
                  <select
                    value={tripType}
                    onChange={(e) => setTripType(e.target.value)}
                    style={{ padding: '4px 8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.82rem', fontWeight: '700', background: '#fff' }}
                  >
                    <option value="ONE_WAY">ONE_WAY</option>
                    <option value="ROUND_TRIP">ROUND_TRIP</option>
                    <option value="MULTI_CITY">MULTI_CITY</option>
                  </select>
                </div>
                <div>
                  <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: '600', display: 'block' }}>TOTAL SEGMENTS</span>
                  <span style={{ fontSize: '0.9rem', fontWeight: '700', color: '#0f172a' }}>{segments.length} Segments</span>
                </div>
                <div style={{ marginLeft: 'auto' }}>
                  <button
                    type="button"
                    onClick={handleAddSegment}
                    style={{ background: '#8b1236', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '6px', fontSize: '0.8rem', fontWeight: '600', cursor: 'pointer' }}
                  >
                    <i className="fas fa-plus" style={{ marginRight: '4px' }}></i> Add Segment
                  </button>
                </div>
              </div>

              {/* Warnings Banner */}
              {parseWarnings.length > 0 && (
                <div style={{ marginBottom: '16px', background: '#fffbeb', border: '1px solid #fef3c7', borderRadius: '8px', padding: '12px 16px' }}>
                  <h4 style={{ margin: '0 0 6px 0', fontSize: '0.82rem', color: '#b45309', fontWeight: '700' }}>
                    <i className="fas fa-exclamation-circle" style={{ marginRight: '6px' }}></i>
                    Review Warnings ({parseWarnings.length})
                  </h4>
                  <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '0.78rem', color: '#d97706' }}>
                    {parseWarnings.map((w, idx) => (
                      <li key={idx}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Error Message */}
              {submitError && (
                <div style={{ marginBottom: '16px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '10px 14px', color: '#991b1b', fontSize: '0.82rem', fontWeight: '600' }}>
                  <i className="fas fa-times-circle" style={{ marginRight: '6px' }}></i> {submitError}
                </div>
              )}

              {/* Segment Cards List */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {segments.map((seg, idx) => (
                  <div
                    key={seg.id || idx}
                    style={{
                      border: '1px solid #e2e8f0',
                      borderRadius: '8px',
                      padding: '14px',
                      background: '#fff',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                    }}
                  >
                    {/* Segment Card Header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', borderBottom: '1px dashed #e2e8f0', paddingBottom: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ background: '#0f172a', color: '#fff', padding: '2px 8px', borderRadius: '4px', fontSize: '0.72rem', fontWeight: '700' }}>
                          Segment #{idx + 1}
                        </span>
                        <select
                          value={seg.direction || 'outbound'}
                          onChange={(e) => handleUpdateSegment(idx, 'direction', e.target.value)}
                          style={{ padding: '2px 6px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.75rem', fontWeight: '700' }}
                        >
                          <option value="outbound">Outbound</option>
                          <option value="return">Return</option>
                        </select>
                      </div>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <button
                          type="button"
                          onClick={() => handleMoveSegment(idx, 'up')}
                          disabled={idx === 0}
                          style={{ border: 'none', background: '#f1f5f9', padding: '4px 8px', borderRadius: '4px', cursor: idx === 0 ? 'not-allowed' : 'pointer', fontSize: '0.75rem' }}
                        >
                          <i className="fas fa-arrow-up"></i>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleMoveSegment(idx, 'down')}
                          disabled={idx === segments.length - 1}
                          style={{ border: 'none', background: '#f1f5f9', padding: '4px 8px', borderRadius: '4px', cursor: idx === segments.length - 1 ? 'not-allowed' : 'pointer', fontSize: '0.75rem' }}
                        >
                          <i className="fas fa-arrow-down"></i>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteSegment(idx)}
                          style={{ border: 'none', background: '#fef2f2', color: '#ef4444', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.75rem' }}
                        >
                          <i className="fas fa-trash-alt"></i>
                        </button>
                      </div>
                    </div>

                    {/* Segment Fields Grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
                      <div>
                        <label style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: '600' }}>Carrier Code</label>
                        <input
                          type="text"
                          value={seg.carrier_code || ''}
                          onChange={(e) => handleUpdateSegment(idx, 'carrier_code', e.target.value.toUpperCase())}
                          style={{ width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.8rem', fontWeight: '700' }}
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: '600' }}>Flight Number</label>
                        <input
                          type="text"
                          value={seg.flight_number || ''}
                          onChange={(e) => handleUpdateSegment(idx, 'flight_number', e.target.value)}
                          style={{ width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.8rem' }}
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: '600' }}>Booking Class</label>
                        <input
                          type="text"
                          value={seg.booking_class || ''}
                          onChange={(e) => handleUpdateSegment(idx, 'booking_class', e.target.value.toUpperCase())}
                          style={{ width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.8rem' }}
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: '600' }}>Cabin Class</label>
                        <select
                          value={seg.cabin || 'Economy'}
                          onChange={(e) => handleUpdateSegment(idx, 'cabin', e.target.value)}
                          style={{ width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.8rem' }}
                        >
                          <option value="Economy">Economy</option>
                          <option value="Premium Economy">Premium Economy</option>
                          <option value="Business">Business</option>
                          <option value="First">First</option>
                        </select>
                      </div>

                      <div>
                        <label style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: '600' }}>Origin (IATA)</label>
                        <input
                          type="text"
                          value={seg.origin_airport || ''}
                          onChange={(e) => handleUpdateSegment(idx, 'origin_airport', e.target.value.toUpperCase())}
                          style={{ width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.8rem', fontWeight: '700' }}
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: '600' }}>Destination (IATA)</label>
                        <input
                          type="text"
                          value={seg.destination_airport || ''}
                          onChange={(e) => handleUpdateSegment(idx, 'destination_airport', e.target.value.toUpperCase())}
                          style={{ width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.8rem', fontWeight: '700' }}
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: '600' }}>Departure Date</label>
                        <input
                          type="date"
                          value={seg.departure_date || ''}
                          onChange={(e) => handleUpdateSegment(idx, 'departure_date', e.target.value)}
                          style={{ width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.8rem' }}
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: '600' }}>Departure Time</label>
                        <input
                          type="text"
                          placeholder="HH:MM"
                          value={seg.departure_time || ''}
                          onChange={(e) => handleUpdateSegment(idx, 'departure_time', e.target.value)}
                          style={{ width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.8rem' }}
                        />
                      </div>

                      <div>
                        <label style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: '600' }}>Arrival Date</label>
                        <input
                          type="date"
                          value={seg.arrival_date || ''}
                          onChange={(e) => handleUpdateSegment(idx, 'arrival_date', e.target.value)}
                          style={{ width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.8rem' }}
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: '600' }}>Arrival Time</label>
                        <input
                          type="text"
                          placeholder="HH:MM"
                          value={seg.arrival_time || ''}
                          onChange={(e) => handleUpdateSegment(idx, 'arrival_time', e.target.value)}
                          style={{ width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.8rem' }}
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: '600' }}>Stops</label>
                        <input
                          type="number"
                          value={seg.stop_count ?? 0}
                          onChange={(e) => handleUpdateSegment(idx, 'stop_count', parseInt(e.target.value || '0', 10))}
                          style={{ width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.8rem' }}
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: '600' }}>Aircraft</label>
                        <input
                          type="text"
                          placeholder="e.g. 738"
                          value={seg.aircraft || ''}
                          onChange={(e) => handleUpdateSegment(idx, 'aircraft', e.target.value)}
                          style={{ width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.8rem' }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div style={{
          padding: '16px 24px',
          borderTop: '1px solid #e2e8f0',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: '#f8fafc'
        }}>
          {step === 'input' ? (
            <>
              <button
                type="button"
                onClick={handleClear}
                style={{ background: 'transparent', border: '1px solid #cbd5e1', padding: '8px 16px', borderRadius: '6px', fontSize: '0.82rem', fontWeight: '600', cursor: 'pointer', color: '#475569' }}
              >
                Clear
              </button>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  onClick={onClose}
                  style={{ background: '#f1f5f9', border: 'none', padding: '8px 16px', borderRadius: '6px', fontSize: '0.82rem', fontWeight: '600', cursor: 'pointer', color: '#475569' }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleParse}
                  style={{ background: '#8b1236', color: '#fff', border: 'none', padding: '8px 20px', borderRadius: '6px', fontSize: '0.82rem', fontWeight: '700', cursor: 'pointer' }}
                >
                  Parse Itinerary <i className="fas fa-arrow-right" style={{ marginLeft: '6px' }}></i>
                </button>
              </div>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setStep('input')}
                style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', padding: '8px 16px', borderRadius: '6px', fontSize: '0.82rem', fontWeight: '600', cursor: 'pointer', color: '#334155' }}
              >
                <i className="fas fa-arrow-left" style={{ marginRight: '6px' }}></i> Back to Text
              </button>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  onClick={onClose}
                  style={{ background: '#f1f5f9', border: 'none', padding: '8px 16px', borderRadius: '6px', fontSize: '0.82rem', fontWeight: '600', cursor: 'pointer', color: '#475569' }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={handleApplyToBooking}
                  style={{ background: isSubmitting ? '#cbd5e1' : '#166534', color: '#fff', border: 'none', padding: '8px 20px', borderRadius: '6px', fontSize: '0.82rem', fontWeight: '700', cursor: isSubmitting ? 'not-allowed' : 'pointer' }}
                >
                  {isSubmitting ? 'Applying...' : 'Apply to Booking'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
