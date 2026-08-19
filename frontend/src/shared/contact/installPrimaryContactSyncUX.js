const BOOKING_ROOT = '.booking-page';
const TOGGLE_ID = 'contactSame';

function setNativeInputValue(input, value) {
  if (!input) return;
  const nextValue = String(value || '');
  if (input.value === nextValue) return;

  const descriptor = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
  if (descriptor?.set) {
    descriptor.set.call(input, nextValue);
  } else {
    input.value = nextValue;
  }

  // React controlled inputs update their state from these bubbling events.
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

function getPassengerOneName(page) {
  const passengerOne = page?.querySelector('.passenger-card-block');
  if (!passengerOne) return { firstName: '', lastName: '' };

  return {
    firstName: passengerOne.querySelector('input[placeholder^="First Name"]')?.value || '',
    lastName: passengerOne.querySelector('input[placeholder^="Last Name"]')?.value || ''
  };
}

function getPrimaryContactFields(page) {
  if (!page) return { firstName: null, lastName: null };

  const firstName = Array.from(page.querySelectorAll('input[placeholder="First Name"]'))
    .find((input) => !input.closest('.passenger-card-block')) || null;
  const lastName = Array.from(page.querySelectorAll('input[placeholder="Last Name"]'))
    .find((input) => !input.closest('.passenger-card-block')) || null;

  return { firstName, lastName };
}

function syncPassengerOneToPrimaryContact() {
  const page = document.querySelector(BOOKING_ROOT);
  const toggle = page?.querySelector(`#${TOGGLE_ID}`);
  if (!page || !toggle?.checked) return;

  const passenger = getPassengerOneName(page);
  const contact = getPrimaryContactFields(page);

  setNativeInputValue(contact.firstName, passenger.firstName);
  setNativeInputValue(contact.lastName, passenger.lastName);

  // Clear stale browser validity bubbles after the values are populated.
  contact.firstName?.setCustomValidity?.('');
  contact.lastName?.setCustomValidity?.('');
}

function isPassengerOneNameField(target) {
  const firstCard = document.querySelector(`${BOOKING_ROOT} .passenger-card-block`);
  if (!firstCard || !target || !firstCard.contains(target)) return false;
  return target.matches?.('input[placeholder^="First Name"], input[placeholder^="Last Name"]');
}

export function installPrimaryContactSyncUX() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (window.__tfsPrimaryContactSyncInstalled) return;
  window.__tfsPrimaryContactSyncInstalled = true;

  document.addEventListener('change', (event) => {
    const target = event.target;

    if (target?.id === TOGGLE_ID) {
      if (target.checked) {
        // Let the existing React checkbox handler finish, then copy immediately.
        window.setTimeout(syncPassengerOneToPrimaryContact, 0);
        window.setTimeout(syncPassengerOneToPrimaryContact, 80);
      }
      return;
    }

    if (isPassengerOneNameField(target)) {
      window.setTimeout(syncPassengerOneToPrimaryContact, 0);
    }
  });

  document.addEventListener('input', (event) => {
    if (isPassengerOneNameField(event.target)) {
      window.setTimeout(syncPassengerOneToPrimaryContact, 0);
    }
  });
}

export default installPrimaryContactSyncUX;
