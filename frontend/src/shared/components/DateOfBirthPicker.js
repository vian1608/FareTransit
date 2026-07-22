import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import './DateOfBirthPicker.css';

function DateOfBirthPicker({ id, value, onChange, label, placeholder = 'MM/DD/YYYY', required = false, disabled = false }) {
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState('');
  
  const today = new Date();
  const [calMonth, setCalMonth] = useState(today.getMonth());
  const [calYear, setCalYear] = useState(today.getFullYear());
  
  const [viewMode, setViewMode] = useState('days'); // 'days', 'months', 'years'
  const [yearPage, setYearPage] = useState(Math.floor(today.getFullYear() / 20) * 20);

  const containerRef = useRef(null);
  const popupRef = useRef(null);
  const inputRef = useRef(null);
  const [popupStyle, setPopupStyle] = useState({});

  useEffect(() => {
    if (value) {
      const [y, m, d] = value.split('-');
      if (y && m && d) {
        setInputValue(`${m}/${d}/${y}`);
        setCalMonth(parseInt(m, 10) - 1);
        setCalYear(parseInt(y, 10));
      }
    }
  }, [value]);

  const handleOpen = () => {
    if (disabled) return;
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      const popupHeight = 350; // approx
      
      let top = rect.bottom + window.scrollY + 5;
      if (spaceBelow < popupHeight && spaceAbove > spaceBelow) {
        top = rect.top + window.scrollY - popupHeight - 5;
      }
      
      let left = rect.left + window.scrollX;
      let width = Math.max(rect.width, 320);
      if (window.innerWidth < 480) {
        left = Math.max(10, (window.innerWidth - 300) / 2);
        width = window.innerWidth - 20;
      } else if (left + width > window.innerWidth) {
        left = Math.max(10, window.innerWidth - width - 10);
      }
      
      setPopupStyle({
        position: 'absolute',
        top: `${top}px`,
        left: `${left}px`,
        width: `${width}px`,
        zIndex: 9999
      });
    }
    setViewMode('days');
    setIsOpen(true);
  };

  useEffect(() => {
    function handleClickOutside(e) {
      if (
        containerRef.current && !containerRef.current.contains(e.target) &&
        popupRef.current && !popupRef.current.contains(e.target)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleInputChange = (e) => {
    let val = e.target.value.replace(/[^0-9/]/g, '');
    if (val.length > 10) val = val.slice(0, 10);
    setInputValue(val);

    const parts = val.split('/');
    if (val.length >= 8 && parts.length === 3) {
      const m = parseInt(parts[0], 10);
      const d = parseInt(parts[1], 10);
      const y = parseInt(parts[2], 10);

      if (m >= 1 && m <= 12 && d >= 1 && d <= 31 && y >= 1900 && y <= today.getFullYear()) {
        const testDate = new Date(y, m - 1, d);
        if (testDate.getFullYear() === y && testDate.getMonth() === m - 1 && testDate.getDate() === d) {
          if (testDate <= today) {
            const formatted = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            onChange(formatted);
            setCalMonth(m - 1);
            setCalYear(y);
            return;
          }
        }
      }
    }
    onChange(''); // invalid or incomplete
  };

  const handleSelectDay = (day) => {
    const formatted = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    onChange(formatted);
    setInputValue(`${String(calMonth + 1).padStart(2, '0')}/${String(day).padStart(2, '0')}/${calYear}`);
    setIsOpen(false);
  };

  const isDayDisabled = (day) => {
    const d = new Date(calYear, calMonth, day);
    return d > today;
  };

  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const startDayIndex = new Date(calYear, calMonth, 1).getDay();

  const daysArray = Array.from({ length: startDayIndex }, () => null).concat(
    Array.from({ length: daysInMonth }, (_, i) => i + 1)
  );

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const renderDays = () => (
    <>
      <div className="dob-header">
        <button type="button" onClick={() => setCalMonth(p => p === 0 ? (setCalYear(y => y - 1), 11) : p - 1)}>&lt;</button>
        <div className="dob-header-selectors">
          <span onClick={() => setViewMode('months')} role="button" tabIndex={0}>{monthNames[calMonth]}</span>
          <span onClick={() => { setViewMode('years'); setYearPage(Math.floor(calYear / 20) * 20); }} role="button" tabIndex={0}>{calYear}</span>
        </div>
        <button type="button" disabled={calYear === today.getFullYear() && calMonth === today.getMonth()} onClick={() => setCalMonth(p => p === 11 ? (setCalYear(y => y + 1), 0) : p + 1)}>&gt;</button>
      </div>
      <div className="dob-weekdays">
        {['Su','Mo','Tu','We','Th','Fr','Sa'].map(w => <span key={w}>{w}</span>)}
      </div>
      <div className="dob-days">
        {daysArray.map((day, idx) => {
          if (!day) return <div key={idx} className="dob-day empty" />;
          const disabledState = isDayDisabled(day);
          const isSelected = value === `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          return (
            <button
              key={idx} type="button" className={`dob-day ${isSelected ? 'selected' : ''}`}
              disabled={disabledState} onClick={() => handleSelectDay(day)}
            >{day}</button>
          );
        })}
      </div>
    </>
  );

  const renderMonths = () => (
    <div className="dob-grid-view">
      <div className="dob-header">
        <span style={{flex: 1, textAlign: 'center', fontWeight: 'bold'}}>Select Month</span>
      </div>
      <div className="dob-grid dob-grid-months">
        {monthNames.map((m, idx) => (
          <button 
            key={m} type="button" 
            disabled={calYear === today.getFullYear() && idx > today.getMonth()}
            onClick={() => { setCalMonth(idx); setViewMode('days'); }}
          >{m.substring(0, 3)}</button>
        ))}
      </div>
    </div>
  );

  const renderYears = () => {
    const years = Array.from({ length: 20 }, (_, i) => yearPage + i);
    return (
      <div className="dob-grid-view">
        <div className="dob-header">
          <button type="button" onClick={() => setYearPage(p => p - 20)}>&lt;</button>
          <span style={{flex: 1, textAlign: 'center', fontWeight: 'bold'}}>{yearPage} - {yearPage + 19}</span>
          <button type="button" disabled={yearPage + 19 >= today.getFullYear()} onClick={() => setYearPage(p => p + 20)}>&gt;</button>
        </div>
        <div className="dob-grid dob-grid-years">
          {years.map(y => (
            <button 
              key={y} type="button" 
              disabled={y > today.getFullYear()}
              onClick={() => { setCalYear(y); setViewMode('days'); }}
            >{y}</button>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="dob-container" ref={containerRef}>
      {label && <label className="dob-label" htmlFor={id}>{label}</label>}
      <div className="dob-input-wrapper">
        <input 
          ref={inputRef}
          type="text"
          id={id}
          value={inputValue}
          onChange={handleInputChange}
          placeholder={placeholder}
          required={required}
          disabled={disabled}
          className="dob-input"
          onFocus={handleOpen}
          autoComplete="off"
        />
        <button type="button" className="dob-icon-btn" onClick={handleOpen} disabled={disabled} tabIndex={-1}>
          <i className="far fa-calendar-alt"></i>
        </button>
      </div>

      {isOpen && createPortal(
        <div className="dob-popover" ref={popupRef} style={popupStyle}>
          {viewMode === 'days' && renderDays()}
          {viewMode === 'months' && renderMonths()}
          {viewMode === 'years' && renderYears()}
        </div>,
        document.body
      )}
    </div>
  );
}

export default DateOfBirthPicker;
