import React, { useRef, useState } from 'react';
import AdminItineraryImportModal from '../../../shared/components/admin/AdminItineraryImportModal';

const normalizeTripType = value => {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'round-trip' || raw === 'round_trip') return 'round_trip';
  if (raw === 'multi-city' || raw === 'multi_city') return 'multi_city';
  return 'one_way';
};

const collectImportedSegments = importData => {
  if (!importData) return [];
  if (Array.isArray(importData.allSegments) && importData.allSegments.length) {
    return importData.allSegments.map(segment => ({ ...segment }));
  }

  return [
    ...(importData.outboundSegments || []).map(segment => ({
      ...segment,
      journey_direction: 'outbound',
      direction: 'outbound'
    })),
    ...(importData.returnSegments || []).map(segment => ({
      ...segment,
      journey_direction: 'return',
      direction: 'return'
    })),
    ...(importData.multiCityJourneys || []).map(segment => ({
      ...segment,
      journey_direction: segment.journey_direction || 'multi_city',
      direction: segment.direction || segment.journey_direction || 'multi_city'
    }))
  ];
};

export default function AdminEditBookingGdsImporter({ isOpen, onClose, onApply }) {
  const savingRef = useRef(false);
  const [applyError, setApplyError] = useState('');

  const closeSharedImporter = () => {
    if (!savingRef.current) onClose?.();
  };

  const handleConfirmImport = async importData => {
    if (savingRef.current) return;
    const segments = collectImportedSegments(importData);
    if (!segments.length) {
      setApplyError('No valid itinerary segments were produced. Review the GDS lines and try again.');
      return;
    }

    savingRef.current = true;
    setApplyError('');
    try {
      await Promise.resolve(onApply?.({
        segments,
        tripType: normalizeTripType(importData?.tripType),
        sourceText: null
      }));
      savingRef.current = false;
      onClose?.();
    } catch (error) {
      savingRef.current = false;
      setApplyError(error?.message || 'The itinerary could not be saved. Please try again.');
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <AdminItineraryImportModal
        isOpen={isOpen}
        onClose={closeSharedImporter}
        onConfirmImport={handleConfirmImport}
        existingItineraryHasData={true}
      />
      {applyError && (
        <div
          role="alert"
          style={{
            position: 'fixed',
            left: '50%',
            bottom: '28px',
            transform: 'translateX(-50%)',
            zIndex: 10050,
            padding: '12px 16px',
            borderRadius: '10px',
            border: '1px solid #fecaca',
            background: '#fef2f2',
            color: '#991b1b',
            fontWeight: 700
          }}
        >
          {applyError}
        </div>
      )}
    </>
  );
}
