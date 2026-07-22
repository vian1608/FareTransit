import { airlineFaqsBySlug } from '../data/airlineFaqs';

const advisory =
  'Call our desk above for live concierge booking, routing assistance, and urgent itinerary support.';

export function getAirlineFaqs(slug, airlineName, baggage) {
  if (airlineFaqsBySlug[slug]) {
    return airlineFaqsBySlug[slug];
  }

  return [
    {
      question: `${airlineName} baggage policy`,
      answer:
        baggage ||
        `Baggage allowances depend on fare class, route, and loyalty status. Carry-on, personal item, and checked bag fees vary. Our advisors can review your confirmation and explain what applies to your trip.`,
    },
    {
      question: `${airlineName} change policy`,
      answer: `Change fees and fare differences depend on your ticket type. Restricted fares may charge penalties or forbid changes; flexible fares often allow changes before departure with only a fare difference. Our team can help you understand options for your itinerary.`,
    },
    {
      question: `${airlineName} cancellation policy`,
      answer: `Refundable fares may return to your original payment method. Non-refundable fares usually become travel credit minus any cancellation fee. Cancel before departure—no-shows on restricted tickets often forfeit all value.`,
    },
    {
      question: `Refunds, credits, and timing for ${airlineName}`,
      answer: `Many carriers allow a short post-purchase cancellation window on eligible fares. Airline schedule changes may open refund rights separate from standard cancel rules. We can help interpret your ticket category.`,
    },
    {
      question: `Need help with ${airlineName} changes or cancellations?`,
      answer: advisory,
    },
  ];
}
