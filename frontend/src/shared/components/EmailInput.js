import React, { useState } from 'react';
import './EmailInput.css';

/**
 * Shared EmailInput with inline validation.
 * – type="email" for native browser hints
 * – Trims spaces, rejects internal spaces
 * – Validates on blur (not while typing)
 * – Normalises domain to lowercase
 * – Exposes the cleaned value via onChange
 */
function EmailInput({
  id,
  value,
  onChange,
  label,
  placeholder = 'e.g. name@example.com',
  required = false,
  disabled = false,
}) {
  const [touched, setTouched] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  /* Reasonably permissive regex for real-world emails.
     Accepts:  dots, underscores, plus, hyphens in local part
               sub-domains (first.last@mail.example.co.uk)
               TLD of 2+ chars                                */
  const EMAIL_RE = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

  const validate = (raw) => {
    const trimmed = raw.trim();
    if (!trimmed && required) return 'Email address is required';
    if (!trimmed) return '';
    if (/\s/.test(trimmed)) return 'Email cannot contain spaces';
    if (!EMAIL_RE.test(trimmed)) return 'Enter a valid email address';
    return '';
  };

  const handleChange = (e) => {
    const raw = e.target.value;
    onChange(raw); // keep raw while typing
    // clear error once the user fixes it
    if (touched && errorMsg) {
      const err = validate(raw);
      if (!err) setErrorMsg('');
    }
  };

  const handleBlur = () => {
    setTouched(true);
    const trimmed = value.trim();
    // Normalize domain to lowercase
    const atIdx = trimmed.indexOf('@');
    let normalised = trimmed;
    if (atIdx !== -1) {
      normalised = trimmed.slice(0, atIdx) + trimmed.slice(atIdx).toLowerCase();
    }
    onChange(normalised); // push cleaned value back
    setErrorMsg(validate(normalised));
  };

  return (
    <div className="email-input-container">
      {label && <label className="email-input-label" htmlFor={id}>{label}</label>}
      <div className={`email-input-wrapper ${touched && errorMsg ? 'has-error' : ''}`}>
        <input
          id={id}
          type="email"
          className="email-input-field"
          value={value}
          onChange={handleChange}
          onBlur={handleBlur}
          placeholder={placeholder}
          required={required}
          disabled={disabled}
          autoComplete="email"
          aria-invalid={!!(touched && errorMsg)}
          aria-describedby={errorMsg ? `${id}-error` : undefined}
        />
        <i className="fas fa-envelope email-input-icon"></i>
      </div>
      {touched && errorMsg && (
        <span id={`${id}-error`} className="email-input-error" role="alert">
          {errorMsg}
        </span>
      )}
    </div>
  );
}

export default EmailInput;
