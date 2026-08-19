import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminAPI } from '../../../shared/api/api';
import { normalizeError } from '../../../shared/utils/normalizeError';
import './AdminLoginPage.css';

function AdminLogin() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (loading) return;
    setLoading(true);
    setError('');

    try {
      const response = await adminAPI.login(formData);
      if (response?.success === true && response?.token) {
        const profile = response.admin || { email: formData.email };
        localStorage.setItem('token', response.token);
        sessionStorage.setItem('adminSession', JSON.stringify(profile));
        // Preserve the existing owner's dashboard exactly. Staff use the new
        // permission-aware shell so they never land on owner-only dashboard APIs.
        const isStaffProfile = profile?.role && !['owner', 'admin'].includes(profile.role);
        navigate(isStaffProfile ? '/admin/backoffice' : '/admin/dashboard');
        return;
      }
      setError(normalizeError({ message: response?.error?.message || response?.message }, 'Invalid admin credentials.'));
    } catch (err) {
      setError(normalizeError(err, 'Admin login failed. Please retry.'));
    } finally {
      setLoading(false);
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
            <button type="submit" className="btn-primary" disabled={loading}>{loading ? <><i className="fas fa-spinner fa-spin" /> Signing in...</> : 'Sign In'}</button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default AdminLogin;
