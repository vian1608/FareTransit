/**
 * Per-airline FAQs: baggage, change, and cancellation policies only.
 * Shared across /book, /changes, and /cancellation routes.
 * No third-party airline website links.
 */

const advisory =
  'Call our desk above for live concierge booking, routing assistance, and urgent itinerary support.';

/** @type {Record<string, { baggage: string; change: string; cancel: string; credits?: string }>} */
const airlinePolicies = {
  delta: {
    baggage:
      'Most Main Cabin fares include one personal item and one carry-on. First checked bag is typically about $35 on domestic routes; additional bags cost more. Mint and Delta One include higher checked allowances. Weight limits usually apply per bag.',
    change:
      'Classic and Extra fares on U.S., Canada, Puerto Rico, and U.S. Virgin Islands itineraries generally have no change fee—you pay only the fare difference if the new flight costs more. Delta Basic may have change fees by route. All changes must be completed before departure.',
    cancel:
      'Non-refundable tickets usually receive an eCredit minus any cancellation fee, not cash. Refundable and Extra fares may refund to original payment. Cancel before departure; no-shows on restricted fares often forfeit remaining value.',
    credits:
      'Within 24 hours of purchase on eligible direct bookings, you may cancel for a full refund when travel is at least seven days out (where required). Airline schedule changes or cancellations may qualify for a refund instead of credit.',
  },
  united: {
    baggage:
      'Personal item is included on all fares. Full-size carry-on is included on standard Economy and above; Basic Economy on many routes is personal-item only unless upgraded. Checked bag fees vary by route and loyalty status.',
    change:
      'Change fees are waived on most standard Economy and premium cabins for domestic and short-haul international tickets. Basic Economy is usually not changeable until upgraded to a standard fare. Fare difference applies when the new flight costs more.',
    cancel:
      'Refundable fares may return to your card. Non-refundable tickets typically become future flight credit. Cancel before departure to preserve value; no-shows may lose ticket value on restricted fares.',
    credits:
      'Many bookings allow cancellation within 24 hours for a full refund when purchased at least seven days before departure. Significant schedule changes by the airline may open refund options.',
  },
  'american-airlines': {
    baggage:
      'One carry-on and one personal item on most Main Cabin tickets. First checked bag fees vary by route and AAdvantage tier. Oversize, overweight, and special items have separate charges.',
    change:
      'Change fees are waived on most domestic and short-haul international Main Cabin and premium tickets (excluding Basic Economy). Basic Economy generally cannot be changed. Pay any fare difference for a higher-priced replacement flight.',
    cancel:
      'Refundable fares may refund to original payment. Non-refundable tickets usually become trip credit. Cancel before departure; unused restricted tickets after no-show may have no value.',
    credits:
      'A 24-hour refund window may apply on eligible bookings made several days before travel. American-initiated schedule disruptions can trigger rebooking or refund rights depending on your ticket.',
  },
  southwest: {
    baggage:
      'Two checked bags fly free (size and weight limits apply). One carry-on and one personal item are included. This policy differs from most U.S. carriers that charge for checked luggage.',
    change:
      'No change fees. If the new itinerary costs more, you pay the difference; if it costs less, you may receive travel funds or a partial refund depending on fare type. Changes should be made before departure.',
    cancel:
      'No cancellation fee on most fares—value is returned as travel funds or refund per fare rules. Cancel before departure to keep funds active. Travel funds can expire; check your confirmation for the expiration date.',
    credits:
      'Direct bookings often allow a full refund within 24 hours of purchase on eligible fares. Funds must be used before their stated expiration.',
  },
  jetblue: {
    baggage:
      'Blue Basic typically includes only a personal item unless a bundle adds carry-on. Blue, Blue Extra, and Mint include a standard carry-on. Checked bags are fee-based unless you have Mosaic status or purchase a bundle.',
    change:
      'Change rules depend on fare: Blue Basic is the most restrictive; higher fares allow changes with possible fees plus fare difference. Same-day switches and standby have separate rules.',
    cancel:
      'Refundable options may return to your card; other fares become travel bank credit minus applicable fees. Cancel before departure to avoid forfeiture.',
    credits:
      'Eligible bookings may qualify for a full refund within 24 hours of purchase. Travel bank credits have their own use-by rules.',
  },
  'alaska-airlines': {
    baggage:
      'Carry-on and personal item included on most fares. Checked bag fees apply unless Mileage Plan status or card benefits apply. Alaska and partner flights may have different allowances on one itinerary.',
    change:
      'Main and First cabins often change without a fee (fare difference may apply). Saver fares are more restrictive and may charge change fees. Changes must be completed before departure.',
    cancel:
      'Saver tickets are often non-refundable; higher fares may offer credit or refund. Partner and award tickets follow separate penalty schedules.',
    credits:
      'Direct purchases may allow 24-hour cancellation for a full refund on qualifying itineraries. Cancel Saver fares early to limit penalties.',
  },
  frontier: {
    baggage:
      'Personal item under the seat is included. Carry-on and checked bags are usually paid add-ons. Bundled fares may include bags and seat selection—compare total cost, not base fare alone.',
    change:
      'Change fees apply on most fares plus any fare difference. Restricted promotional fares have the tightest rules. All changes must be made before scheduled departure.',
    cancel:
      'Most fares are non-refundable; you may receive credit minus cancellation fees. Bundled “Works” style fares can have different terms—check your confirmation code category.',
    credits:
      'Credits often expire. Cancel before departure; no-shows typically lose remaining ticket value on discount fares.',
  },
  hawaiian: {
    baggage:
      'Complimentary carry-on and personal item on most fares. Checked bag fees apply on many mainland–Hawaii routes. Neighbor Island flights may use different weight and piece limits.',
    change:
      'Change fees depend on fare type—mainland, Neighbor Island, and international tickets follow different schedules. Pay fare difference when moving to a higher fare.',
    cancel:
      'Refundable fares may refund to card; restricted fares issue credit minus fees. Inter-island and mainland segments on one record locator share the strictest rule.',
    credits:
      '24-hour cancellation may be available on eligible direct purchases. Sports equipment and extra bags require advance fee payment.',
  },
  'sun-country': {
    baggage:
      'Personal item only is free. Carry-on and checked bags are extra unless included in a bundle you selected at purchase. Review your receipt for bundle inclusions.',
    change:
      'Change and cancellation fees apply on most fares, plus fare difference. Complete changes before departure; last-minute airport changes cost more.',
    cancel:
      'Typically non-refundable; credit minus fees may be issued. Optional trip insurance may cover certain cancel reasons—review your policy certificate.',
    credits:
      'Bundle fares (Best Value style) may include bags and seats—cancellation still follows the underlying fare rules, not just the bundle label.',
  },
  'british-airways': {
    baggage:
      'Hand-baggage-only Economy fares do not include checked luggage. Standard Economy and premium cabins usually include at least one checked piece (often 23 kg). Weight and piece limits depend on fare family and route.',
    change:
      'Economy Basic has the strictest change fees; Standard and flexible fares are easier to rebook with lower penalties. International tickets pay fare difference on upgrades.',
    cancel:
      'Restricted fares are often non-refundable or voucher-only. Flexible fares may refund minus fees. Airline-caused long delays or cancellations may trigger refund rights under applicable regulations.',
    credits:
      'Cooling-off refunds may apply within 24 hours on some direct purchases. Avios award tickets use separate change and cancel mileage penalties.',
  },
  lufthansa: {
    baggage:
      'Economy Light on some routes is carry-on only. Economy Classic and Flex usually include one checked bag (often 23 kg) on transatlantic routes. Business and First have higher allowances.',
    change:
      'Light fares have the highest change fees; Classic and Flex are more flexible. Rebooking requires fare difference when the new flight is more expensive. Changes before departure only.',
    cancel:
      'Non-refundable fares often become vouchers; Flex fares may allow cash refund. No-show penalties can exceed ticket value on discount fares.',
    credits:
      'U.S. market bookings may allow 24-hour refund when purchased seven or more days before departure. Schengen connections need adequate layover time when rebooking.',
  },
  'air-france': {
    baggage:
      'Light fares may exclude checked bags on transatlantic routes. Standard Economy usually includes one checked piece. Cabin bag plus accessory weight limits apply in Economy.',
    change:
      'Promo and Light fares carry change fees; Flex fares are more lenient. Pay fare difference on rebooking. Partner-operated segments may follow the operating carrier’s rules.',
    cancel:
      'Non-refundable tickets often become vouchers. Refundable fares return to payment card minus fees. EU-regulated flights may offer compensation for long delays separate from cancel rules.',
    credits:
      '24-hour refund rights may apply on qualifying U.S. purchases. SkyTeam partner connections should be rebooked as one journey when possible.',
  },
  klm: {
    baggage:
      'Most Economy fares allow one cabin bag plus one small accessory (combined weight limit, typically 12 kg total). Checked baggage depends on Light vs Standard vs Flex—Light may exclude checked bags.',
    change:
      'Light fares have higher change penalties; Standard and Flex are easier to modify. Fare difference always applies on more expensive replacements.',
    cancel:
      'Restricted fares become vouchers; flexible fares may refund. Award tickets follow Flying Blue penalty charts.',
    credits:
      'U.S. direct bookings may include 24-hour cancellation when travel is a week or more away. Amsterdam connections need buffer time for Schengen controls.',
  },
  'virgin-atlantic': {
    baggage:
      'Economy Light is often hand-baggage only. Economy Classic, Delight, and Upper Class include higher checked allowances (commonly 23 kg per piece on transatlantic routes).',
    change:
      'Light fares have change fees; flexible fares often change with fare difference only. Upper Class changes may require phone assistance for complex routes.',
    cancel:
      'Non-refundable fares issue vouchers; refundable fares return to card. Disruption policies may offer refunds when the airline cancels or significantly retimes your flight.',
    credits:
      '24-hour cooling-off may apply on eligible U.S. bookings. Flying Club award tickets have separate cancel rules.',
  },
  'aer-lingus': {
    baggage:
      'Saver transatlantic fares may be carry-on only. Smart and Flex include checked luggage on many U.S.–Ireland tickets. Personal item plus cabin bag rules vary by fare.',
    change:
      'Saver has the highest change fees; Smart and Flex are more flexible. Pay fare difference when upgrading cabin or date.',
    cancel:
      'Saver is often non-refundable with credit minus fees. Cancel before departure. Preclearance flights still follow the same fare penalty rules.',
    credits:
      '24-hour refund may apply on eligible direct purchases. Return U.S. flights with preclearance require earlier airport arrival—changing dates does not remove that requirement.',
  },
  emirates: {
    baggage:
      'Many U.S. Economy fares include two checked pieces up to 23 kg each plus standard cabin baggage—confirm your fare code. Premium cabins include higher weight and piece limits.',
    change:
      'Saver and Special fares have stricter change fees; Flex fares are more flexible. Long-haul rebooking may require fare difference and class availability on connecting flights.',
    cancel:
      'Penalty depends on fare brand; some tickets are non-refundable with limited credit. Cancel before departure to avoid no-show forfeiture.',
    credits:
      'U.S. bookings may allow 24-hour refund on qualifying purchases. Dubai connections need extra time between flights in the same booking.',
  },
  'qatar-airways': {
    baggage:
      'Many U.S. Economy tickets include two checked bags up to 23 kg each plus cabin baggage. Light or promotional fares may reduce allowances—check your ticket category.',
    change:
      'Promotional fares have higher change penalties; unrestricted fares change with fare difference only. Award tickets use Avios or partner rules separately.',
    cancel:
      'Restricted fares may be voucher-only; flexible fares may refund. Airline-initiated cancellations on Doha connections may offer rebooking or refund per policy.',
    credits:
      '24-hour refund may apply on eligible U.S. direct purchases. Stopover programs do not replace standard change and cancel penalties on the base ticket.',
  },
  'singapore-airlines': {
    baggage:
      'Economy allowances vary by sub-class and route—often 25–30 kg or a two-piece concept on U.S. departures. Premium Economy, Business, and Suites have higher limits.',
    change:
      'Value fares incur change fees; Flexible fares often change with fare difference only. KrisFlyer award changes use separate mileage penalties.',
    cancel:
      'Saver-type fares may be non-refundable; flexible fares may refund minus fees. Premium cabin cancellations should be handled before departure to limit penalties.',
    credits:
      'U.S. purchases may qualify for 24-hour cancellation when booked seven or more days ahead. Long-haul connections through Singapore need adequate layover time when rebooking.',
  },
  ana: {
    baggage:
      'Many U.S. Economy tickets include two checked pieces up to 23 kg each plus cabin baggage. Light or discount fares may reduce checked allowance.',
    change:
      'International change fees depend on fare; complex multi-city itineraries may need agent assistance. Pay fare difference on higher fares. Change before departure.',
    cancel:
      'Restricted fares are non-refundable with processing fees; flexible fares may refund. Award tickets on Star Alliance partners follow separate rules.',
    credits:
      'U.S.-issued tickets may allow 24-hour refund on qualifying bookings. Haneda and Narita are not interchangeable—rebooked flights must use a valid Tokyo airport.',
  },
  'cathay-pacific': {
    baggage:
      'Economy Light may exclude checked bags. Economy Essential and above usually include checked luggage on U.S. routes (often 23 kg per piece). Cabin baggage limits apply by fare.',
    change:
      'Light fares have higher change fees; Flex fares are easier to modify. Fare difference applies. Asia Miles award tickets follow separate change charts.',
    cancel:
      'Saver fares may be voucher-only; Flex may refund. Cancel before departure. Transit through Hong Kong may need visa checks when rebooking to certain destinations.',
    credits:
      'U.S. direct bookings may allow 24-hour refund on eligible itineraries. Partner segments on one ticket follow the most restrictive baggage and penalty rules.',
  },
};

