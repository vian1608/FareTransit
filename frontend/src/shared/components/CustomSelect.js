import React, { useState, useEffect, useRef } from 'react';
import './CustomSelect.css';

function CustomSelect({ id, value, onChange, options, icon, className = '', placeholder = 'Select option' }) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef(null);

  const selectedOption = options.find(opt => opt.value === value);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Handle keyboard navigation
  const handleKeyDown = (e) => {
    if (!isOpen) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        setIsOpen(true);
        // Set active index to currently selected or 0
        const currentIndex = options.findIndex(opt => opt.value === value);
        setActiveIndex(currentIndex >= 0 ? currentIndex : 0);
      }
      return;
    }

    switch (e.key) {
      case 'Escape':
        e.preventDefault();
        setIsOpen(false);
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        if (activeIndex >= 0 && activeIndex < options.length) {
          onChange(options[activeIndex].value);
        }
        setIsOpen(false);
        break;
      case 'ArrowDown':
        e.preventDefault();
        setActiveIndex(prev => (prev + 1) % options.length);
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActiveIndex(prev => (prev - 1 + options.length) % options.length);
        break;
      case 'Tab':
        setIsOpen(false);
        break;
      default:
        break;
    }
  };

  const handleSelectOption = (optVal) => {
    onChange(optVal);
    setIsOpen(false);
  };

  return (
    <div 
      className={`custom-select-container ${isOpen ? 'is-open' : ''} ${className}`}
      ref={containerRef}
      onKeyDown={handleKeyDown}
    >
      <button
        type="button"
        id={id}
        className="custom-select-trigger"
        onClick={() => setIsOpen(!isOpen)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={`${id}-listbox`}
      >
        <span className="custom-select-trigger-left">
          {icon && <i className={`${icon} custom-select-icon`}></i>}
          <span className="custom-select-value">{selectedOption ? selectedOption.label : placeholder}</span>
        </span>
        <i className={`fas fa-chevron-${isOpen ? 'up' : 'down'} custom-select-arrow`}></i>
      </button>

      {isOpen && (
        <ul 
          id={`${id}-listbox`}
          className="custom-select-dropdown"
          role="listbox"
          aria-activedescendant={activeIndex >= 0 ? `${id}-opt-${activeIndex}` : undefined}
          tabIndex={-1}
        >
          {options.map((option, index) => {
            const isSelected = option.value === value;
            const isActive = index === activeIndex;
            return (
              <li
                key={option.value}
                id={`${id}-opt-${index}`}
                role="option"
                aria-selected={isSelected}
                className={`custom-select-option ${isSelected ? 'selected' : ''} ${isActive ? 'active' : ''}`}
                onClick={() => handleSelectOption(option.value)}
                onMouseEnter={() => setActiveIndex(index)}
              >
                {option.label}
                {isSelected && <i className="fas fa-check check-icon"></i>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default CustomSelect;
