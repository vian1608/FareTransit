import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { authAPI } from '../../../shared/api/api';
import { normalizeError } from '../../../shared/utils/normalizeError';
import '../../../shared/styles/Auth.css';

function SignUp() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({ firstName: '', lastName: '', email: '', password: '', phone: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (loading) return;
    setLoading(true);
    setError('');

    try {
      const response = await authAPI.register(formData);
      if (response?.success && response?.token && response?.user) {
        localStorage.setItem('token', response.token);
        localStorage.setItem('user', JSON.stringify(response.user));
        navigate('/');
        return;
      }
      setError(normalizeError({ message: response?.error?.message || response?.message }, 'Registration failed. Please review your details and try again.'));
    } catch (err) {
      setError(normalizeError(err, 'Registration failed. Please review your details and try again.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <Helmet><title>Create Account | FareTransit</title></Helmet>
      <div className="auth-container">
        <div className="auth-card">
          <div className="auth-header">
            <div className="auth-icon"><i className="fas fa-user-plus" /></div>
            <h2>Create Account</h2>
            <p>Create your profile to manage quotes and travel updates faster.</p>
          </div>

          <form onSubmit={handleSubmit} className="auth-form">
            {error && <div className="error-message" role="alert">{error}</div>}
            <div className="auth-grid">
              <div className="auth-input-group">
                <label htmlFor="signup-first-name">First Name</label>
                <input id="signup-first-name" type="text" autoComplete="given-name" placeholder="First name" value={formData.firstName} onChange={(event) => setFormData({ ...formData, firstName: event.target.value })} required />
              </div>
              <div className="auth-input-group">
                <label htmlFor="signup-last-name">Last Name</label>
                <input id="signup-last-name" type="text" autoComplete="family-name" placeholder="Last name" value={formData.lastName} onChange={(event) => setFormData({ ...formData, lastName: event.target.value })} required />
              </div>
            </div>
            <div className="auth-input-group">
              <label htmlFor="signup-email">Email Address</label>
              <input id="signup-email" type="email" autoComplete="email" placeholder="you@example.com" value={formData.email} onChange={(event) => setFormData({ ...formData, email: event.target.value })} required />
            </div>
            <div className="auth-input-group">
              <label htmlFor="signup-phone">Phone Number</label>
              <input id="signup-phone" type="tel" autoComplete="tel" placeholder="+1 555 123 4567" value={formData.phone} onChange={(event) => setFormData({ ...formData, phone: event.target.value })} required />
            </div>
            <div className="auth-input-group">
              <label htmlFor="signup-password">Password</label>
              <input id="signup-password" type="password" autoComplete="new-password" minLength={8} placeholder="Create a secure password" value={formData.password} onChange={(event) => setFormData({ ...formData, password: event.target.value })} required />
            </div>
            <p className="sms-disclaimer" style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: '1rem', lineHeight: '1.4' }}>
              By providing a telephone number and submitting this form you are consenting to be contacted by SMS text message. Message &amp; data rates may apply. You can reply STOP to opt-out of further messaging.
            </p>
            <button type="submit" className="auth-submit-btn" disabled={loading}>
              {loading ? <><i className="fas fa-circle-notch fa-spin" /> Creating account...</> : 'Sign Up'}
            </button>
          </form>

          <div className="auth-footer"><p>Already have an account? <Link to="/signin">Sign In</Link></p></div>
        </div>
      </div>
    </div>
  );
}

export default SignUp;
