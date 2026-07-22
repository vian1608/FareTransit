import React, { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

function PageTransition({ children }) {
  const location = useLocation();
  const isRail = location.pathname.startsWith('/amtrak');

  useEffect(() => {
    document.body.classList.remove('theme-flights', 'theme-rail', 'page-transitioning');
    document.body.classList.add(isRail ? 'theme-rail' : 'theme-flights');
    document.body.classList.add('page-transitioning');

    const timer = setTimeout(() => {
      document.body.classList.remove('page-transitioning');
    }, 550);

    return () => clearTimeout(timer);
  }, [location.pathname, isRail]);

  return (
    <div
      key={location.pathname}
      className={`page-transition page-transition--${isRail ? 'rail' : 'flights'}`}
    >
      {children}
    </div>
  );
}

export default PageTransition;
