import React, { useEffect } from 'react';
import './AdminUniversalNav.css';

const ADMIN_HOME = '/admin/backoffice';
const ADMIN_PATH = /^\/admin(?:\/|$)/;
const BRAND_SELECTORS = ['.adv2-brand', '.backoffice-brand'];

function decorateLegacyBrands() {
  const cleanups = [];

  BRAND_SELECTORS.forEach((selector) => {
    document.querySelectorAll(selector).forEach((element) => {
      if (element.closest('a[href="/admin/backoffice"]') || element.dataset.adminHomeBound === 'true') return;

      const goHome = () => window.location.assign(ADMIN_HOME);
      const onKeyDown = (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          goHome();
        }
      };

      element.dataset.adminHomeBound = 'true';
      element.classList.add('admin-home-brand-link');
      element.setAttribute('role', 'link');
      element.setAttribute('tabindex', '0');
      element.setAttribute('aria-label', 'Admin Home');
      element.addEventListener('click', goHome);
      element.addEventListener('keydown', onKeyDown);

      cleanups.push(() => {
        element.removeEventListener('click', goHome);
        element.removeEventListener('keydown', onKeyDown);
        delete element.dataset.adminHomeBound;
        element.classList.remove('admin-home-brand-link');
        element.removeAttribute('role');
        element.removeAttribute('tabindex');
        element.removeAttribute('aria-label');
      });
    });
  });

  return () => cleanups.forEach((cleanup) => cleanup());
}

export default function AdminUniversalNav() {
  const path = window.location.pathname;
  const isAdminPage = ADMIN_PATH.test(path);
  const isLoginPage = path === '/admin/login' || path === '/admin/login/';

  useEffect(() => {
    if (!isAdminPage || isLoginPage) return undefined;

    let cleanupBrands = decorateLegacyBrands();
    const observer = new MutationObserver(() => {
      cleanupBrands();
      cleanupBrands = decorateLegacyBrands();
    });

    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      cleanupBrands();
    };
  }, [isAdminPage, isLoginPage, path]);

  if (!isAdminPage || isLoginPage) return null;

  return (
    <nav className="admin-universal-nav" aria-label="Admin global navigation">
      <a className="admin-universal-nav__brand" href={ADMIN_HOME} aria-label="FareTransit Admin Home">
        <span className="admin-universal-nav__fare">Fare</span><span className="admin-universal-nav__transit">Transit</span><span className="admin-universal-nav__admin"> Admin</span>
      </a>
      <div className="admin-universal-nav__links">
        <a href={ADMIN_HOME}>⌂ Admin Home</a>
        <a href="/admin/dashboard">✈ Flight Dashboard</a>
        <a href="/">View Website ↗</a>
      </div>
    </nav>
  );
}
