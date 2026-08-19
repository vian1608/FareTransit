import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminVoucherAPI } from '../../../shared/api/voucherApi';
import './AdminVouchersPage.css';

const emptyForm = () => ({
  code: '',
  discountValue: '50',
  minimumBookingAmount: '150',
  minimumPayablePercent: '60',
  maxRedemptions: '1',
  maxRedemptionsPerCustomer: '1',
  assignedEmail: '',
  validFrom: '',
  validUntil: '',
  notes: '',
  active: true,
});

const usd = (value) => `$${Number(value || 0).toLocaleString('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})}`;

const toLocalDateTime = (value) => {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  const local = new Date(parsed.getTime() - (parsed.getTimezoneOffset() * 60000));
  return local.toISOString().slice(0, 16);
};

function makeCode(amount) {
  const token = Math.random().toString(36).slice(2, 7).toUpperCase();
  const rounded = Math.max(1, Math.round(Number(amount || 0)));
  return `TFS-${rounded}-${token}`;
}

function statusOf(voucher) {
  if (!voucher.active) return 'Disabled';
  if (voucher.valid_until && new Date(voucher.valid_until) < new Date()) return 'Expired';
  if ((voucher.usage?.used || 0) >= Number(voucher.max_redemptions || 1)) return 'Exhausted';
  return 'Active';
}

