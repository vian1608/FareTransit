import React, { useState, useEffect, useCallback } from 'react';
import { adminAPI } from '../../api/api';

export default function AdminEmailPreviewModal({
  isOpen,
  onClose,
  bookingId,
  emailType = 'booking_request',
  onMarkManuallySentSuccess
}) {
  const [loading, setLoading] = useState(false);
  const [previewData, setPreviewData] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [activeTab, setActiveTab] = useState('html'); // 'html' | 'text'
  const [copyNotice, setCopyNotice] = useState('');
  const [confirmManualModal, setConfirmManualModal] = useState(false);
  const [manualSubmitting, setManualSubmitting] = useState(false);

  const fetchPreview = useCallback(async () => {
    setLoading(true);
    setErrorMsg('');
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 15000);

    try {
      const res = await adminAPI.getEmailPreview(bookingId, emailType, { signal: controller.signal });
      window.clearTimeout(timeoutId);

      if (res?.success) {
        setPreviewData(res.preview || res);
      } else {
        const apiErr = res?.error;
        setErrorMsg(apiErr?.code ? `${apiErr.code}: ${apiErr.message}` : (res?.message || 'Failed to load email preview.'));
      }
    } catch (err) {
      window.clearTimeout(timeoutId);
      if (err?.name === 'AbortError' || err?.name === 'CanceledError' || err?.code === 'ERR_CANCELED' || err?.code === 'ECONNABORTED') {
        setErrorMsg('EMAIL_PREVIEW_TIMEOUT: The email preview took too long to generate.');
      } else {
        const apiErr = err?.response?.data?.error;
        if (apiErr?.code && apiErr?.message) {
          setErrorMsg(`${apiErr.code}: ${apiErr.message}`);
        } else {
          setErrorMsg(err.message || 'Network error fetching preview.');
        }
      }
    } finally {
      setLoading(false);
    }
  }, [bookingId, emailType]);

  useEffect(() => {
    if (isOpen && bookingId) {
      fetchPreview();
    } else {
      setPreviewData(null);
      setErrorMsg('');
      setCopyNotice('');
      setConfirmManualModal(false);
    }
  }, [isOpen, bookingId, emailType, fetchPreview]);

  if (!isOpen) return null;

  const showNotice = (msg) => {
    setCopyNotice(msg);
    setTimeout(() => setCopyNotice(''), 3500);
  };

  const handleCopySubject = async () => {
    if (!previewData?.subject) return;
    try {
      await navigator.clipboard.writeText(previewData.subject);
      showNotice('Subject copied to clipboard!');
    } catch (err) {
      showNotice('Copy failed. Please manually select text.');
    }
  };

  const handleCopyText = async () => {
    if (!previewData?.text) return;
    try {
      await navigator.clipboard.writeText(previewData.text);
      showNotice('Plain text email copied to clipboard!');
    } catch (err) {
      showNotice('Copy failed. Please manually select text.');
    }
  };

  const handleCopyFormattedEmail = async () => {
    if (!previewData?.html) return;
    try {
      if (navigator.clipboard && window.ClipboardItem) {
        const typeHtml = 'text/html';
        const typePlain = 'text/plain';
        const blobHtml = new Blob([previewData.html], { type: typeHtml });
        const blobPlain = new Blob([previewData.text || previewData.html], { type: typePlain });
        const item = new window.ClipboardItem({
          [typeHtml]: blobHtml,
          [typePlain]: blobPlain
        });
        await navigator.clipboard.write([item]);
        showNotice('Formatted rich email copied! You can paste directly into Gmail or Outlook.');
      } else {
        await navigator.clipboard.writeText(previewData.text || previewData.html);
        showNotice('Plain text email copied to clipboard.');
      }
    } catch (err) {
      await navigator.clipboard.writeText(previewData.text || previewData.html).catch(() => {});
      showNotice('Email content copied to clipboard.');
    }
  };

  const handleOpenEmailApp = () => {
    if (!previewData) return;
    const recipient = previewData.recipient || '';
    const subject = encodeURIComponent(previewData.subject || '');
    const bodyText = previewData.text || '';
    const encodedBody = encodeURIComponent(bodyText);

    if (encodedBody.length > 1800) {
      showNotice('This email is too large to open automatically in mailto link. Use Copy Formatted Email instead.');
      return;
    }

    window.location.href = `mailto:${recipient}?subject=${subject}&body=${encodedBody}`;
  };

  const handleMarkManuallySentConfirm = async () => {
    setManualSubmitting(true);
    try {
      const res = await adminAPI.markEmailManuallySent(bookingId, emailType);
      if (res?.success) {
        showNotice('Email marked as manually sent!');
        setConfirmManualModal(false);
        if (onMarkManuallySentSuccess) {
          onMarkManuallySentSuccess(res);
        }
        setTimeout(() => onClose(), 1500);
      } else {
        setErrorMsg(res?.error?.message || 'Failed to mark as manually sent.');
      }
    } catch (err) {
      setErrorMsg(err.message || 'Error updating status.');
    } finally {
      setManualSubmitting(false);
    }
  };

  const getTitleLabel = () => {
    if (emailType === 'booking_request') return 'Preview Booking Request Email';
    if (emailType === 'authorization') return 'Preview Authorization Email';
    if (emailType === 'final_ticket') return 'Preview Final Ticket Email';
    return 'Preview Email';
  };

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(15, 23, 42, 0.75)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px'
    }}>
      <div style={{
        backgroundColor: '#ffffff', borderRadius: '12px', width: '100%', maxWidth: '840px',
        maxHeight: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)'
      }}>
        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#0f172a' }}>
              {getTitleLabel()}
            </h3>
            <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
              Internal rendering engine — preview email without invoking Resend provider
            </div>
          </div>
          <button onClick={onClose} style={{ border: 'none', background: 'transparent', fontSize: '22px', cursor: 'pointer', color: '#64748b' }}>
            ✕
          </button>
        </div>

        {/* Copy Notice Alert */}
        {copyNotice && (
          <div style={{ backgroundColor: '#f0fdf4', borderBottom: '1px solid #bbf7d0', color: '#166534', padding: '10px 20px', fontSize: '13px', fontWeight: 700, textAlign: 'center' }}>
            ✓ {copyNotice}
          </div>
        )}

        {/* Main Body */}
        <div style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>
          {loading && (
            <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
              ⏳ Loading rendered email template...
            </div>
          )}

          {errorMsg && (
            <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fca5a5', color: '#991b1b', padding: '14px 16px', borderRadius: '8px', marginBottom: '16px', fontSize: '13px' }}>
              <div style={{ fontWeight: 800, marginBottom: '6px', fontSize: '14px' }}>⚠️ Email Preview Generation Failed</div>
              <div>{errorMsg}</div>
              <div style={{ marginTop: '12px', display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  onClick={fetchPreview}
                  disabled={loading}
                  style={{ padding: '6px 14px', backgroundColor: '#991b1b', color: '#ffffff', border: 'none', borderRadius: '6px', fontWeight: 700, cursor: 'pointer', fontSize: '12px' }}
                >
                  {loading ? 'Retrying...' : '🔄 Retry Preview'}
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  style={{ padding: '6px 14px', backgroundColor: '#ffffff', color: '#475569', border: '1px solid #cbd5e1', borderRadius: '6px', fontWeight: 600, cursor: 'pointer', fontSize: '12px' }}
                >
                  Close
                </button>
              </div>
            </div>
          )}

          {!loading && previewData && (
            <div>
              {/* Incomplete Warning if missing fields */}
              {previewData.missingFields && previewData.missingFields.length > 0 && (
                <div style={{ backgroundColor: '#fffbeb', border: '1px solid #fde68a', color: '#b45309', padding: '12px', borderRadius: '6px', fontSize: '13px', marginBottom: '16px' }}>
                  <div style={{ fontWeight: 800, fontSize: '14px', marginBottom: '4px' }}>⚠️ PREVIEW INCOMPLETE</div>
                  <div>The following required details are missing before this email can be dispatched automatically:</div>
                  <ul style={{ margin: '6px 0 0 18px', padding: 0 }}>
                    {previewData.missingFields.map((field, i) => (
                      <li key={i}>{field}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Recipient & Subject Info Box */}
              <div style={{ backgroundColor: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '12px 16px', marginBottom: '16px', fontSize: '13px' }}>
                <div style={{ display: 'flex', marginBottom: '6px' }}>
                  <span style={{ width: '80px', fontWeight: 800, color: '#475569' }}>TO:</span>
                  <span style={{ fontWeight: 700, color: '#0f172a' }}>{previewData.recipient || 'N/A'}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <span style={{ width: '80px', fontWeight: 800, color: '#475569' }}>SUBJECT:</span>
                  <span style={{ fontWeight: 700, color: '#0f172a', flex: 1 }}>{previewData.subject}</span>
                  <button onClick={handleCopySubject} style={{ padding: '3px 8px', fontSize: '11px', border: '1px solid #cbd5e1', borderRadius: '4px', backgroundColor: '#ffffff', cursor: 'pointer', fontWeight: 600 }}>
                    Copy Subject
                  </button>
                </div>
              </div>

              {/* Authorization Special Links */}
              {emailType === 'authorization' && previewData.authorizationUrl && (
                <div style={{ backgroundColor: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '12px 16px', marginBottom: '16px', fontSize: '13px', color: '#1e40af' }}>
                  <div style={{ fontWeight: 800, marginBottom: '4px' }}>🔐 Secure Passenger Authorization URL:</div>
                  <div style={{ fontFamily: 'monospace', fontSize: '12px', wordBreak: 'break-all', backgroundColor: '#ffffff', padding: '6px 10px', borderRadius: '4px', border: '1px solid #93c5fd', marginBottom: '8px' }}>
                    {previewData.authorizationUrl}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '11px', color: '#3b82f6' }}>Expires: {new Date(previewData.authorizationExpiresAt || Date.now()).toLocaleString()}</span>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(previewData.authorizationUrl);
                        showNotice('Authorization link copied!');
                      }}
                      style={{ padding: '4px 10px', backgroundColor: '#2563eb', color: '#ffffff', border: 'none', borderRadius: '4px', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}
                    >
                      Copy Authorization Link
                    </button>
                  </div>
                </div>
              )}

              {/* Tab Selector: HTML vs Plain Text */}
              <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                <button
                  onClick={() => setActiveTab('html')}
                  style={{
                    padding: '6px 12px', border: 'none', borderBottom: activeTab === 'html' ? '2px solid #8b1236' : '2px solid transparent',
                    backgroundColor: 'transparent', fontWeight: activeTab === 'html' ? 800 : 500, color: activeTab === 'html' ? '#8b1236' : '#64748b', cursor: 'pointer', fontSize: '13px'
                  }}
                >
                  HTML Formatted Preview
                </button>
                <button
                  onClick={() => setActiveTab('text')}
                  style={{
                    padding: '6px 12px', border: 'none', borderBottom: activeTab === 'text' ? '2px solid #8b1236' : '2px solid transparent',
                    backgroundColor: 'transparent', fontWeight: activeTab === 'text' ? 800 : 500, color: activeTab === 'text' ? '#8b1236' : '#64748b', cursor: 'pointer', fontSize: '13px'
                  }}
                >
                  Plain Text View
                </button>
              </div>

              {/* Preview Content */}
              {activeTab === 'html' ? (
                <div style={{ border: '1px solid #cbd5e1', borderRadius: '8px', height: '360px', overflow: 'hidden', backgroundColor: '#f8fafc' }}>
                  <iframe
                    title="Email Preview"
                    srcDoc={previewData.html}
                    style={{ width: '100%', height: '100%', border: 'none' }}
                  />
                </div>
              ) : (
                <textarea
                  readOnly
                  value={previewData.text}
                  rows={14}
                  style={{ width: '100%', fontFamily: 'monospace', fontSize: '12px', padding: '12px', border: '1px solid #cbd5e1', borderRadius: '8px', backgroundColor: '#f8fafc' }}
                />
              )}
            </div>
          )}
        </div>

        {/* Manual Sent Confirmation Sub-Modal */}
        {confirmManualModal && (
          <div style={{ padding: '16px 20px', backgroundColor: '#fffbe6', borderTop: '1px solid #ffe58f', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: '13px', color: '#873800', fontWeight: 600 }}>
              Confirm that you personally sent this email to <strong>{previewData?.recipient}</strong> via your personal/external email client?
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => setConfirmManualModal(false)} style={{ padding: '6px 12px', border: '1px solid #d9d9d9', borderRadius: '4px', background: '#ffffff', cursor: 'pointer', fontSize: '12px' }}>
                Cancel
              </button>
              <button
                onClick={handleMarkManuallySentConfirm}
                disabled={manualSubmitting}
                style={{ padding: '6px 14px', border: 'none', borderRadius: '4px', background: '#d48806', color: '#ffffff', fontWeight: 700, cursor: 'pointer', fontSize: '12px' }}
              >
                {manualSubmitting ? 'Updating...' : 'Yes, Mark as Manually Sent'}
              </button>
            </div>
          </div>
        )}

        {/* Footer Toolbar */}
        {(() => {
          const previewUnavailable = loading || !previewData;
          return (
            <div style={{ padding: '14px 20px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f8fafc' }}>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  disabled={previewUnavailable}
                  onClick={handleCopySubject}
                  style={{
                    padding: '6px 12px', border: '1px solid #cbd5e1', borderRadius: '6px',
                    backgroundColor: previewUnavailable ? '#f1f5f9' : '#ffffff',
                    color: previewUnavailable ? '#94a3b8' : '#334155',
                    fontSize: '12px', fontWeight: 600, cursor: previewUnavailable ? 'not-allowed' : 'pointer', opacity: previewUnavailable ? 0.6 : 1
                  }}
                >
                  📋 Copy Subject
                </button>
                <button
                  type="button"
                  disabled={previewUnavailable}
                  onClick={handleCopyText}
                  style={{
                    padding: '6px 12px', border: '1px solid #cbd5e1', borderRadius: '6px',
                    backgroundColor: previewUnavailable ? '#f1f5f9' : '#ffffff',
                    color: previewUnavailable ? '#94a3b8' : '#334155',
                    fontSize: '12px', fontWeight: 600, cursor: previewUnavailable ? 'not-allowed' : 'pointer', opacity: previewUnavailable ? 0.6 : 1
                  }}
                >
                  📄 Copy Plain Text
                </button>
                <button
                  type="button"
                  disabled={previewUnavailable}
                  onClick={handleCopyFormattedEmail}
                  style={{
                    padding: '6px 12px', border: '1px solid #8b1236', borderRadius: '6px',
                    backgroundColor: previewUnavailable ? '#f1f5f9' : '#fff5f7',
                    color: previewUnavailable ? '#94a3b8' : '#8b1236',
                    fontSize: '12px', fontWeight: 700, cursor: previewUnavailable ? 'not-allowed' : 'pointer', opacity: previewUnavailable ? 0.6 : 1
                  }}
                >
                  ✉️ Copy Formatted Email
                </button>
                <button
                  type="button"
                  disabled={previewUnavailable}
                  onClick={handleOpenEmailApp}
                  style={{
                    padding: '6px 12px', border: '1px solid #cbd5e1', borderRadius: '6px',
                    backgroundColor: previewUnavailable ? '#f1f5f9' : '#ffffff',
                    color: previewUnavailable ? '#94a3b8' : '#334155',
                    fontSize: '12px', fontWeight: 600, cursor: previewUnavailable ? 'not-allowed' : 'pointer', opacity: previewUnavailable ? 0.6 : 1
                  }}
                >
                  ↗️ Open in Email App
                </button>
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  disabled={previewUnavailable}
                  onClick={() => setConfirmManualModal(true)}
                  style={{
                    padding: '6px 14px', border: '1px solid #d97706', borderRadius: '6px',
                    backgroundColor: previewUnavailable ? '#f1f5f9' : '#fef3c7',
                    color: previewUnavailable ? '#94a3b8' : '#92400e',
                    fontSize: '12px', fontWeight: 700, cursor: previewUnavailable ? 'not-allowed' : 'pointer', opacity: previewUnavailable ? 0.6 : 1
                  }}
                >
                  Mark as Manually Sent
                </button>
                <button onClick={onClose} style={{ padding: '6px 16px', border: 'none', borderRadius: '6px', backgroundColor: '#475569', color: '#ffffff', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
                  Close
                </button>
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}
