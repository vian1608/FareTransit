from pathlib import Path


def read(path):
    return Path(path).read_text()


def write(path, value):
    Path(path).write_text(value)


def replace_once(source, search, replacement, label):
    if search not in source:
        raise RuntimeError(f"Patch anchor not found: {label}")
    return source.replace(search, replacement, 1)


# Fix the payment merchant selector so its suggestions stay inside the row flow
# (no native select popup overlapping the next split) and allow free-form merchant entry.
js_path = 'frontend/src/features/admin/components/AdminBookingManagementPanel.js'
js = read(js_path)

old_component = '''function PaymentMerchantSelect({ split, options, onSelect }) {
  const inferredType = normalizeMerchantType(split.merchantType, split.merchantName, split.merchantCode);
  const inferredCode = text(split.merchantCode || inferAirlineCodeFromName(split.merchantName)).trim().toUpperCase();
  let selected = options.find(option => option.key === merchantKey(inferredType, inferredCode, split.merchantName));
  if (!selected && split.merchantName) selected = options.find(option => option.name.toLowerCase() === text(split.merchantName).trim().toLowerCase());
  const currentValue = selected?.key || '';
  const airlines = options.filter(option => option.type === 'AIRLINE' && !option.stale);
  const staleAirlines = options.filter(option => option.type === 'AIRLINE' && option.stale);
  const fareTransit = options.find(option => option.type === 'FARETRANSIT');
  const others = options.filter(option => option.type === 'OTHER');

  return (
    <label className="abm-merchant-field">
      <span>Merchant</span>
      <select value={currentValue} onChange={event => onSelect(options.find(option => option.key === event.target.value) || null)}>
        <option value="">Select merchant…</option>
        {airlines.length > 0 && <optgroup label="Airlines in this itinerary">{airlines.map(option => <option key={option.key} value={option.key}>{option.name} ({option.code})</option>)}</optgroup>}
        {staleAirlines.length > 0 && <optgroup label="Saved airline — review">{staleAirlines.map(option => <option key={option.key} value={option.key}>{option.name}{option.code ? ` (${option.code})` : ''} — no longer in itinerary</option>)}</optgroup>}
        {fareTransit && <optgroup label="FareTransit"><option value={fareTransit.key}>{fareTransit.name}</option></optgroup>}
        {others.length > 0 && <optgroup label="Saved merchant">{others.map(option => <option key={option.key} value={option.key}>{option.name}</option>)}</optgroup>}
      </select>
      {selected?.type === 'AIRLINE' && <div className="abm-merchant-preview"><AirlineLogo carrierCode={selected.code} airlineName={selected.name} src={selected.logoUrl} size={24} /><span>{selected.name} <b>{selected.code}</b></span>{selected.stale && <em>Review</em>}</div>}
      {selected?.type === 'FARETRANSIT' && <div className="abm-merchant-preview"><span className="abm-ft-mark">FT</span><span>FareTransit LLC</span></div>}
    </label>
  );
}'''

