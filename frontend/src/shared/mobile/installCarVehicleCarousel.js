const VEHICLE_GRID_SELECTOR = '.car-rentals-home-page .car-vehicle-grid';
const MOBILE_QUERY = '(max-width: 700px)';
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';
const AUTOPLAY_INTERVAL_MS = 3200;
const INTERACTION_PAUSE_MS = 7000;

function attachVehicleCarousel(grid) {
  if (!grid || grid.dataset.tfsVehicleCarousel === 'true') return;

  grid.dataset.tfsVehicleCarousel = 'true';
  grid.setAttribute('aria-roledescription', 'carousel');
  if (!grid.getAttribute('aria-label')) {
    grid.setAttribute('aria-label', 'Vehicle categories');
  }

  const mobileQuery = window.matchMedia(MOBILE_QUERY);
  const reducedMotionQuery = window.matchMedia(REDUCED_MOTION_QUERY);
  let pausedUntil = 0;
  let intervalId;

  const getCards = () => Array.from(grid.querySelectorAll('.car-vehicle-card'));

  const pauseAfterInteraction = () => {
    pausedUntil = Date.now() + INTERACTION_PAUSE_MS;
  };

  const getNearestCardIndex = (cards) => {
    let nearestIndex = 0;
    let nearestDistance = Number.POSITIVE_INFINITY;

    cards.forEach((card, index) => {
      const distance = Math.abs(card.offsetLeft - grid.scrollLeft);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = index;
      }
    });

    return nearestIndex;
  };

  const advance = () => {
    if (!grid.isConnected) {
      window.clearInterval(intervalId);
      return;
    }

    if (
      !mobileQuery.matches ||
      reducedMotionQuery.matches ||
      document.hidden ||
      Date.now() < pausedUntil
    ) {
      return;
    }

    const cards = getCards();
    if (cards.length < 2) return;

    const currentIndex = getNearestCardIndex(cards);
    const nextIndex = (currentIndex + 1) % cards.length;

    grid.scrollTo({
      left: cards[nextIndex].offsetLeft,
      behavior: 'smooth'
    });
  };

  ['pointerdown', 'touchstart', 'wheel'].forEach((eventName) => {
    grid.addEventListener(eventName, pauseAfterInteraction, { passive: true });
  });
  grid.addEventListener('focusin', pauseAfterInteraction);

  intervalId = window.setInterval(advance, AUTOPLAY_INTERVAL_MS);
}

export function installCarVehicleCarouselUX() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const attachExisting = () => {
    document.querySelectorAll(VEHICLE_GRID_SELECTOR).forEach(attachVehicleCarousel);
  };

  attachExisting();

  const observer = new MutationObserver(() => {
    attachExisting();
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  });
}
