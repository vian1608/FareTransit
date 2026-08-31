import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { adminAPI } from '../../../shared/api/api';
import AdminDashboardPageV2 from './AdminDashboardPageV2';
import AdminBookingWorkspace from '../components/AdminBookingWorkspace';
import AdminBookingAddressPanel from '../components/AdminBookingAddressPanel';
import AdminBookingManagementPanel from '../components/AdminBookingManagementPanel';
import AdminSecurePaymentPanel from '../components/AdminSecurePaymentPanel';
import AdminBookingServiceRequestsPanel from '../components/AdminBookingServiceRequestsPanel';
import AdminBookingOperationalBadges from '../components/AdminBookingOperationalBadges';
import './AdminDashboardEnhancements.css';

const ADMIN_BOOKINGS_PAGE_SIZE = 20;

// Keep the booking list at a bounded page size even though the older dashboard
// component still asks for 25 rows internally.
if (!adminAPI.__tfsTwentyBookingPages) {
  const originalGetBookings = adminAPI.getBookings.bind(adminAPI);
  adminAPI.getBookings = (params = {}, options = {}) => originalGetBookings({
    ...params,
    pageSize: ADMIN_BOOKINGS_PAGE_SIZE
  }, options);
  Object.defineProperty(adminAPI, '__tfsTwentyBookingPages', {
    value: true,
    configurable: false,
    enumerable: false,
    writable: false
  });
}

// The booking detail route contains several focused panels that can request the
// same complete booking at mount time. Coalesce only simultaneous identical
// reads; once the request settles it is removed so saves always get fresh data.
if (!adminAPI.__tfsBookingDetailRequestDedupe) {
  const originalGetBookingById = adminAPI.getBookingById.bind(adminAPI);
  const inFlight = new Map();

  adminAPI.getBookingById = (id, options = {}) => {
    const key = String(id || '').trim();
    if (!key || options?.signal) return originalGetBookingById(id, options);
    if (inFlight.has(key)) return inFlight.get(key);

    const request = Promise.resolve(originalGetBookingById(id, options))
      .finally(() => inFlight.delete(key));
    inFlight.set(key, request);
    return request;
  };

  Object.defineProperty(adminAPI, '__tfsBookingDetailRequestDedupe', {
    value: true,
    configurable: false,
    enumerable: false,
    writable: false
  });
}

function GlobalFailure({ failure, onDismiss }) {
  if (!failure) return null;
  return (
    <div
      role="alert"
      aria-live="assertive"
      style={{
        position: 'fixed', top: '14px', left: '50%', transform: 'translateX(-50%)',
        zIndex: 20000, width: 'min(760px, calc(100vw - 28px))', background: '#fff1f2',
        color: '#991b1b', border: '1px solid #fecdd3', borderRadius: '12px',
        boxShadow: '0 16px 45px rgba(15, 23, 42, 0.24)', padding: '14px 16px'
      }}
    >
      <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 800, fontSize: '15px', marginBottom: '4px' }}>⚠ {failure.title}</div>
          <div style={{ fontSize: '13px', lineHeight: 1.45 }}>{failure.message}</div>
          {(failure.code || failure.path) && (
            <div style={{ marginTop: '6px', fontSize: '11px', color: '#9f1239', wordBreak: 'break-word' }}>
              {failure.code ? `Code: ${failure.code}` : ''}
              {failure.code && failure.path ? ' · ' : ''}
              {failure.path ? `Request: ${failure.path}` : ''}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
          <button type="button" onClick={() => window.location.reload()} style={{ border: '1px solid #be123c', background: '#be123c', color: '#fff', borderRadius: '8px', padding: '7px 11px', fontWeight: 700, cursor: 'pointer' }}>Refresh Dashboard</button>
          <button type="button" onClick={onDismiss} aria-label="Dismiss admin error" style={{ border: '1px solid #fda4af', background: '#fff', color: '#9f1239', borderRadius: '8px', padding: '7px 10px', fontWeight: 700, cursor: 'pointer' }}>Dismiss</button>
        </div>
      </div>
    </div>
  );
}

