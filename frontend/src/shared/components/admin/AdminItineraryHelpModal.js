import React from 'react';

export default function AdminItineraryHelpModal({ isOpen, onClose }) {
  if (!isOpen) return null;

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.75)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000, padding: '20px'
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: '#ffffff', borderRadius: '12px', width: '100%', maxWidth: '640px',
          maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)', padding: '24px'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: '12px', marginBottom: '16px' }}>
          <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#1e3a5f' }}>
            How to Import Flight Itinerary
          </h3>
          <button
            type="button"
            onClick={onClose}
            style={{ border: 'none', background: 'transparent', fontSize: '22px', cursor: 'pointer', color: '#64748b' }}
          >
            ✕
          </button>
        </div>

        <div style={{ fontSize: '13px', color: '#334155', lineHeight: '1.6' }}>
          <h4 style={{ margin: '12px 0 6px 0', color: '#8b1236', fontSize: '14px', fontWeight: 800 }}>ONE WAY</h4>
          <p style={{ margin: 0 }}>Enter outbound GDS lines in the single journey box.</p>
          <div style={{ background: '#0f172a', color: '#38bdf8', padding: '10px 12px', borderRadius: '6px', fontFamily: 'monospace', fontSize: '12px', margin: '6px 0 12px 0' }}>
            01 DL 106 Y 15SEP JFKLHR 1930 0745 NN1
          </div>
          <p style={{ margin: 0 }}>For connecting flights, list each segment sequentially:</p>
          <div style={{ background: '#0f172a', color: '#38bdf8', padding: '10px 12px', borderRadius: '6px', fontFamily: 'monospace', fontSize: '12px', margin: '6px 0 12px 0' }}>
            01 UA 556 Y 15SEP EWRIAH 1045 1336 NN1<br />
            02 UA 1675 Y 15SEP IAHMDE 1625 2110 NN1
          </div>

          <h4 style={{ margin: '14px 0 6px 0', color: '#8b1236', fontSize: '14px', fontWeight: 800 }}>ROUND TRIP</h4>
          <p style={{ margin: 0 }}>Outbound and return journeys are entered into separate boxes.</p>
          <div style={{ background: '#0f172a', color: '#38bdf8', padding: '10px 12px', borderRadius: '6px', fontFamily: 'monospace', fontSize: '12px', margin: '6px 0 12px 0' }}>
            <strong>Outbound:</strong><br />
            01 UA 556 Y 15SEP EWRIAH 1045 1336 NN1<br />
            02 UA 1675 Y 15SEP IAHMDE 1625 2110 NN1<br /><br />
            <strong>Return:</strong><br />
            03 UA 1676 Y 25SEP MDEIAH 0945 1433 NN1<br />
            04 UA 700 Y 25SEP IAHEWR 1645 2128 NN1
          </div>

          <h4 style={{ margin: '14px 0 6px 0', color: '#8b1236', fontSize: '14px', fontWeight: 800 }}>MULTI-CITY</h4>
          <p style={{ margin: 0 }}>Create one journey box for each city-to-city leg. Each journey box can contain multiple connecting flight segments.</p>

          <h4 style={{ margin: '14px 0 6px 0', color: '#1e3a5f', fontSize: '14px', fontWeight: 800 }}>GDS Line Format Syntax</h4>
          <div style={{ background: '#f8fafc', border: '1px solid #cbd5e1', padding: '12px', borderRadius: '8px', fontSize: '12px', margin: '6px 0 12px 0' }}>
            <div><strong style={{ color: '#8b1236' }}>01</strong> = Segment Sequence Number</div>
            <div><strong style={{ color: '#8b1236' }}>UA</strong> = Airline Carrier Code (IATA 2-letter)</div>
            <div><strong style={{ color: '#8b1236' }}>556</strong> = Flight Number</div>
            <div><strong style={{ color: '#8b1236' }}>Y</strong> = Booking Class / Cabin</div>
            <div><strong style={{ color: '#8b1236' }}>15SEP</strong> = Travel Date (Day &amp; Month)</div>
            <div><strong style={{ color: '#8b1236' }}>EWRIAH</strong> = Origin (EWR) &amp; Destination (IAH) Airports</div>
            <div><strong style={{ color: '#8b1236' }}>1045</strong> = Local Departure Time (24h)</div>
            <div><strong style={{ color: '#8b1236' }}>1336</strong> = Local Arrival Time (24h)</div>
            <div><strong style={{ color: '#8b1236' }}>NN1</strong> = Booking Status / Reference</div>
          </div>

          <p style={{ margin: '10px 0 0 0', fontSize: '12px', color: '#64748b', fontStyle: 'italic' }}>
            💡 <strong>Travel Year Selector:</strong> Because standard GDS text lines omit the calendar year, use the Year dropdown selector above each journey input to set the correct year for parsing.
          </p>
        </div>

        <div style={{ marginTop: '20px', borderTop: '1px solid #e2e8f0', paddingTop: '14px', textAlign: 'right' }}>
          <button
            type="button"
            onClick={onClose}
            style={{ padding: '8px 20px', backgroundColor: '#1e3a5f', color: '#ffffff', border: 'none', borderRadius: '6px', fontWeight: 700, fontSize: '13px', cursor: 'pointer' }}
          >
            Got It
          </button>
        </div>
      </div>
    </div>
  );
}
