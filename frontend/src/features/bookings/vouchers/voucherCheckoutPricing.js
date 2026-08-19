const money = (value) => {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export function getCheckoutBasePricing() {
  let flight = null;
  let returnFlight = null;
  let searchParams = {};

  try {
    flight = JSON.parse(sessionStorage.getItem('selectedFlight') || 'null');
    returnFlight = JSON.parse(sessionStorage.getItem('returnFlight') || 'null');
    searchParams = JSON.parse(sessionStorage.getItem('searchParams') || '{}');
  } catch {
    return null;
  }

  if (!flight) return null;

  const passengerCount = Math.max(
    1,
    Number.parseInt(searchParams.adults || 1, 10)
      + Number.parseInt(searchParams.children || 0, 10)
      + Number.parseInt(searchParams.infants || 0, 10),
  );
  const isMock = !!flight?.isMock || !!returnFlight?.isMock;

  const outFinal = money(flight?.price?.finalPrice ?? flight?.price?.total);
  const outOriginal = money(flight?.price?.originalApiPrice ?? outFinal);
  const outDiscount = isMock ? 0 : money(flight?.price?.discountAmount ?? (outOriginal - outFinal));

  const retFinal = returnFlight ? money(returnFlight?.price?.finalPrice ?? returnFlight?.price?.total) : 0;
  const retOriginal = returnFlight ? money(returnFlight?.price?.originalApiPrice ?? retFinal) : 0;
  const retDiscount = returnFlight && !isMock
    ? money(returnFlight?.price?.discountAmount ?? (retOriginal - retFinal))
    : 0;

  return {
    supplierPrice: Number(((outOriginal + retOriginal) * passengerCount).toFixed(2)),
    websiteDiscount: Number(((outDiscount + retDiscount) * passengerCount).toFixed(2)),
    priceBeforeVoucher: Number(((outFinal + retFinal) * passengerCount).toFixed(2)),
    passengerCount,
    isMock,
  };
}

export const formatUsd = (value) => `$${money(value).toLocaleString('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})}`;

export default getCheckoutBasePricing;
