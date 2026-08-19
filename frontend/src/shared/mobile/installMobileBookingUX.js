// Passenger accordion behavior is now owned by BookingPage React state.
// This installer intentionally performs no DOM injection/mutation. Keeping the
// exported hook preserves the existing app bootstrap contract while avoiding a
// second source of truth for passenger completion and collapse state.
export function installMobileBookingUX() {
  if (typeof window === 'undefined') return;
  window.__tfsMobileBookingUXInstalled = true;
}

export default installMobileBookingUX;
