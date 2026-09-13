import React, { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import api from '../../../shared/api/api';
import './AdminBookingOperationalBadges.css';

const roots = new Map();

function BadgeGroup({ flags = {} }) {
  if (!flags.hasSpecialAssistance && !flags.flexAssistSelected) return null;
  return (
    <span className="aob-badges" aria-label="Booking service indicators">
      {flags.hasSpecialAssistance && (
        <span className={`aob-badge aob-badge--assistance${flags.wheelchairRequired ? ' aob-badge--wheelchair' : ''}`}>
          <i className={flags.wheelchairRequired ? 'fas fa-wheelchair' : 'fas fa-universal-access'} aria-hidden="true" />
          Special Assistance
        </span>
      )}
      {flags.flexAssistSelected && (
        <span className="aob-badge aob-badge--flex">
          <i className="fas fa-shield-alt" aria-hidden="true" />
          Flex Assist
        </span>
      )}
    </span>
  );
}

function findBookingRows() {
  return Array.from(document.querySelectorAll('.adv2-table tbody tr')).filter(row => row.querySelector('.adv2-ref'));
}

function referenceForRow(row) {
  return row.querySelector('.adv2-ref')?.textContent?.trim() || '';
}

function mountBadge(row, flags) {
  const customerCell = row.cells?.[2];
  if (!customerCell) return;
  let host = customerCell.querySelector('.aob-host');
  if (!host) {
    host = document.createElement('div');
    host.className = 'aob-host';
    customerCell.appendChild(host);
  }
  let root = roots.get(host);
  if (!root) {
    root = createRoot(host);
    roots.set(host, root);
  }
  root.render(<BadgeGroup flags={flags} />);
}

function ensureMultiServiceLauncher() {
  if (document.querySelector('[data-multiservice-operations]')) return;
  const dashboard = document.querySelector('.adv2-dashboard') || document.querySelector('.adv2-container') || document.querySelector('.admin-dashboard-v2');
  const firstCard = document.querySelector('.adv2-card');
  const parent = firstCard?.parentElement || dashboard;
  if (!parent) return;

  const host = document.createElement('section');
  host.dataset.multiserviceOperations = 'true';
  host.setAttribute('aria-label', 'Multi-service reservations');
  host.style.cssText = 'margin:0 0 18px;padding:18px 20px;border:1px solid #cbd5e1;border-radius:14px;background:linear-gradient(135deg,#f8fbff,#eef5ff);box-shadow:0 8px 24px rgba(15,45,82,.06)';
  host.innerHTML = `
    <div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap">
      <div style="min-width:240px;flex:1">
        <div style="font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#2563eb">FareTransit Operations</div>
        <div style="font-size:20px;font-weight:850;color:#102d54;margin-top:2px">Multi-Service Reservations</div>
        <div style="font-size:13px;color:#64748b;margin-top:3px">Manage flights, manual car-rental authorizations, and future hotel reservations from one workspace.</div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <a href="/admin-car-reservations.html" style="text-decoration:none;background:#1466d9;color:#fff;font-weight:800;padding:10px 14px;border-radius:9px">Reservations & Authorizations</a>
        <a href="/admin/bookings/new" style="text-decoration:none;background:#fff;color:#173b68;border:1px solid #cbd5e1;font-weight:800;padding:10px 14px;border-radius:9px">+ Flight Booking</a>
        <a href="/admin-car-reservations.html#create-car" style="text-decoration:none;background:#fff;color:#173b68;border:1px solid #cbd5e1;font-weight:800;padding:10px 14px;border-radius:9px">+ Car Rental</a>
        <span title="Hotel reservation management will be added later" style="background:#f8fafc;color:#94a3b8;border:1px dashed #cbd5e1;font-weight:800;padding:10px 14px;border-radius:9px">Hotel — Coming Soon</span>
      </div>
    </div>`;
  if (firstCard && firstCard.parentElement === parent) parent.insertBefore(host, firstCard);
  else parent.prepend(host);
}

export default function AdminBookingOperationalBadges() {
  useEffect(() => {
    let stopped = false;
    let running = false;
    let timer = null;
    let lastSignature = '';

    const refresh = async () => {
      if (stopped || running) return;
      ensureMultiServiceLauncher();
      const rows = findBookingRows();
      const references = [...new Set(rows.map(referenceForRow).filter(Boolean))];
      if (!references.length) return;
      const signature = references.join('|');
      if (signature === lastSignature && rows.every(row => row.querySelector('.aob-host'))) return;

      running = true;
      try {
        const response = await api.post('/admin/bookings/operational-flags', { references }, { timeout: 15000 });
        if (stopped) return;
        const flags = response.data?.data?.flags || response.data?.flags || {};
        rows.forEach(row => {
          const reference = referenceForRow(row);
          mountBadge(row, flags[reference] || {});
        });
        lastSignature = signature;
      } catch {
        // The booking list itself remains fully usable if operational badges fail.
      } finally {
        running = false;
      }
    };

    const schedule = () => {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(refresh, 120);
    };

    schedule();
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });

    return () => {
      stopped = true;
      observer.disconnect();
      if (timer) window.clearTimeout(timer);
      roots.forEach((root, host) => {
        if (!document.body.contains(host)) {
          try { root.unmount(); } catch { /* best effort */ }
          roots.delete(host);
        }
      });
    };
  }, []);

  return null;
}