export default function AdminDashboardPage() {
  const { code } = useParams();
  const isBookingDetailRoute = Boolean(code);
  const [globalFailure, setGlobalFailure] = useState(null);

  useEffect(() => {
    const onAdminApiError = event => {
      const detail = event?.detail || {};
      setGlobalFailure({
        title: 'Admin action failed',
        message: detail.message || 'The admin request failed. Please retry.',
        path: detail.path || null,
        code: detail.code || null
      });
    };
    const onUnhandledRejection = event => {
      const reason = event?.reason;
      setGlobalFailure({
        title: 'Unexpected admin error',
        message: reason?.userMessage || reason?.message || 'An unexpected admin action failed.',
        path: null,
        code: reason?.code || 'UNHANDLED_ADMIN_PROMISE'
      });
    };
    const onWindowError = event => setGlobalFailure({
      title: 'Dashboard error',
      message: event?.message || 'An unexpected dashboard error occurred. Refresh and retry.',
      path: null,
      code: 'ADMIN_UI_ERROR'
    });

    const onViewEditBooking = event => {
      if (isBookingDetailRoute) return;
      const button = event.target instanceof Element ? event.target.closest('button') : null;
      if (!button || button.textContent?.trim() !== 'View / Edit') return;
      const reference = button.closest('tr')?.querySelector('.adv2-ref')?.textContent?.trim();
      if (!reference) return;
      event.preventDefault();
      event.stopPropagation();
      if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
      const newTab = window.open(`/admin/bookings/${encodeURIComponent(reference)}`, '_blank');
      if (newTab) {
        try { newTab.opener = null; newTab.focus(); } catch { /* best effort */ }
      }
    };

    window.addEventListener('admin-api-error', onAdminApiError);
    window.addEventListener('unhandledrejection', onUnhandledRejection);
    window.addEventListener('error', onWindowError);
    document.addEventListener('click', onViewEditBooking, true);
    return () => {
      window.removeEventListener('admin-api-error', onAdminApiError);
      window.removeEventListener('unhandledrejection', onUnhandledRejection);
      window.removeEventListener('error', onWindowError);
      document.removeEventListener('click', onViewEditBooking, true);
    };
  }, [isBookingDetailRoute]);

  useEffect(() => {
    if (isBookingDetailRoute) return undefined;
    let frame = 0;
    const decorate = () => {
      frame = 0;
      const card = Array.from(document.querySelectorAll('.adv2-card')).find(node => node.querySelector('.adv2-card__header h2')?.textContent?.trim() === 'Customer Bookings');
      const table = card?.querySelector('.adv2-table');
      const body = table?.tBodies?.[0];
      const wrap = card?.querySelector('.adv2-table-wrap');
      if (!table || !body || !wrap) return;
      wrap.classList.add('adv2-bookings-scroll');
      const pageText = card.querySelector('.adv2-pagination .adv2-muted')?.textContent || '';
      const page = Number(pageText.match(/Page\s+(\d+)\s+of/i)?.[1] || 1);
      Array.from(body.rows).forEach((row, index) => { row.dataset.bookingSerial = String(((page - 1) * ADMIN_BOOKINGS_PAGE_SIZE) + index + 1); });
    };
    const schedule = () => { if (!frame) frame = window.requestAnimationFrame(decorate); };
    schedule();
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => { observer.disconnect(); if (frame) window.cancelAnimationFrame(frame); };
  }, [isBookingDetailRoute]);

  useEffect(() => {
    if (isBookingDetailRoute) return undefined;
    const updateHeader = () => document.querySelector('.adv2-header')?.classList.toggle('adv2-header--compact', window.scrollY > 36);
    updateHeader();
    window.addEventListener('scroll', updateHeader, { passive: true });
    window.addEventListener('resize', updateHeader, { passive: true });
    return () => { window.removeEventListener('scroll', updateHeader); window.removeEventListener('resize', updateHeader); };
  }, [isBookingDetailRoute]);

  return (
    <div className={isBookingDetailRoute ? 'admin-booking-detail-route' : undefined}>
      <GlobalFailure failure={globalFailure} onDismiss={() => setGlobalFailure(null)} />
      {isBookingDetailRoute ? (
        <>
          <AdminBookingAddressPanel />
          <AdminBookingWorkspace />
          <AdminBookingServiceRequestsPanel />
          <AdminBookingManagementPanel />
          <AdminSecurePaymentPanel />
        </>
      ) : (
        <>
          <AdminDashboardPageV2 />
          <AdminBookingOperationalBadges />
        </>
      )}
    </div>
  );
}