new_component = '''function PaymentMerchantSelect({ split, options, onSelect, onManualChange }) {
  const [open, setOpen] = useState(false);
  const inferredType = normalizeMerchantType(split.merchantType, split.merchantName, split.merchantCode);
  const inferredCode = text(split.merchantCode || inferAirlineCodeFromName(split.merchantName)).trim().toUpperCase();
  let selected = options.find(option => option.key === merchantKey(inferredType, inferredCode, split.merchantName));
  if (!selected && split.merchantName) selected = options.find(option => option.name.toLowerCase() === text(split.merchantName).trim().toLowerCase());
  const airlines = options.filter(option => option.type === 'AIRLINE' && !option.stale);
  const staleAirlines = options.filter(option => option.type === 'AIRLINE' && option.stale);
  const fareTransit = options.find(option => option.type === 'FARETRANSIT');
  const others = options.filter(option => option.type === 'OTHER' && option.name.toLowerCase() !== text(split.merchantName).trim().toLowerCase());

  const choose = option => {
    onSelect(option);
    setOpen(false);
  };

  const renderOption = option => (
    <button className="abm-merchant-option" type="button" key={option.key} onClick={() => choose(option)}>
      <span className="abm-merchant-option__mark">
        {option.type === 'AIRLINE'
          ? <AirlineLogo carrierCode={option.code} airlineName={option.name} src={option.logoUrl} size={22} />
          : <span className="abm-ft-mark">FT</span>}
      </span>
      <span className="abm-merchant-option__copy"><strong>{option.name}</strong>{option.code && <small>{option.code}</small>}</span>
      {option.stale && <em>Review</em>}
    </button>
  );

  return (
    <div className="abm-merchant-field" onBlur={event => {
      if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
    }}>
      <span className="abm-field-label">Merchant</span>
      <div className="abm-merchant-combobox">
        <input
          value={split.merchantName || ''}
          placeholder="Select or type merchant"
          autoComplete="off"
          aria-label="Merchant name"
          aria-expanded={open}
          onFocus={() => setOpen(true)}
          onChange={event => {
            onManualChange(event.target.value);
            setOpen(true);
          }}
        />
        <button className="abm-merchant-toggle" type="button" aria-label="Show merchant suggestions" aria-expanded={open} onClick={() => setOpen(value => !value)}>⌄</button>
        {open && (
          <div className="abm-merchant-menu" role="listbox" aria-label="Merchant suggestions">
            {airlines.length > 0 && <><div className="abm-merchant-menu__heading">Airlines in this itinerary</div>{airlines.map(renderOption)}</>}
            {staleAirlines.length > 0 && <><div className="abm-merchant-menu__heading">Saved airline — review</div>{staleAirlines.map(renderOption)}</>}
            {fareTransit && <><div className="abm-merchant-menu__heading">FareTransit</div>{renderOption(fareTransit)}</>}
            {others.length > 0 && <><div className="abm-merchant-menu__heading">Saved merchants</div>{others.map(renderOption)}</>}
          </div>
        )}
      </div>
      <small className="abm-merchant-manual-hint">Choose a suggestion above or type any merchant name manually.</small>
      {selected?.type === 'AIRLINE' && <div className="abm-merchant-preview"><AirlineLogo carrierCode={selected.code} airlineName={selected.name} src={selected.logoUrl} size={24} /><span>{selected.name} <b>{selected.code}</b></span>{selected.stale && <em>Review</em>}</div>}
      {selected?.type === 'FARETRANSIT' && <div className="abm-merchant-preview"><span className="abm-ft-mark">FT</span><span>FareTransit LLC</span></div>}
    </div>
  );
}'''

js = replace_once(js, old_component, new_component, 'merchant selector component')

old_row = '''{paymentSplits.map((split, index) => <div className="abm-split-row" key={split._key || index}><PaymentMerchantSelect split={split} options={paymentMerchantOptions} onSelect={merchant => setPaymentSplits(current => current.map((item, idx) => idx === index ? { ...item, merchantName: merchant?.name || '', merchantType: merchant?.type || '', merchantCode: merchant?.code || '', logoUrl: merchant?.logoUrl || '', stale: Boolean(merchant?.stale) } : item))} /><label><span>Amount</span><input inputMode="decimal" value={split.amount} onChange={event => setPaymentSplits(current => current.map((item, idx) => idx === index ? { ...item, amount: event.target.value } : item))} /></label><button className="abm-button abm-button--danger" type="button" onClick={() => setPaymentSplits(current => current.filter((_, idx) => idx !== index))}>Remove</button></div>)}'''

new_row = '''{paymentSplits.map((split, index) => <div className="abm-split-row" key={split._key || index}><PaymentMerchantSelect split={split} options={paymentMerchantOptions} onSelect={merchant => setPaymentSplits(current => current.map((item, idx) => idx === index ? { ...item, merchantName: merchant?.name || '', merchantType: merchant?.type || '', merchantCode: merchant?.code || '', logoUrl: merchant?.logoUrl || '', stale: Boolean(merchant?.stale) } : item))} onManualChange={merchantName => setPaymentSplits(current => current.map((item, idx) => idx === index ? { ...item, merchantName, merchantType: merchantName.trim() ? 'OTHER' : '', merchantCode: '', logoUrl: '', stale: false } : item))} /><label><span>Amount</span><input inputMode="decimal" value={split.amount} onChange={event => setPaymentSplits(current => current.map((item, idx) => idx === index ? { ...item, amount: event.target.value } : item))} /></label><button className="abm-button abm-button--danger" type="button" onClick={() => setPaymentSplits(current => current.filter((_, idx) => idx !== index))}>Remove</button></div>)}'''

