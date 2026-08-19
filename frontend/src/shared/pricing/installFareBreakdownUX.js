const moneyFromText = (text = '') => {
  const match = String(text).replace(/,/g, '').match(/-?\$?\s*([0-9]+(?:\.[0-9]+)?)/);
  return match ? Number(match[1]) : 0;
};

const formatMoney = (value) => {
  const amount = Number.isFinite(value) ? value : 0;
  return amount.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

function buildBreakdown(card) {
  const totalNode = card.querySelector('.booking-itinerary-pricing-summary__discounted');
  if (!totalNode) return;

  const total = moneyFromText(totalNode.textContent);
  if (!total) return;

  const originalNode = card.querySelector('.booking-itinerary-pricing-summary__original');
  const savingNode = card.querySelector('.booking-itinerary-pricing-summary__saving');
  const originalTotal = moneyFromText(originalNode?.textContent || '') || total;
  const savingTotal = moneyFromText(savingNode?.textContent || '') || Math.max(0, originalTotal - total);

  const travelerText = Array.from(card.querySelectorAll('p'))
    .map((node) => node.textContent || '')
    .find((text) => /\btravelers?\b/i.test(text)) || '';
  const travelerMatch = travelerText.match(/(\d+)\s+travelers?/i);
  const travelerCount = Math.max(1, Number(travelerMatch?.[1] || 1));

  const perTravelerFinal = total / travelerCount;
  const perTravelerOriginal = originalTotal / travelerCount;
  const perTravelerSaving = savingTotal / travelerCount;
  const hasDiscount = originalTotal > total && savingTotal > 0;
  const discountPercent = hasDiscount && originalTotal > 0
    ? Math.round((savingTotal / originalTotal) * 100)
    : 0;
  const signature = [total, originalTotal, savingTotal, travelerCount].join('|');

  let root = card.querySelector('.tfs-fare-breakdown-root');
  if (!root) {
    root = document.createElement('div');
    root.className = 'tfs-fare-breakdown-root';
    card.appendChild(root);
  }

  card.classList.add('tfs-fare-breakdown-ready');
  if (root.dataset.signature === signature) return;

  const wasOpen = root.querySelector('.tfs-fare-details')?.open || false;

  root.innerHTML = `
    <div class="tfs-fare-value-story">
      ${hasDiscount ? `
        <div class="tfs-fare-original-block">
          <span class="tfs-fare-kicker">Regular trip fare</span>
          <del class="tfs-fare-original-total">${formatMoney(originalTotal)}</del>
        </div>

        <div class="tfs-fare-savings-block">
          <span class="tfs-fare-savings-label">Your ${discountPercent}% member savings</span>
          <strong class="tfs-fare-savings-amount">
            <i class="fas fa-tag" aria-hidden="true"></i>
            ${formatMoney(savingTotal)}
          </strong>
        </div>
      ` : ''}

      <div class="tfs-fare-final-block ${hasDiscount ? '' : 'tfs-fare-final-block--solo'}">
        <span class="tfs-fare-kicker">Today's discounted fare</span>
        <strong class="tfs-fare-total">${formatMoney(total)} <small>USD</small></strong>
      </div>

      <details class="tfs-fare-details">
        <summary>
          <span>View fare breakdown</span>
          <i class="fas fa-chevron-down" aria-hidden="true"></i>
        </summary>
        <div class="tfs-fare-details-body">
          ${hasDiscount ? `
            <div class="tfs-fare-row tfs-fare-row--original">
              <span>Regular fare / traveler</span>
              <strong>${formatMoney(perTravelerOriginal)}</strong>
            </div>
            <div class="tfs-fare-row tfs-fare-row--saving">
              <span>${discountPercent}% member savings / traveler</span>
              <strong>−${formatMoney(perTravelerSaving)}</strong>
            </div>
          ` : ''}
          <div class="tfs-fare-row tfs-fare-row--final">
            <span>Discounted fare / traveler</span>
            <strong>${formatMoney(perTravelerFinal)}</strong>
          </div>
          <div class="tfs-fare-row">
            <span>Number of travelers</span>
            <strong>× ${travelerCount}</strong>
          </div>
          ${hasDiscount ? `
            <div class="tfs-fare-row tfs-fare-row--original-total">
              <span>Regular trip total</span>
              <strong>${formatMoney(originalTotal)}</strong>
            </div>
          ` : ''}
          <div class="tfs-fare-row tfs-fare-row--total">
            <span>Today's trip total</span>
            <strong>${formatMoney(total)} USD</strong>
          </div>
          ${hasDiscount ? `
            <div class="tfs-fare-savings-note">
              <i class="fas fa-check-circle" aria-hidden="true"></i>
              You save ${formatMoney(savingTotal)} with your ${discountPercent}% Final Seat member fare.
            </div>
          ` : ''}
        </div>
      </details>
    </div>

    <div class="tfs-fare-per-traveler">
      <span class="tfs-fare-per-label">Per traveler</span>
      ${hasDiscount ? `<del>${formatMoney(perTravelerOriginal)}</del><span class="tfs-fare-price-arrow">→</span>` : ''}
      <strong>${formatMoney(perTravelerFinal)}</strong>
      <span>× ${travelerCount} traveler${travelerCount === 1 ? '' : 's'}</span>
      <span class="tfs-fare-equals">= ${formatMoney(total)} total</span>
    </div>
  `;

  root.dataset.signature = signature;
  const details = root.querySelector('.tfs-fare-details');
  if (details) details.open = wasOpen;
}

function enhanceFareBreakdown() {
  document.querySelectorAll('.booking-itinerary-pricing-summary').forEach(buildBreakdown);
}

export function installFareBreakdownUX() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (window.__tfsFareBreakdownUXInstalled) return;
  window.__tfsFareBreakdownUXInstalled = true;

  let scheduled = false;
  const run = () => {
    if (scheduled) return;
    scheduled = true;
    window.requestAnimationFrame(() => {
      scheduled = false;
      enhanceFareBreakdown();
    });
  };

  run();

  const observer = new MutationObserver((mutations) => {
    const relevant = mutations.some((mutation) => {
      const target = mutation.target instanceof Element ? mutation.target : mutation.target?.parentElement;
      if (!target?.closest?.('.booking-page')) return false;
      if (target.closest('.tfs-fare-breakdown-root')) return false;
      return target.closest('.booking-itinerary-pricing-summary, .booking-itinerary-top-panel, .booking-page');
    });
    if (relevant) run();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
  });
}

export default installFareBreakdownUX;