function buildAirlineFaqs(airlineName, policies) {
  const items = [
    {
      question: `${airlineName} baggage policy`,
      answer: policies.baggage,
    },
    {
      question: `${airlineName} change policy`,
      answer: policies.change,
    },
    {
      question: `${airlineName} cancellation policy`,
      answer: policies.cancel,
    },
  ];

  if (policies.credits) {
    items.push({
      question: `Refunds, credits, and 24-hour rules for ${airlineName}`,
      answer: policies.credits,
    });
  }

  items.push({
    question: `Need help with ${airlineName} changes or cancellations?`,
    answer: advisory,
  });

  return items;
}

const airlineNames = {
  delta: 'Delta Air Lines',
  united: 'United Airlines',
  'american-airlines': 'American Airlines',
  southwest: 'Southwest Airlines',
  jetblue: 'JetBlue Airways',
  'alaska-airlines': 'Alaska Airlines',
  frontier: 'Frontier Airlines',
  hawaiian: 'Hawaiian Airlines',
  'sun-country': 'Sun Country Airlines',
  'british-airways': 'British Airways',
  lufthansa: 'Lufthansa',
  'air-france': 'Air France',
  klm: 'KLM Royal Dutch Airlines',
  'virgin-atlantic': 'Virgin Atlantic',
  'aer-lingus': 'Aer Lingus',
  emirates: 'Emirates',
  'qatar-airways': 'Qatar Airways',
  'singapore-airlines': 'Singapore Airlines',
  ana: 'All Nippon Airways (ANA)',
  'cathay-pacific': 'Cathay Pacific',
};

export const airlineFaqsBySlug = Object.fromEntries(
  Object.entries(airlinePolicies).map(([slug, policies]) => [
    slug,
    buildAirlineFaqs(airlineNames[slug], policies),
  ])
);
