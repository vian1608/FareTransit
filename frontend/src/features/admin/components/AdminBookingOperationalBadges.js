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

export default function AdminBookingOperationalBadges() {
  useEffect(() => {
    let stopped = false;
    let running = false;
    let timer = null;
    let lastSignature = '';

    const refresh = async () => {
      if (stopped || running) return;
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