export default function AdminVouchersPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [vouchers, setVouchers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [selectedVoucher, setSelectedVoucher] = useState(null);
  const [redemptions, setRedemptions] = useState([]);
  const [redemptionsLoading, setRedemptionsLoading] = useState(false);

  const example = useMemo(() => {
    const supplier = 1000;
    const websitePrice = 900;
    const voucher = Math.max(0, Number(form.discountValue || 0));
    const floor = supplier * Math.max(60, Number(form.minimumPayablePercent || 60)) / 100;
    const applied = Math.max(0, Math.min(voucher, websitePrice - floor));
    return { supplier, websitePrice, voucher, floor, applied, final: websitePrice - applied };
  }, [form.discountValue, form.minimumPayablePercent]);

  const loadVouchers = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await adminVoucherAPI.list();
      setVouchers(response?.data || []);
    } catch (requestError) {
      setError(requestError?.userMessage || requestError?.response?.data?.error?.message || 'Unable to load vouchers.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!localStorage.getItem('token')) {
      navigate('/admin/login', { replace: true });
      return;
    }
    loadVouchers();
  }, [navigate]);

  const updateForm = (field, value) => setForm((current) => ({ ...current, [field]: value }));

  const resetEditor = () => {
    setEditingId(null);
    setForm(emptyForm());
  };

  const editVoucher = (voucher) => {
    setEditingId(voucher.id);
    setForm({
      code: voucher.code || '',
      discountValue: String(voucher.discount_value ?? 50),
      minimumBookingAmount: String(voucher.minimum_booking_amount ?? 150),
      minimumPayablePercent: String(voucher.minimum_payable_percent ?? 60),
      maxRedemptions: String(voucher.max_redemptions ?? 1),
      maxRedemptionsPerCustomer: String(voucher.max_redemptions_per_customer ?? 1),
      assignedEmail: voucher.assigned_email || '',
      validFrom: toLocalDateTime(voucher.valid_from),
      validUntil: toLocalDateTime(voucher.valid_until),
      notes: voucher.notes || '',
      active: voucher.active !== false,
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setNotice(`Editing ${voucher.code}. Voucher codes stay fixed; rules and amount can be updated.`);
  };

  const saveVoucher = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const payload = {
        discountValue: Number(form.discountValue),
        minimumBookingAmount: Math.max(150, Number(form.minimumBookingAmount || 150)),
        minimumPayablePercent: Math.max(60, Number(form.minimumPayablePercent || 60)),
        maxRedemptions: Math.max(1, Number(form.maxRedemptions || 1)),
        maxRedemptionsPerCustomer: Math.max(1, Number(form.maxRedemptionsPerCustomer || 1)),
        assignedEmail: form.assignedEmail.trim() || null,
        validFrom: form.validFrom ? new Date(form.validFrom).toISOString() : null,
        validUntil: form.validUntil ? new Date(form.validUntil).toISOString() : null,
        notes: form.notes,
        active: form.active,
      };

      if (editingId) {
        await adminVoucherAPI.update(editingId, payload);
        setNotice(`Voucher ${form.code} updated successfully.`);
      } else {
        const response = await adminVoucherAPI.create({
          ...payload,
          code: form.code.trim().toUpperCase() || undefined,
        });
        setNotice(`Voucher ${response?.data?.code || ''} created successfully.`);
      }

      resetEditor();
      await loadVouchers();
    } catch (requestError) {
      setError(requestError?.userMessage || requestError?.response?.data?.error?.message || 'Unable to save voucher.');
    } finally {
      setSaving(false);
    }
  };

  const toggleVoucher = async (voucher) => {
    setError('');
    try {
      await adminVoucherAPI.update(voucher.id, { active: !voucher.active });
      setNotice(`${voucher.code} ${voucher.active ? 'disabled' : 'enabled'}.`);
      await loadVouchers();
    } catch (requestError) {
      setError(requestError?.userMessage || requestError?.response?.data?.error?.message || 'Unable to update voucher.');
    }
  };

  const copyCode = async (code) => {
    try {
      await navigator.clipboard.writeText(code);
      setNotice(`${code} copied.`);
    } catch {
      setNotice(`Voucher code: ${code}`);
    }
  };

  const openRedemptions = async (voucher) => {
    setSelectedVoucher(voucher);
    setRedemptionsLoading(true);
    setRedemptions([]);
    try {
      const response = await adminVoucherAPI.redemptions(voucher.id);
      setRedemptions(response?.data || []);
    } catch (requestError) {
      setError(requestError?.userMessage || requestError?.response?.data?.error?.message || 'Unable to load voucher history.');
    } finally {
      setRedemptionsLoading(false);
    }
  };

  return (
    <div className="admin-vouchers-page">
      <header className="admin-vouchers-header">
        <div>
          <button type="button" className="admin-vouchers-back" onClick={() => navigate('/admin/dashboard')}>
            ← Dashboard
          </button>
          <p className="admin-vouchers-eyebrow">Revenue controls</p>
          <h1>Vouchers & Coupons</h1>
          <p>Create passenger vouchers while automatically protecting your minimum collection amount.</p>
        </div>
        <div className="admin-vouchers-guardrail">
          <span>Global protection</span>
          <strong>Minimum $150 booking</strong>
          <strong>Customer pays at least 60%</strong>
        </div>
      </header>

      {(error || notice) && (
        <div className={`admin-vouchers-alert ${error ? 'admin-vouchers-alert--error' : 'admin-vouchers-alert--success'}`} role="alert">
          {error || notice}
        </div>
      )}

      <div className="admin-vouchers-grid">
        <section className="admin-voucher-card">
          <div className="admin-voucher-card__heading">
            <div>
              <p className="admin-vouchers-eyebrow">{editingId ? 'Edit voucher' : 'New voucher'}</p>
              <h2>{editingId ? `Edit ${form.code}` : 'Create Voucher'}</h2>
            </div>
            <div className="admin-voucher-actions">
              {!editingId && (
                <button type="button" className="admin-code-generator" onClick={() => updateForm('code', makeCode(form.discountValue))}>
                  Generate code
                </button>
              )}
              {editingId && <button type="button" className="admin-code-generator" onClick={resetEditor}>Cancel edit</button>}
            </div>
          </div>

          <form onSubmit={saveVoucher} className="admin-voucher-form">
            <label>
              Voucher code
              <input
                value={form.code}
                onChange={(e) => updateForm('code', e.target.value.toUpperCase())}
                placeholder="Auto-generated if blank"
                disabled={Boolean(editingId)}
              />
              {editingId && <small>Codes are kept fixed after creation so old passenger messages remain valid.</small>}
            </label>
            <label>
              Voucher amount (USD)
              <input type="number" min="1" step="0.01" required value={form.discountValue} onChange={(e) => updateForm('discountValue', e.target.value)} />
            </label>
            <label>
              Minimum booking amount
              <input type="number" min="150" step="1" value={form.minimumBookingAmount} onChange={(e) => updateForm('minimumBookingAmount', e.target.value)} />
              <small>Cannot be lower than $150.</small>
            </label>
            <label>
              Minimum customer payment
              <div className="admin-percent-input">
                <input type="number" min="60" max="100" step="1" value={form.minimumPayablePercent} onChange={(e) => updateForm('minimumPayablePercent', e.target.value)} />
                <span>%</span>
              </div>
              <small>Cannot be lower than 60% of supplier ticket value.</small>
            </label>
            <label>
              Maximum total uses
              <input type="number" min="1" step="1" value={form.maxRedemptions} onChange={(e) => updateForm('maxRedemptions', e.target.value)} />
            </label>
            <label>
              Uses per passenger email
              <input type="number" min="1" step="1" value={form.maxRedemptionsPerCustomer} onChange={(e) => updateForm('maxRedemptionsPerCustomer', e.target.value)} />
            </label>
            <label>
              Restrict to passenger email (optional)
              <input type="email" value={form.assignedEmail} onChange={(e) => updateForm('assignedEmail', e.target.value)} placeholder="passenger@example.com" />
            </label>
            <label>
              Status
              <select value={form.active ? 'active' : 'disabled'} onChange={(e) => updateForm('active', e.target.value === 'active')}>
                <option value="active">Active</option>
                <option value="disabled">Disabled</option>
              </select>
            </label>
            <label>
              Valid from (optional)
              <input type="datetime-local" value={form.validFrom} onChange={(e) => updateForm('validFrom', e.target.value)} />
            </label>
            <label>
              Expires on (optional)
              <input type="datetime-local" value={form.validUntil} onChange={(e) => updateForm('validUntil', e.target.value)} />
            </label>
            <label className="admin-voucher-form__full">
              Internal note
              <textarea rows="3" value={form.notes} onChange={(e) => updateForm('notes', e.target.value)} placeholder="Example: Service recovery voucher for passenger" />
            </label>

            <div className="admin-voucher-example admin-voucher-form__full">
              <strong>Easy example: how this voucher works on a $1,000 ticket</strong>
              <div><span>Supplier ticket value</span><b>{usd(example.supplier)}</b></div>
              <div><span>After normal website discount</span><b>{usd(example.websitePrice)}</b></div>
              <div><span>Voucher requested</span><b>−{usd(example.voucher)}</b></div>
              <div><span>{form.minimumPayablePercent || 60}% minimum-payment floor</span><b>{usd(example.floor)}</b></div>
              {example.applied < example.voucher && (
                <p>The system automatically caps this voucher at <strong>{usd(example.applied)}</strong>. That prevents the passenger payment from falling below {form.minimumPayablePercent || 60}% of the ticket value.</p>
              )}
              <div className="admin-voucher-example__final"><span>Passenger pays</span><b>{usd(example.final)}</b></div>
            </div>

            <button type="submit" className="admin-voucher-create" disabled={saving}>
              {saving ? 'Saving…' : (editingId ? 'Save Voucher Changes' : 'Create Voucher')}
            </button>
          </form>
        </section>

        <section className="admin-voucher-card admin-voucher-card--list">
          <div className="admin-voucher-card__heading">
            <div>
              <p className="admin-vouchers-eyebrow">Issued vouchers</p>
              <h2>Manage Vouchers</h2>
            </div>
            <button type="button" className="admin-code-generator" onClick={loadVouchers}>Refresh</button>
          </div>

          {loading ? (
            <div className="admin-voucher-empty">Loading vouchers…</div>
          ) : vouchers.length === 0 ? (
            <div className="admin-voucher-empty">No vouchers created yet.</div>
          ) : (
            <div className="admin-voucher-table-wrap">
              <table className="admin-voucher-table">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Value</th>
                    <th>Status</th>
                    <th>Usage</th>
                    <th>Rules</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {vouchers.map((voucher) => (
                    <tr key={voucher.id}>
                      <td>
                        <button type="button" className="admin-voucher-code" onClick={() => copyCode(voucher.code)} title="Copy voucher code">
                          {voucher.code}
                        </button>
                        {voucher.assigned_email && <small>{voucher.assigned_email}</small>}
                      </td>
                      <td><strong>{usd(voucher.discount_value)}</strong></td>
                      <td><span className={`admin-voucher-status admin-voucher-status--${statusOf(voucher).toLowerCase()}`}>{statusOf(voucher)}</span></td>
                      <td>{voucher.usage?.used || 0} / {voucher.max_redemptions}</td>
                      <td>
                        <small>Min {usd(voucher.minimum_booking_amount)}</small>
                        <small>Pay ≥ {voucher.minimum_payable_percent}%</small>
                      </td>
                      <td>
                        <div className="admin-voucher-actions">
                          <button type="button" onClick={() => editVoucher(voucher)}>Edit</button>
                          <button type="button" onClick={() => openRedemptions(voucher)}>History</button>
                          <button type="button" onClick={() => toggleVoucher(voucher)}>{voucher.active ? 'Disable' : 'Enable'}</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {selectedVoucher && (
        <section className="admin-voucher-history">
          <div className="admin-voucher-card__heading">
            <div>
              <p className="admin-vouchers-eyebrow">Redemption history</p>
              <h2>{selectedVoucher.code}</h2>
            </div>
            <button type="button" className="admin-code-generator" onClick={() => setSelectedVoucher(null)}>Close</button>
          </div>
          {redemptionsLoading ? <p>Loading history…</p> : redemptions.length === 0 ? <p>No redemptions yet.</p> : (
            <div className="admin-voucher-table-wrap">
              <table className="admin-voucher-table">
                <thead><tr><th>Booking</th><th>Passenger</th><th>Before</th><th>Voucher</th><th>Final</th><th>Status</th></tr></thead>
                <tbody>
                  {redemptions.map((row) => (
                    <tr key={row.id}>
                      <td>{row.confirmation_code || row.booking_id || '—'}</td>
                      <td>{row.customer_email || '—'}</td>
                      <td>{usd(row.price_before_voucher)}</td>
                      <td>−{usd(row.discount_amount)}</td>
                      <td><strong>{usd(row.final_amount)}</strong></td>
                      <td>{row.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
