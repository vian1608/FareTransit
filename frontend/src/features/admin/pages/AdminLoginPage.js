import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminAPI } from '../../../shared/api/api';
import { normalizeError } from '../../../shared/utils/normalizeError';
import './AdminLoginPage.css';

function persistSession(response, fallbackEmail = '') {
  const profile = response.admin || { email: fallbackEmail };
  localStorage.setItem('token', response.token);
  sessionStorage.setItem('adminSession', JSON.stringify(profile));
  return profile;
}

function AdminLogin() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (loading || demoLoading) return;
    setLoading(true);
    setError('');

    try {
      const response = await adminAPI.login(formData);
      if (response?.success === true && response?.token) {
        const profile = persistSession(response, formData.email);

        // BackOfficeRouter is selected by frontend/src/index.js only during a
        // fresh page bootstrap. Staff therefore need a hard handoff instead of
        // an in-App React navigation, while the legacy owner stays in App.js.
        const isStaffProfile = profile?.legacyOwner !== true;
        if (isStaffProfile) {
          window.location.assign('/admin/backoffice');
        } else {
          navigate('/admin/dashboard');
        }
        return;
      }
      setError(normalizeError({ message: response?.error?.message || response?.message }, 'Invalid admin credentials.'));
    } catch (err) {
      setError(normalizeError(err, 'Admin login failed. Please retry.'));
    } finally {
      setLoading(false);
    }
  };

  const handleDemoLogin = async () => {
    if (loading || demoLoading) return;
    setDemoLoading(true);
    setError('');
    try {
      const response = await fetch('/api/admin/demo-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.success !== true || !payload?.token) {
        throw new Error(payload?.error?.message || 'Merchant demo is temporarily unavailable.');
      }
      persistSession(payload, 'merchant-test@faretransit.com');
      window.location.assign('/admin/bookings/flights');
    } catch (err) {
      setError(normalizeError(err, 'Merchant demo could not be opened. Please retry.'));
    } finally {
      setDemoLoading(false);
    }
  };

  return (
    <div className="admin-login-page">
      <div className="admin-container">
        <div className="admin-card">
          <div className="admin-header">
            <i className="fas fa-shield-alt" />
            <h1>Admin Panel</h1>
            <p>FareTransit Management System</p>
          </div>
          <form onSubmit={handleSubmit}>
            {error && <div className="error-message" role="alert">{error}</div>}
            <div className="form-group"><input type="email" placeholder="Admin Email" autoComplete="username" value={formData.email} onChange={(event) => setFormData({ ...formData, email: event.target.value })} required /></div>
            <div className="form-group"><input type="password" placeholder="Password" autoComplete="current-password" value={formData.password} onChange={(event) => setFormData({ ...formData, password: event.target.value })} required /></div>
            <button type="submit" className="btn-primary" disabled={loading || demoLoading}>{loading ? <><i className="fas fa-spinner fa-spin" /> Signing in...</> : 'Sign In'}</button>
          </form>

          <div className="admin-demo-divider"><span>or</span></div>
          <button type="button" className="btn-demo" onClick={handleDemoLogin} disabled={loading || demoLoading}>
            {demoLoading ? <><i className="fas fa-spinner fa-spin" /> Opening demo...</> : 'Open Merchant Test Demo'}
          </button>
          <p className="admin-demo-help">
            No password required. Read-only access is limited to the staged <strong>DEMO-FT</strong> sample bookings.
          </p>
        </div>
      </div>
    </div>
  );
}

export default AdminLogin;