js = replace_once(js, old_row, new_row, 'payment split merchant row')
write(js_path, js)


css_path = 'frontend/src/features/admin/components/AdminBookingManagementPanel.css'
css = read(css_path)
css = replace_once(css, '''.abm-split-row {
  display: grid;
  grid-template-columns: minmax(0, 1.5fr) minmax(0, .8fr) auto;
  gap: 10px;
  align-items: end;
  margin-top: 12px;
  padding: 12px;
  background: #f8fafc;
  border: 1px solid #e5ebf2;
  border-radius: 10px;
}
''', '''.abm-split-row {
  display: grid;
  grid-template-columns: minmax(0, 1.5fr) minmax(0, .8fr) auto;
  gap: 10px;
  align-items: start;
  margin-top: 12px;
  padding: 12px;
  background: #f8fafc;
  border: 1px solid #e5ebf2;
  border-radius: 10px;
}

.abm-split-row > .abm-button--danger {
  margin-top: 22px;
}

.abm-merchant-field {
  min-width: 0;
}

.abm-field-label {
  display: block;
  margin-bottom: 5px;
  color: #64748b;
  font-size: 11px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: .04em;
}

.abm-merchant-combobox {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 42px;
  gap: 8px;
  align-items: start;
}

.abm-merchant-toggle {
  width: 42px;
  height: 42px;
  border: 1px solid #cbd8e6;
  border-radius: 9px;
  background: #fff;
  color: #173f6d;
  font-size: 18px;
  font-weight: 900;
  cursor: pointer;
}

.abm-merchant-toggle:focus,
.abm-merchant-toggle:hover {
  border-color: #a20f3d;
  box-shadow: 0 0 0 3px rgba(162, 15, 61, .09);
  outline: none;
}

.abm-merchant-menu {
  grid-column: 1 / -1;
  position: static;
  width: 100%;
  max-height: 280px;
  margin-top: 2px;
  overflow-y: auto;
  background: #fff;
  border: 1px solid #d7e1ec;
  border-radius: 10px;
  box-shadow: 0 10px 24px rgba(15, 39, 70, .10);
  padding: 6px;
  box-sizing: border-box;
}

.abm-merchant-menu__heading {
  padding: 8px 9px 5px;
  color: #7b8798;
  font-size: 10px;
  font-weight: 900;
  letter-spacing: .05em;
  text-transform: uppercase;
}

.abm-merchant-option {
  width: 100%;
  min-height: 42px;
  display: flex;
  gap: 9px;
  align-items: center;
  padding: 8px 9px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: #15253d;
  text-align: left;
  cursor: pointer;
}

.abm-merchant-option:hover,
.abm-merchant-option:focus {
  background: #f2f6fb;
  outline: none;
}

.abm-merchant-option__mark {
  width: 26px;
  min-width: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.abm-merchant-option__copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.abm-merchant-option__copy strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
}

.abm-merchant-option__copy small {
  color: #718096;
  font-size: 10px;
}

.abm-merchant-option em {
  margin-left: auto;
  color: #9a6200;
  font-size: 10px;
  font-style: normal;
  font-weight: 800;
}

.abm-merchant-manual-hint {
  display: block;
  margin-top: 5px;
  color: #718096;
  font-size: 11px;
}
''', 'payment split row and merchant combobox styles')

css = css.replace('''  .abm-footer .abm-button,
  .abm-toolbar .abm-button {
    width: 100%;
  }
}''', '''  .abm-footer .abm-button,
  .abm-toolbar .abm-button {
    width: 100%;
  }

  .abm-split-row > .abm-button--danger {
    width: 100%;
    margin-top: 0;
  }
}''')
write(css_path, css)

print('Merchant combobox/manual-entry patch applied.')
