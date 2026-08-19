import React, { useState, useCallback } from 'react';
import { adminAPI } from '../../../shared/api/api';

export default function BookingBackupImportModal({ isOpen, onClose, onImportComplete }) {
  const [step, setStep] = useState('select'); // 'select' | 'review' | 'importing' | 'results'
  const [backupData, setBackupData] = useState(null);
  const [parseError, setParseError] = useState('');
  const [fileName, setFileName] = useState('');

  // Review state
  const [bookingSelections, setBookingSelections] = useState([]);
  const [adminPassword, setAdminPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');

  // Results
  const [importResults, setImportResults] = useState(null);
  const [importError, setImportError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const resetState = useCallback(() => {
    setStep('select');
    setBackupData(null);
    setParseError('');
    setFileName('');
    setBookingSelections([]);
    setAdminPassword('');
    setPasswordError('');
    setImportResults(null);
    setImportError('');
    setIsSubmitting(false);
  }, []);

  const handleClose = useCallback(() => {
    resetState();
    onClose();
  }, [resetState, onClose]);

  const handleFileSelect = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setParseError('');
    setFileName(file.name);

    if (!file.name.endsWith('.json')) {
      setParseError('Please select a .json backup file.');
      return;
    }

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);

      // Validate format
      if (parsed.format !== 'THE_FINAL_SEAT_BOOKING_BACKUP') {
        setParseError(`Unrecognized backup format: ${parsed.format || 'missing'}. Expected: THE_FINAL_SEAT_BOOKING_BACKUP`);
        return;
      }

      if (!parsed.version || parsed.version > 1) {
        setParseError(`Unsupported backup version: ${parsed.version}. Only version 1 is supported.`);
        return;
      }

      if (!Array.isArray(parsed.bookings) || parsed.bookings.length === 0) {
        setParseError('Backup file contains no bookings.');
        return;
      }

      setBackupData(parsed);

      // Initialize selections — all selected with SKIP strategy by default
      const selections = parsed.bookings.map((b, idx) => {
        const booking = b.booking || b;
        const code = booking.confirmation_code || booking.confirmationCode || booking.booking_reference || `Unknown-${idx}`;
        const name = booking.passenger_name || booking.customer_name || 'Unknown Customer';
        return {
          index: idx,
          selected: true,
          strategy: 'SKIP',
          confirmationCode: code,
          customerName: name,
          isDuplicate: false, // Will be checked later
          status: booking.status || 'UNKNOWN'
        };
      });

      setBookingSelections(selections);
      setStep('review');
    } catch (err) {
      setParseError(`Failed to parse file: ${err.message}`);
    }
  }, []);

  const handleToggleBookingSelection = useCallback((index) => {
    setBookingSelections(prev => prev.map((s, i) =>
      i === index ? { ...s, selected: !s.selected } : s
    ));
  }, []);

  const handleStrategyChange = useCallback((index, strategy) => {
    setBookingSelections(prev => prev.map((s, i) =>
      i === index ? { ...s, strategy } : s
    ));
  }, []);

  const handleSelectAll = useCallback((checked) => {
    setBookingSelections(prev => prev.map(s => ({ ...s, selected: checked })));
  }, []);

  const hasReplaceStrategy = bookingSelections.some(s => s.selected && s.strategy === 'REPLACE');
  const selectedCount = bookingSelections.filter(s => s.selected).length;

  const handleSubmitImport = useCallback(async () => {
    setImportError('');
    setPasswordError('');

    const selected = bookingSelections
      .filter(s => s.selected)
      .map(s => ({ index: s.index, strategy: s.strategy }));

    if (selected.length === 0) {
      setImportError('No bookings selected for import.');
      return;
    }

    if (hasReplaceStrategy && !adminPassword) {
      setPasswordError('Admin password is required when replacing existing bookings.');
      return;
    }

    setIsSubmitting(true);
    setStep('importing');

    try {
      const result = await adminAPI.importBookingBackup(
        backupData,
        selected,
        hasReplaceStrategy ? adminPassword : undefined
      );

      setImportResults(result);
      setStep('results');

      if (onImportComplete) {
        onImportComplete(result);
      }
    } catch (err) {
      const errorMsg = err.response?.data?.error?.message || err.message || 'Import failed.';
      setImportError(errorMsg);
      setStep('review');
    } finally {
      setIsSubmitting(false);
    }
  }, [bookingSelections, backupData, adminPassword, hasReplaceStrategy, onImportComplete]);

  if (!isOpen) return null;

  return (
    <div className="backup-import-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}>
      <div className="backup-import-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="backup-import-modal-header">
          <h2><i className="fas fa-box-archive" style={{ marginRight: '8px' }}></i>Import Booking Backup</h2>
          <button type="button" onClick={handleClose} className="modal-close-btn" aria-label="Close modal">
            <i className="fas fa-times"></i>
          </button>
        </div>

        {/* Step: Select File */}
        {step === 'select' && (
          <div className="backup-import-modal-body">
            <div className="backup-import-dropzone">
              <i className="fas fa-file-arrow-up" style={{ fontSize: '2.5rem', color: '#64748b', marginBottom: '12px' }}></i>
              <p style={{ fontWeight: 600, color: '#334155', marginBottom: '8px' }}>Select a booking backup file</p>
              <p style={{ fontSize: '0.8rem', color: '#94a3b8', marginBottom: '16px' }}>
                Only <strong>.json</strong> files with format <code>THE_FINAL_SEAT_BOOKING_BACKUP</code> are accepted.
              </p>
              <label className="backup-import-file-btn">
                <i className="fas fa-folder-open" style={{ marginRight: '6px' }}></i>
                Browse Files
                <input
                  type="file"
                  accept=".json"
                  onChange={handleFileSelect}
                  style={{ display: 'none' }}
                />
              </label>
              {fileName && <p style={{ marginTop: '12px', fontSize: '0.82rem', color: '#475569' }}>Selected: {fileName}</p>}
            </div>
            {parseError && (
              <div className="backup-import-error">
                <i className="fas fa-exclamation-triangle" style={{ marginRight: '6px' }}></i>
                {parseError}
              </div>
            )}
          </div>
        )}

        {/* Step: Review */}
        {step === 'review' && backupData && (
          <div className="backup-import-modal-body">
            {/* Backup metadata */}
            <div className="backup-import-meta">
              <div className="meta-item"><strong>Format:</strong> {backupData.format}</div>
              <div className="meta-item"><strong>Version:</strong> {backupData.version}</div>
              <div className="meta-item"><strong>Exported:</strong> {backupData.exportedAt ? new Date(backupData.exportedAt).toLocaleString() : 'Unknown'}</div>
              <div className="meta-item"><strong>Bookings:</strong> {backupData.bookingCount || backupData.bookings?.length || 0}</div>
              <div className="meta-item"><strong>File:</strong> {fileName}</div>
            </div>

            {/* Booking list with selections */}
            <div className="backup-import-booking-list">
              <div className="backup-import-list-header">
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={selectedCount === bookingSelections.length}
                    onChange={(e) => handleSelectAll(e.target.checked)}
                  />
                  <span style={{ fontWeight: 600 }}>Select All ({bookingSelections.length} bookings)</span>
                </label>
                <span style={{ fontSize: '0.8rem', color: '#64748b' }}>{selectedCount} selected</span>
              </div>

              {bookingSelections.map((sel, idx) => (
                <div key={idx} className={`backup-import-booking-item ${sel.selected ? 'selected' : ''}`}>
                  <div className="booking-item-left">
                    <input
                      type="checkbox"
                      checked={sel.selected}
                      onChange={() => handleToggleBookingSelection(idx)}
                    />
                    <div className="booking-item-info">
                      <strong>{sel.confirmationCode}</strong>
                      <span className="booking-item-name">{sel.customerName}</span>
                      <span className={`backup-status-badge backup-status--${(sel.status || 'pending').toLowerCase()}`}>
                        {sel.status}
                      </span>
                    </div>
                  </div>
                  <div className="booking-item-right">
                    <select
                      value={sel.strategy}
                      onChange={(e) => handleStrategyChange(idx, e.target.value)}
                      disabled={!sel.selected}
                      className="strategy-select"
                    >
                      <option value="SKIP">Skip if exists</option>
                      <option value="NEW_COPY">Restore as new copy</option>
                      <option value="REPLACE">Replace existing</option>
                    </select>
                  </div>
                </div>
              ))}
            </div>

            {/* Admin password for REPLACE */}
            {hasReplaceStrategy && (
              <div className="backup-import-password-section">
                <div className="backup-import-warning">
                  <i className="fas fa-exclamation-triangle" style={{ marginRight: '6px', color: '#f59e0b' }}></i>
                  <strong>Warning:</strong> One or more bookings are set to <strong>Replace existing</strong>. This will permanently overwrite the current booking data. Admin password is required.
                </div>
                <div style={{ marginTop: '10px' }}>
                  <label style={{ fontWeight: 600, fontSize: '0.85rem', color: '#334155' }}>Admin Password</label>
                  <input
                    type="password"
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value)}
                    placeholder="Enter admin password"
                    className="admin-input"
                    style={{ marginTop: '4px', width: '100%' }}
                  />
                  {passwordError && <p style={{ color: '#dc2626', fontSize: '0.8rem', marginTop: '4px' }}>{passwordError}</p>}
                </div>
              </div>
            )}

            {importError && (
              <div className="backup-import-error">
                <i className="fas fa-exclamation-triangle" style={{ marginRight: '6px' }}></i>
                {importError}
              </div>
            )}

            {/* Actions */}
            <div className="backup-import-actions">
              <button type="button" onClick={() => { resetState(); }} className="admin-secondary-btn">
                <i className="fas fa-arrow-left" style={{ marginRight: '4px' }}></i> Back
              </button>
              <button
                type="button"
                onClick={handleSubmitImport}
                disabled={selectedCount === 0 || isSubmitting}
                className="admin-primary-btn"
                style={{ opacity: (selectedCount === 0 || isSubmitting) ? 0.5 : 1 }}
              >
                <i className="fas fa-upload" style={{ marginRight: '4px' }}></i>
                Restore {selectedCount} Booking{selectedCount !== 1 ? 's' : ''}
              </button>
            </div>
          </div>
        )}

        {/* Step: Importing */}
        {step === 'importing' && (
          <div className="backup-import-modal-body" style={{ textAlign: 'center', padding: '40px 20px' }}>
            <div className="import-spinner"></div>
            <p style={{ fontWeight: 600, color: '#334155', marginTop: '16px' }}>Restoring bookings…</p>
            <p style={{ fontSize: '0.82rem', color: '#64748b' }}>This may take a moment. Please do not close this window.</p>
          </div>
        )}

        {/* Step: Results */}
        {step === 'results' && importResults && (
          <div className="backup-import-modal-body">
            <div className="backup-import-results-summary">
              <h3 style={{ marginBottom: '12px' }}>
                <i className="fas fa-check-circle" style={{ color: '#10b981', marginRight: '8px' }}></i>
                Import Complete
              </h3>
              <div className="results-summary-grid">
                <div className="result-stat"><span className="result-stat-value">{importResults.summary?.requested || 0}</span><span className="result-stat-label">Requested</span></div>
                <div className="result-stat result-stat--success"><span className="result-stat-value">{importResults.summary?.restored || 0}</span><span className="result-stat-label">Restored</span></div>
                <div className="result-stat result-stat--warning"><span className="result-stat-value">{importResults.summary?.skipped || 0}</span><span className="result-stat-label">Skipped</span></div>
                <div className="result-stat result-stat--error"><span className="result-stat-value">{importResults.summary?.failed || 0}</span><span className="result-stat-label">Failed</span></div>
              </div>
            </div>

            <div className="backup-import-results-list">
              {(importResults.results || []).map((r, idx) => (
                <div key={idx} className={`result-item result-item--${(r.status || '').toLowerCase()}`}>
                  <strong>{r.confirmationCode}</strong>
                  <span className={`result-status-badge result-status--${(r.status || '').toLowerCase()}`}>{r.status}</span>
                  {r.message && <span className="result-message">{r.message}</span>}
                </div>
              ))}
            </div>

            <div className="backup-import-actions">
              <button type="button" onClick={handleClose} className="admin-primary-btn">
                <i className="fas fa-check" style={{ marginRight: '4px' }}></i> Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
