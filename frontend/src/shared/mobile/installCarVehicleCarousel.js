import './CarVehicleCarouselDots.css';

const VEHICLE_GRID_SELECTOR = '.car-rentals-home-page .car-vehicle-grid';
const MOBILE_QUERY = '(max-width: 700px)';
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';
const AUTOPLAY_INTERVAL_MS = 3200;
const INTERACTION_PAUSE_MS = 7000;
const EDGE_SWIPE_THRESHOLD_PX = 42;

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
  let scrollFrameId = 0;
  let edgeSwipeStartX = null;
  let edgeSwipeStartIndex = null;

  const getCards = () => Array.from(grid.querySelectorAll('.car-vehicle-card'));
  const initialCards = getCards();

  initialCards.forEach((card, index) => {
    const label = card.textContent.trim() || `Vehicle category ${index + 1}`;
    card.setAttribute('aria-roledescription', 'slide');
    card.setAttribute('aria-label', `${index + 1} of ${initialCards.length}: ${label}`);
  });

  const dots = document.createElement('div');
  dots.className = 'car-vehicle-carousel-dots';
  dots.setAttribute('role', 'group');
  dots.setAttribute('aria-label', 'Choose vehicle category slide');

  const dotButtons = initialCards.map((card, index) => {
    const label = card.textContent.trim() || `vehicle category ${index + 1}`;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'car-vehicle-carousel-dot';
    button.setAttribute('aria-label', `Show ${label}`);
    button.dataset.slideIndex = String(index);
    dots.appendChild(button);
    return button;
  });

  grid.insertAdjacentElement('afterend', dots);

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

  const setActiveDot = (index) => {
    dotButtons.forEach((button, buttonIndex) => {
      const active = buttonIndex === index;
      button.classList.toggle('is-active', active);
      if (active) {
        button.setAttribute('aria-current', 'true');
      } else {
        button.removeAttribute('aria-current');
      }
    });
  };

  const syncActiveDot = () => {
    const cards = getCards();
    if (!cards.length) return;
    setActiveDot(getNearestCardIndex(cards));
  };

  const scheduleDotSync = () => {
    if (scrollFrameId) return;
    scrollFrameId = window.requestAnimationFrame(() => {
      scrollFrameId = 0;
      syncActiveDot();
    });
  };

  const scrollToCard = (index, pause = false) => {
    const cards = getCards();
    const target = cards[index];
    if (!target) return;

    if (pause) pauseAfterInteraction();
    setActiveDot(index);
    grid.scrollTo({
      left: target.offsetLeft,
      behavior: reducedMotionQuery.matches ? 'auto' : 'smooth'
    });
  };

  dotButtons.forEach((button, index) => {
    button.addEventListener('click', () => scrollToCard(index, true));
  });

  const resetEdgeSwipe = () => {
    edgeSwipeStartX = null;
    edgeSwipeStartIndex = null;
  };

  const beginEdgeSwipe = (clientX) => {
    if (!mobileQuery.matches || typeof clientX !== 'number') return;

    const cards = getCards();
    if (cards.length < 2) return;

    edgeSwipeStartX = clientX;
    edgeSwipeStartIndex = getNearestCardIndex(cards);
    pauseAfterInteraction();
  };

  const completeEdgeSwipe = (clientX) => {
    if (
      !mobileQuery.matches ||
      typeof clientX !== 'number' ||
      edgeSwipeStartX === null ||
      edgeSwipeStartIndex === null
    ) {
      resetEdgeSwipe();
      return;
    }

    const deltaX = clientX - edgeSwipeStartX;
    const startIndex = edgeSwipeStartIndex;
    resetEdgeSwipe();

    if (Math.abs(deltaX) < EDGE_SWIPE_THRESHOLD_PX) return;

    const cards = getCards();
    if (cards.length < 2) return;

    // Native horizontal scrolling has a hard edge. When the gesture starts on
    // that edge and continues outward, wrap to the opposite end instead of
    // leaving the carousel stuck on the first/last card.
    if (startIndex === cards.length - 1 && deltaX < -EDGE_SWIPE_THRESHOLD_PX) {
      scrollToCard(0, true);
      return;
    }

    if (startIndex === 0 && deltaX > EDGE_SWIPE_THRESHOLD_PX) {
      scrollToCard(cards.length - 1, true);
    }
  };

  if ('PointerEvent' in window) {
    grid.addEventListener('pointerdown', (event) => {
      if (event.isPrimary === false) return;
      beginEdgeSwipe(event.clientX);
    }, { passive: true });
    grid.addEventListener('pointerup', (event) => {
      if (event.isPrimary === false) return;
      completeEdgeSwipe(event.clientX);
    }, { passive: true });
    grid.addEventListener('pointercancel', resetEdgeSwipe, { passive: true });
  } else {
    grid.addEventListener('touchstart', (event) => {
      beginEdgeSwipe(event.touches[0]?.clientX);
    }, { passive: true });
    grid.addEventListener('touchend', (event) => {
      completeEdgeSwipe(event.changedTouches[0]?.clientX);
    }, { passive: true });
    grid.addEventListener('touchcancel', resetEdgeSwipe, { passive: true });
  }

  const advance = () => {
    if (!grid.isConnected) {
      window.clearInterval(intervalId);
      if (scrollFrameId) window.cancelAnimationFrame(scrollFrameId);
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
    scrollToCard(nextIndex);
  };

  grid.addEventListener('wheel', pauseAfterInteraction, { passive: true });
  grid.addEventListener('focusin', pauseAfterInteraction);
  grid.addEventListener('scroll', scheduleDotSync, { passive: true });

  setActiveDot(0);
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
