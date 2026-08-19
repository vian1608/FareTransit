import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { authAPI } from '../../../shared/api/api';
import { normalizeError } from '../../../shared/utils/normalizeError';
import '../../../shared/styles/Auth.css';

function SignIn() {
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
      const response = await authAPI.login(formData);
      if (response?.success && response?.token && response?.user) {
        localStorage.setItem('token', response.token);
        localStorage.setItem('user', JSON.stringify(response.user));
        navigate('/');
        return;
      }
      setError(normalizeError({ message: response?.error?.message || response?.message }, 'Sign in failed. Check your email and password and try again.'));
    } catch (err) {
      setError(normalizeError(err, 'Sign in failed. Check your email and password and try again.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <Helmet><title>Sign In | FareTransit</title></Helmet>
      <div className="auth-container">
        <div className="auth-card">
          <div className="auth-header">
            <div className="auth-icon"><i className="fas fa-user-circle" /></div>
            <h2>Welcome Back</h2>
            <p>Sign in to continue your travel planning with FareTransit LLC.</p>
          </div>

          <form onSubmit={handleSubmit} className="auth-form">
            {error && <div className="error-message" role="alert">{error}</div>}
            <div className="auth-input-group">
              <label htmlFor="signin-email">Email Address</label>
              <input id="signin-email" type="email" placeholder="you@example.com" autoComplete="email" value={formData.email} onChange={(event) => setFormData({ ...formData, email: event.target.value })} required />
            </div>
            <div className="auth-input-group">
              <label htmlFor="signin-password">Password</label>
              <input id="signin-password" type="password" placeholder="Enter your password" autoComplete="current-password" value={formData.password} onChange={(event) => setFormData({ ...formData, password: event.target.value })} required />
            </div>
            <button type="submit" className="auth-submit-btn" disabled={loading}>
              {loading ? <><i className="fas fa-circle-notch fa-spin" /> Signing in...</> : 'Sign In'}
            </button>
          </form>

          <div className="auth-footer"><p>Don’t have an account? <Link to="/signup">Sign up</Link></p></div>
        </div>
      </div>
    </div>
  );
}

export default SignIn;
