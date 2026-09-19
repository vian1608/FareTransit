import React, { useRef, useState } from 'react';
import AdminItineraryImportModal from '../../../shared/components/admin/AdminItineraryImportModal';
import { normalizeItineraryType } from '../../../shared/utils/itineraryArchitecture';

const collectImportedSegments = importData => {
  if (!importData) return [];
  if (Array.isArray(importData.allSegments) && importData.allSegments.length) {
    return importData.allSegments.map(segment => ({ ...segment }));
  }

  return [
    ...(importData.outboundSegments || []).map(segment => ({
      ...segment,
      journey_direction: 'outbound',
      direction: 'outbound',
      journey_index: 1,
      journey_role: 'OUTBOUND'
    })),
    ...(importData.returnSegments || []).map(segment => ({
      ...segment,
      journey_direction: 'return',
      direction: 'return',
      journey_index: 2,
      journey_role: 'RETURN'
    })),
    ...(importData.multiCityJourneys || []).map(segment => ({
      ...segment,
      journey_direction: 'multi_city',
      direction: 'multi_city',
      journey_index: Number(segment.journey_index || segment.journeyIndex || 1),
      journey_role: 'TRIP'
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

    const itineraryType = normalizeItineraryType(importData?.itineraryType || importData?.tripType);

    savingRef.current = true;
    setApplyError('');
    try {
      await Promise.resolve(onApply?.({
        segments,
        tripType: itineraryType,
        itineraryType,
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
