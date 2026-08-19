import React, { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import FlightSearchProgressOverlay from './FlightSearchProgressOverlay';
import CustomerRouteLoadingOverlay from './CustomerRouteLoadingOverlay';
import CustomerBackButton from './CustomerBackButton';
import '../styles/CustomerMotionEnhancements.css';
import '../styles/BookingFlowOverrides.css';

function PageTransition({ children }) {
  const location = useLocation();
  const pathname = location.pathname || '/';
  const isAdmin = pathname.startsWith('/admin');
  const isCars = pathname.startsWith('/car-rentals');
  const isRail = pathname.startsWith('/amtrak') || pathname.startsWith('/train-');
  const theme = isAdmin ? 'admin' : (isCars ? 'cars' : (isRail ? 'rail' : 'flights'));

  // These routes already expose a more meaningful local navigation action.
  // Showing the generic global Back button as well creates duplicate controls.
  const hasContextualBack =
    pathname.startsWith('/return-flight') ||
    pathname.startsWith('/booking-confirmed') ||
    pathname.startsWith('/confirmation/');

  useEffect(() => {
    document.body.classList.remove('theme-flights', 'theme-rail', 'theme-admin', 'theme-cars');
    document.body.classList.add(`theme-${theme}`);
  }, [theme]);

  return (
    <div className={`page-transition page-transition--${theme}`}>
      {!isAdmin && <FlightSearchProgressOverlay />}
      {!isAdmin && pathname !== '/search' && <CustomerRouteLoadingOverlay />}
      {!isAdmin && !hasContextualBack && <CustomerBackButton />}
      <div className="tfs-route-stage" key={location.key || `${pathname}${location.search}`}>
        {children}
      </div>
    </div>
  );
}

export default PageTransition;
