import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import './TravelDatePicker.css';

function getPortalTarget() {
  return document.getElementById('datepicker-portal-root') || document.body;
}

function TravelDatePicker({ id, value, onChange, label, placeholder = 'MM/DD/YYYY', minDate, required = false, disabled = false, theme = '' }) {
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [inputError, setInputError] = useState('');
  const [pickerView, setPickerView] = useState('days'); // days | months | years

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const useIsoInput = String(placeholder || '').toUpperCase().includes('YYYY-MM-DD');
  const initialDate = value ? new Date(value + 'T00:00:00') : today;
  const [calMonth, setCalMonth] = useState(initialDate.getMonth());
  const [calYear, setCalYear] = useState(initialDate.getFullYear());
  const [yearPageStart, setYearPageStart] = useState(Math.floor(initialDate.getFullYear() / 12) * 12);

  const containerRef = useRef(null);
  const popupRef = useRef(null);
  const inputRef = useRef(null);
  const [popupStyle, setPopupStyle] = useState({});

  const themeClass = theme ? ` traveldate-container--${theme}` : '';
  const popoverThemeClass = theme ? ` traveldate-popover--${theme}` : '';

  const formatForInput = useCallback((y, m, d) => {
    const yy = String(y);
    const mm = String(m).padStart(2, '0');
    const dd = String(d).padStart(2, '0');
    return useIsoInput ? `${yy}-${mm}-${dd}` : `${mm}/${dd}/${yy}`;
  }, [useIsoInput]);

  const getMinDateObj = useCallback(() => {
    if (minDate) return new Date(minDate + 'T00:00:00');
    return today;
  // today is intentionally stable for the lifetime of a mounted picker.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minDate]);

  useEffect(() => {
    if (value) {
      const parts = value.split('-');
      if (parts.length === 3) {
        const [y, m, d] = parts;
        const year = parseInt(y, 10);
        const month = parseInt(m, 10);
        setInputValue(formatForInput(year, month, parseInt(d, 10)));
        setCalMonth(month - 1);
        setCalYear(year);
        setYearPageStart(Math.floor(year / 12) * 12);
        setInputError('');
      } else {
        setInputValue(String(value));
      }
    } else {
      setInputValue('');
    }
  }, [value, formatForInput]);

  const updatePosition = useCallback(() => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const popupHeight = 390;

    let top = rect.bottom + 6;
    if (spaceBelow < popupHeight && spaceAbove > spaceBelow) {
      top = Math.max(10, rect.top - popupHeight - 6);
    }

    let left = rect.left;
    // A calendar should remain a compact control even when the associated date
    // field spans half of a wide desktop form. Matching the input width made
    // the calendar grow into a huge overlay on the car-rental page.
    let width = Math.min(Math.max(rect.width, 320), 360);

    if (window.innerWidth < 480) {
      left = Math.max(10, (window.innerWidth - 320) / 2);
      width = Math.min(340, window.innerWidth - 20);
    } else if (left + width > window.innerWidth - 10) {
      left = Math.max(10, window.innerWidth - width - 10);
    }

    setPopupStyle({
      position: 'fixed',
      top: `${top}px`,
      left: `${left}px`,
      width: `${width}px`,
      zIndex: 10030,
      pointerEvents: 'auto'
    });
  }, []);

  const handleOpen = () => {
    if (disabled) return;
    updatePosition();
    setPickerView('days');
    setYearPageStart(Math.floor(calYear / 12) * 12);
    setIsOpen(true);
  };

  useEffect(() => {
    if (!isOpen) return;
    updatePosition();

    const handleScrollOrResize = () => updatePosition();
    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);

    return () => {
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
    };
  }, [isOpen, updatePosition, pickerView]);

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

  const parseManualInput = (raw) => {
    const parts = useIsoInput ? raw.split('-') : raw.split('/');
    if (parts.length !== 3) return null;

    const y = useIsoInput ? parseInt(parts[0], 10) : parseInt(parts[2], 10);
    const m = useIsoInput ? parseInt(parts[1], 10) : parseInt(parts[0], 10);
    const d = useIsoInput ? parseInt(parts[2], 10) : parseInt(parts[1], 10);

    if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return null;
    if (y < getMinDateObj().getFullYear() || m < 1 || m > 12 || d < 1 || d > 31) return null;

    const testDate = new Date(y, m - 1, d);
    if (testDate.getFullYear() !== y || testDate.getMonth() !== m - 1 || testDate.getDate() !== d) return null;
    if (testDate < getMinDateObj()) return null;

    return { y, m, d, date: testDate };
  };

  const handleInputChange = (e) => {
    const allowedPattern = useIsoInput ? /[^0-9-]/g : /[^0-9/]/g;
    let val = e.target.value.replace(allowedPattern, '');
    if (val.length > 10) val = val.slice(0, 10);

    setInputValue(val);
    setInputError('');

    if (!val) {
      onChange('');
      return;
    }

    if (val.length === 10) {
      const parsed = parseManualInput(val);
      if (parsed) {
        const formatted = `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
        onChange(formatted);
        setCalMonth(parsed.m - 1);
        setCalYear(parsed.y);
        setYearPageStart(Math.floor(parsed.y / 12) * 12);
      }
    }
  };

  const handleInputBlur = () => {
    if (!inputValue) {
      setInputError('');
      return;
    }

    const parsed = parseManualInput(inputValue);
    if (!parsed) {
      setInputError(`Enter a valid date in ${useIsoInput ? 'YYYY-MM-DD' : 'MM/DD/YYYY'} format.`);
    } else {
      setInputError('');
    }
  };

  const handleSelectDay = (day) => {
    const formatted = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    onChange(formatted);
    setInputValue(formatForInput(calYear, calMonth + 1, day));
    setInputError('');
    setIsOpen(false);
    setPickerView('days');
  };

  const isDayDisabled = (day) => {
    const d = new Date(calYear, calMonth, day);
    return d < getMinDateObj();
  };

  const minDateObj = getMinDateObj();
  const minYear = minDateObj.getFullYear();
  const minMonth = minDateObj.getMonth();

  const goPrevious = () => {
    if (pickerView === 'years') {
      setYearPageStart((start) => Math.max(Math.floor(minYear / 12) * 12, start - 12));
      return;
    }
    if (pickerView === 'months') {
      if (calYear > minYear) setCalYear((year) => year - 1);
      return;
    }
    setCalMonth((month) => month === 0 ? (setCalYear((year) => year - 1), 11) : month - 1);
  };

  const goNext = () => {
    if (pickerView === 'years') {
      setYearPageStart((start) => start + 12);
      return;
    }
    if (pickerView === 'months') {
      setCalYear((year) => year + 1);
      return;
    }
    setCalMonth((month) => month === 11 ? (setCalYear((year) => year + 1), 0) : month + 1);
  };

  const previousDisabled = pickerView === 'years'
    ? yearPageStart <= Math.floor(minYear / 12) * 12
    : pickerView === 'months'
      ? calYear <= minYear
      : calYear === minYear && calMonth <= minMonth;

  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const startDayIndex = new Date(calYear, calMonth, 1).getDay();
  const daysArray = Array.from({ length: startDayIndex }, () => null).concat(
    Array.from({ length: daysInMonth }, (_, i) => i + 1)
  );

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  const years = Array.from({ length: 12 }, (_, index) => yearPageStart + index);

  const renderPickerBody = () => {
    if (pickerView === 'months') {
      return (
        <div className="traveldate-month-grid" role="grid" aria-label={`Choose month in ${calYear}`}>
          {monthNames.map((monthName, index) => {
            const disabledMonth = calYear === minYear && index < minMonth;
            return (
              <button
                key={monthName}
                type="button"
                className={`traveldate-choice ${index === calMonth ? 'selected' : ''}`}
                disabled={disabledMonth}
                onClick={() => {
                  setCalMonth(index);
                  setPickerView('days');
                }}
              >
                {monthName.slice(0, 3)}
              </button>
            );
          })}
        </div>
      );
    }

    if (pickerView === 'years') {
      return (
        <div className="traveldate-year-grid" role="grid" aria-label="Choose year">
          {years.map((year) => (
            <button
              key={year}
              type="button"
              className={`traveldate-choice ${year === calYear ? 'selected' : ''}`}
              disabled={year < minYear}
              onClick={() => {
                setCalYear(year);
                if (year === minYear && calMonth < minMonth) setCalMonth(minMonth);
                setPickerView('months');
              }}
            >
              {year}
            </button>
          ))}
        </div>
      );
    }

    return (
      <>
        <div className="traveldate-weekdays">
          {['Su','Mo','Tu','We','Th','Fr','Sa'].map((w) => <span key={w}>{w}</span>)}
        </div>
        <div className="traveldate-days">
          {daysArray.map((day, idx) => {
            if (!day) return <div key={idx} className="traveldate-day empty" />;
            const disabledState = isDayDisabled(day);
            const isSelected = value === `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const isToday = !disabledState && calYear === today.getFullYear() && calMonth === today.getMonth() && day === today.getDate();

            return (
              <button
                key={idx}
                type="button"
                className={`traveldate-day ${isSelected ? 'selected' : ''} ${isToday && !isSelected ? 'today' : ''}`}
                disabled={disabledState}
                onClick={() => handleSelectDay(day)}
              >
                {day}
              </button>
            );
          })}
        </div>
      </>
    );
  };

  return (
    <div className={`traveldate-container${themeClass}`} ref={containerRef}>
      {label && <label className="traveldate-label" htmlFor={id}>{label}</label>}
      <div className="traveldate-input-wrapper">
        <input
          ref={inputRef}
          type="text"
          inputMode={useIsoInput ? 'text' : 'numeric'}
          id={id}
          value={inputValue}
          onChange={handleInputChange}
          onBlur={handleInputBlur}
          placeholder={placeholder}
          required={required}
          disabled={disabled}
          className={`traveldate-input ${inputError ? 'traveldate-input--error' : ''}`}
          onFocus={handleOpen}
          autoComplete="off"
          aria-invalid={Boolean(inputError)}
          aria-describedby={inputError ? `${id || 'traveldate'}-error` : undefined}
        />
        <button type="button" className="traveldate-icon-btn" onClick={handleOpen} disabled={disabled} tabIndex={-1}>
          <i className="far fa-calendar-alt"></i>
        </button>
      </div>
      {inputError && <div id={`${id || 'traveldate'}-error`} className="traveldate-input-error" role="alert">{inputError}</div>}

      {isOpen && createPortal(
        <div className={`traveldate-popover${popoverThemeClass}`} ref={popupRef} style={popupStyle}>
          <div className="traveldate-header">
            <button type="button" onClick={goPrevious} disabled={previousDisabled} aria-label="Previous">&lt;</button>
            <div className="traveldate-title-controls">
              {pickerView === 'years' ? (
                <button type="button" className="traveldate-period-button" onClick={() => setPickerView('days')}>
                  {yearPageStart}–{yearPageStart + 11}
                </button>
              ) : (
                <>
                  <button type="button" className="traveldate-period-button" onClick={() => setPickerView('months')} aria-label="Choose month">
                    {monthNames[calMonth]}
                  </button>
                  <button type="button" className="traveldate-period-button" onClick={() => { setYearPageStart(Math.floor(calYear / 12) * 12); setPickerView('years'); }} aria-label="Choose year">
                    {calYear}
                  </button>
                </>
              )}
            </div>
            <button type="button" onClick={goNext} aria-label="Next">&gt;</button>
          </div>
          {renderPickerBody()}
        </div>,
        getPortalTarget()
      )}
    </div>
  );
}

export default TravelDatePicker;
