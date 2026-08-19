import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import './AdminVoucherShortcut.css';

export default function AdminVoucherShortcut() {
  const [toolbar, setToolbar] = useState(null);

  useEffect(() => {
    const target = document.querySelector('.adv2-toolbar');
    if (target) {
      setToolbar(target);
      return undefined;
    }

    const observer = new MutationObserver(() => {
      const nextTarget = document.querySelector('.adv2-toolbar');
      if (nextTarget) {
        setToolbar(nextTarget);
        observer.disconnect();
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  if (!toolbar) return null;

  return createPortal(
    <Link
      to="/admin/vouchers"
      className="admin-voucher-shortcut"
      aria-label="Open voucher and coupon management"
      title="Manage vouchers and coupons"
    >
      <i className="fas fa-ticket-alt" aria-hidden="true" />
      <span>Vouchers</span>
    </Link>,
    toolbar
  );
}
