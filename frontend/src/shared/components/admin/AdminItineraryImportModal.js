import React, { useState } from 'react';
import { parseGdsLine } from '../../utils/gdsItineraryHelper';
import AdminItineraryHelpModal from './AdminItineraryHelpModal';

export default function AdminItineraryImportModal({
  isOpen,
  onClose,
  onConfirmImport,
  existingItineraryHasData = false
}) {
  const currentYear = String(new Date().getFullYear());
  const [tripType, setTripType] = useState('one-way'); // 'one-way' | 'round-trip' | 'multi-city'
  const [step, setStep] = useState('select_type'); // 'select_type' | 'input' | 'preview'
  const [isHelpOpen, setIsHelpOpen] = useState(false);

  // Input states
  const [outboundYear, setOutboundYear] = useState(currentYear);
  const [outboundText, setOutboundText] = useState('');

  const [returnYear, setReturnYear] = useState(currentYear);
  const [returnText, setReturnText] = useState('');

  const [multiCityJourneys, setMultiCityJourneys] = useState([
    { id: 'mc-1', year: currentYear, text: '' },
    { id: 'mc-2', year: currentYear, text: '' }
  ]);

  const [parsedPreview, setParsedPreview] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [confirmReplace, setConfirmReplace] = useState(false);

  if (!isOpen) return null;

  const parseTextToSegments = (text, year) => {
    if (!text || !text.trim()) return [];
    const lines = text.split('\n').filter(l => l.trim().length > 0);
    const segs = [];
    lines.forEach((line, idx) => {
      const parsed = parseGdsLine(line, year, idx + 1);
      if (parsed) {
        segs.push({
          id: `seg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          carrierCode: parsed.carrier_code || parsed.carrierCode || '',
          flightNumber: parsed.flight_number || parsed.flightNumber || '',
          carrier_code: parsed.carrier_code || parsed.carrierCode || '',
          flight_number: parsed.flight_number || parsed.flightNumber || '',
          originAirport: parsed.origin_airport || parsed.originAirport || '',
          destinationAirport: parsed.destination_airport || parsed.destinationAirport || '',
          origin_airport: parsed.origin_airport || parsed.originAirport || '',
          destination_airport: parsed.destination_airport || parsed.destinationAirport || '',
          departureDate: parsed.departure_date || parsed.departureDate || '',
          departure_date: parsed.departure_date || parsed.departureDate || '',
          arrivalDate: parsed.arrival_date || parsed.arrivalDate || parsed.departure_date || '',
          arrival_date: parsed.arrival_date || parsed.arrivalDate || parsed.departure_date || '',
          departureTime: parsed.departure_time || parsed.departureTime || '',
          departure_time: parsed.departure_time || parsed.departureTime || '',
          arrivalTime: parsed.arrival_time || parsed.arrivalTime || '',
          arrival_time: parsed.arrival_time || parsed.arrivalTime || '',
          cabin: parsed.cabin || 'Economy'
        });
      }
    });
    return segs;
  };

  const handleSelectTripType = (type) => {
    setTripType(type);
    setStep('input');
    setErrorMsg('');
  };

  const handleAddMultiCityJourney = () => {
    setMultiCityJourneys(prev => [
      ...prev,
      { id: `mc-${Date.now()}-${prev.length + 1}`, year: currentYear, text: '' }
    ]);
  };

  const handleRemoveMultiCityJourney = (id) => {
    if (multiCityJourneys.length <= 1) return;
    setMultiCityJourneys(prev => prev.filter(j => j.id !== id));
  };

  const handleUpdateMultiCityJourney = (id, field, val) => {
    setMultiCityJourneys(prev =>
      prev.map(j => (j.id === id ? { ...j, [field]: val } : j))
    );
  };

  const handleParseAndPreview = () => {
    setErrorMsg('');
    try {
      let combinedSegments = [];
      let outboundSegs = [];
      let returnSegs = [];
      let mcSegs = [];

      if (tripType === 'one-way') {
        if (!outboundText.trim()) {
          setErrorMsg('Outbound GDS lines are required for One Way import.');
          return;
        }
        outboundSegs = parseTextToSegments(outboundText, outboundYear).map(s => ({ ...s, journey_direction: 'outbound' }));
        combinedSegments = outboundSegs;
      } else if (tripType === 'round-trip') {
        if (!outboundText.trim()) {
          setErrorMsg('Outbound GDS lines are required for Round Trip import.');
          return;
        }
        outboundSegs = parseTextToSegments(outboundText, outboundYear).map(s => ({ ...s, journey_direction: 'outbound' }));
        if (returnText.trim()) {
          returnSegs = parseTextToSegments(returnText, returnYear).map(s => ({ ...s, journey_direction: 'return' }));
        }
        combinedSegments = [...outboundSegs, ...returnSegs];
      } else if (tripType === 'multi-city') {
        let hasContent = false;
        multiCityJourneys.forEach((journey, idx) => {
          if (journey.text.trim()) {
            hasContent = true;
            const segs = parseTextToSegments(journey.text, journey.year).map(s => ({
              ...s,
              journey_direction: 'multi_city',
              journey_index: idx + 1
            }));
            mcSegs.push(...segs);
          }
        });
        if (!hasContent) {
          setErrorMsg('At least one Multi-City journey GDS line block is required.');
          return;
        }
        combinedSegments = mcSegs;
      }

      if (combinedSegments.length === 0) {
        setErrorMsg('Could not parse any valid flight segments from the provided GDS text.');
        return;
      }

      setParsedPreview({
        tripType,
        outboundSegments: outboundSegs,
        returnSegments: returnSegs,
        multiCityJourneys: mcSegs,
        allSegments: combinedSegments
      });
      setStep('preview');
    } catch (err) {
      setErrorMsg(`Parsing Error: ${err.message}`);
    }
  };

  const handleConfirm = () => {
    if (existingItineraryHasData && !confirmReplace) {
      setConfirmReplace(true);
      return;
    }
    onConfirmImport(parsedPreview);
    onClose();
  };

  return (
    <>
      <AdminItineraryHelpModal isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} />
      <div style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.75)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px'
      }}>
        <div style={{
          backgroundColor: '#ffffff', borderRadius: '12px', width: '100%', maxWidth: '720px',
          maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)', padding: '24px'
        }}>
          {/* Modal Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: '14px', marginBottom: '20px' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#0f172a' }}>
                  Import Flight Itinerary from GDS
                </h3>
                <button
                  type="button"
                  aria-label="Itinerary import help"
                  title="Itinerary import help"
                  onClick={() => setIsHelpOpen(true)}
                  style={{
                    background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '50%',
                    width: '28px', height: '28px', fontWeight: 'bold', cursor: 'pointer',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#1e3a5f', fontSize: '13px'
                  }}
                >
                  ⓘ
                </button>
              </div>
              <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                Paste GDS text lines (Amadeus / Sabre / Apollo) to build itinerary segments
              </div>
            </div>
            <button onClick={onClose} style={{ border: 'none', background: 'transparent', fontSize: '20px', cursor: 'pointer', color: '#64748b' }}>
              ✕
            </button>
          </div>

        {errorMsg && (
          <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fca5a5', color: '#991b1b', padding: '10px 14px', borderRadius: '6px', fontSize: '13px', marginBottom: '16px' }}>
            ⚠️ {errorMsg}
          </div>
        )}

        {/* STEP 1: Select Trip Type */}
        {step === 'select_type' && (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <h4 style={{ margin: '0 0 16px 0', fontSize: '15px', color: '#334155' }}>Select Trip Type to Begin Import</h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
              <button
                onClick={() => handleSelectTripType('one-way')}
                style={{
                  padding: '16px 12px', border: '2px solid #cbd5e1', borderRadius: '8px', background: '#f8fafc',
                  cursor: 'pointer', fontWeight: 700, fontSize: '14px', color: '#0f172a', transition: 'all 0.2s'
                }}
              >
                ✈️ One Way
              </button>
              <button
                onClick={() => handleSelectTripType('round-trip')}
                style={{
                  padding: '16px 12px', border: '2px solid #cbd5e1', borderRadius: '8px', background: '#f8fafc',
                  cursor: 'pointer', fontWeight: 700, fontSize: '14px', color: '#0f172a', transition: 'all 0.2s'
                }}
              >
                🔄 Round Trip
              </button>
              <button
                onClick={() => handleSelectTripType('multi-city')}
                style={{
                  padding: '16px 12px', border: '2px solid #cbd5e1', borderRadius: '8px', background: '#f8fafc',
                  cursor: 'pointer', fontWeight: 700, fontSize: '14px', color: '#0f172a', transition: 'all 0.2s'
                }}
              >
                🗺️ Multi-City
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: Input GDS Lines */}
        {step === 'input' && (
          <div>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
              {['one-way', 'round-trip', 'multi-city'].map(type => (
                <button
                  key={type}
                  onClick={() => handleSelectTripType(type)}
                  style={{
                    padding: '6px 12px', borderRadius: '20px', border: '1px solid',
                    borderColor: tripType === type ? '#8b1236' : '#cbd5e1',
                    backgroundColor: tripType === type ? '#8b1236' : '#f8fafc',
                    color: tripType === type ? '#ffffff' : '#475569',
                    fontSize: '12px', fontWeight: 700, cursor: 'pointer'
                  }}
                >
                  {type === 'one-way' ? 'One Way' : type === 'round-trip' ? 'Round Trip' : 'Multi-City'}
                </button>
              ))}
            </div>

            {/* ONE WAY INPUT */}
            {tripType === 'one-way' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <label style={{ fontSize: '13px', fontWeight: 700, color: '#1e293b' }}>Outbound GDS Lines *</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '12px', color: '#64748b' }}>Travel Year:</span>
                    <select
                      value={outboundYear}
                      onChange={(e) => setOutboundYear(e.target.value)}
                      style={{ padding: '4px 8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '12px' }}
                    >
                      <option value="2026">2026</option>
                      <option value="2027">2027</option>
                    </select>
                  </div>
                </div>
                <textarea
                  rows={4}
                  value={outboundText}
                  onChange={(e) => setOutboundText(e.target.value)}
                  placeholder="01 DL 106 Y 15SEP JFKLHR 1930 0745 NN1"
                  style={{ width: '100%', fontFamily: 'monospace', fontSize: '12px', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                />
              </div>
            )}

            {/* ROUND TRIP INPUT */}
            {tripType === 'round-trip' && (
              <div>
                {/* Outbound */}
                <div style={{ marginBottom: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <label style={{ fontSize: '13px', fontWeight: 700, color: '#8b1236' }}>Outbound Journey GDS Lines *</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '12px', color: '#64748b' }}>Year:</span>
                      <select value={outboundYear} onChange={(e) => setOutboundYear(e.target.value)} style={{ padding: '3px 6px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '12px' }}>
                        <option value="2026">2026</option>
                        <option value="2027">2027</option>
                      </select>
                    </div>
                  </div>
                  <textarea
                    rows={3}
                    value={outboundText}
                    onChange={(e) => setOutboundText(e.target.value)}
                    placeholder="01 UA 556 Y 15SEP EWRIAH 1045 1336 NN1"
                    style={{ width: '100%', fontFamily: 'monospace', fontSize: '12px', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                  />
                </div>

                {/* Return */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <label style={{ fontSize: '13px', fontWeight: 700, color: '#1e293b' }}>Return Journey GDS Lines</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '12px', color: '#64748b' }}>Year:</span>
                      <select value={returnYear} onChange={(e) => setReturnYear(e.target.value)} style={{ padding: '3px 6px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '12px' }}>
                        <option value="2026">2026</option>
                        <option value="2027">2027</option>
                      </select>
                    </div>
                  </div>
                  <textarea
                    rows={3}
                    value={returnText}
                    onChange={(e) => setReturnText(e.target.value)}
                    placeholder="02 UA 1675 Y 25SEP IAHEWR 1625 2110 NN1"
                    style={{ width: '100%', fontFamily: 'monospace', fontSize: '12px', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                  />
                  {!returnText.trim() && (
                    <div style={{ fontSize: '11px', color: '#d97706', marginTop: '4px' }}>
                      ⚠️ Return itinerary has not been added yet. It can be added now or edited later.
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* MULTI-CITY INPUT */}
            {tripType === 'multi-city' && (
              <div>
                {multiCityJourneys.map((journey, idx) => (
                  <div key={journey.id} style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px', marginBottom: '12px', backgroundColor: '#f8fafc' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <span style={{ fontWeight: 700, fontSize: '13px', color: '#8b1236' }}>Flight / Leg #{idx + 1}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <select value={journey.year} onChange={(e) => handleUpdateMultiCityJourney(journey.id, 'year', e.target.value)} style={{ padding: '2px 6px', fontSize: '12px', borderRadius: '4px' }}>
                          <option value="2026">2026</option>
                          <option value="2027">2027</option>
                        </select>
                        {multiCityJourneys.length > 1 && (
                          <button onClick={() => handleRemoveMultiCityJourney(journey.id)} style={{ border: 'none', background: 'none', color: '#ef4444', fontSize: '12px', cursor: 'pointer' }}>
                            Remove
                          </button>
                        )}
                      </div>
                    </div>
                    <textarea
                      rows={2}
                      value={journey.text}
                      onChange={(e) => handleUpdateMultiCityJourney(journey.id, 'text', e.target.value)}
                      placeholder="01 AA 100 Y 10OCT JFKLAX 0800 1130 NN1"
                      style={{ width: '100%', fontFamily: 'monospace', fontSize: '12px', padding: '6px', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                    />
                  </div>
                ))}

                <button
                  onClick={handleAddMultiCityJourney}
                  style={{ width: '100%', padding: '8px', border: '1px dashed #8b1236', borderRadius: '6px', backgroundColor: '#fff5f7', color: '#8b1236', fontWeight: 700, fontSize: '13px', cursor: 'pointer' }}
                >
                  + Add Flight / Leg Box
                </button>
              </div>
            )}
          </div>
        )}

        {/* STEP 3: Preview Parsed Segments */}
        {step === 'preview' && parsedPreview && (
          <div>
            <div style={{ backgroundColor: '#f1f5f9', padding: '10px 14px', borderRadius: '6px', fontSize: '13px', fontWeight: 700, color: '#1e293b', marginBottom: '14px' }}>
              Parsed Itinerary Timeline ({parsedPreview.allSegments.length} Segments Total)
            </div>

            {existingItineraryHasData && (
              <div style={{ backgroundColor: '#fffbeb', border: '1px solid #fde68a', color: '#b45309', padding: '12px', borderRadius: '6px', fontSize: '13px', marginBottom: '14px' }}>
                ⚠️ <strong>This booking already has itinerary data.</strong> Confirming will replace the existing flight segments with this imported itinerary.
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '280px', overflowY: 'auto' }}>
              {parsedPreview.allSegments.map((seg, idx) => (
                <div key={idx} style={{ border: '1px solid #cbd5e1', borderRadius: '6px', padding: '10px 14px', backgroundColor: '#ffffff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <span style={{ fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', padding: '2px 6px', borderRadius: '4px', backgroundColor: seg.journey_direction === 'return' ? '#3b82f6' : '#8b1236', color: '#ffffff', marginRight: '8px' }}>
                      {seg.journey_direction || 'outbound'}
                    </span>
                    <strong style={{ fontSize: '14px', color: '#0f172a' }}>{seg.carrierCode} {seg.flightNumber}</strong>
                    <span style={{ fontSize: '12px', color: '#64748b', marginLeft: '10px' }}>Cabin: {seg.cabin || 'Economy'}</span>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: '#334155', marginTop: '4px' }}>
                      {seg.departureAirport} → {seg.arrivalAirport}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', fontSize: '12px', color: '#475569' }}>
                    <div>Dep: {seg.departureDate} @ {seg.departureTime}</div>
                    <div>Arr: {seg.arrivalDate || seg.departureDate} @ {seg.arrivalTime}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Modal Footer */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #e2e8f0', paddingTop: '16px', marginTop: '20px' }}>
          <button onClick={onClose} style={{ padding: '8px 16px', border: '1px solid #cbd5e1', borderRadius: '6px', backgroundColor: '#ffffff', color: '#475569', fontWeight: 600, fontSize: '13px', cursor: 'pointer' }}>
            Cancel
          </button>

          <div>
            {step === 'preview' ? (
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => setStep('input')} style={{ padding: '8px 16px', border: '1px solid #cbd5e1', borderRadius: '6px', backgroundColor: '#f8fafc', color: '#334155', fontWeight: 600, fontSize: '13px', cursor: 'pointer' }}>
                  Back to Edit
                </button>
                <button onClick={handleConfirm} style={{ padding: '8px 18px', border: 'none', borderRadius: '6px', backgroundColor: '#8b1236', color: '#ffffff', fontWeight: 700, fontSize: '13px', cursor: 'pointer' }}>
                  {confirmReplace ? 'Confirm Overwrite & Import' : 'Confirm Import'}
                </button>
              </div>
            ) : (
              step === 'input' && (
                <button onClick={handleParseAndPreview} style={{ padding: '8px 18px', border: 'none', borderRadius: '6px', backgroundColor: '#8b1236', color: '#ffffff', fontWeight: 700, fontSize: '13px', cursor: 'pointer' }}>
                  Parse & Preview →
                </button>
              )
            )}
          </div>
        </div>
      </div>
    </div>
    </>
  );
}
