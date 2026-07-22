export const consultingServices = [
  {
    id: 'standard',
    name: 'Standard Logistics Advisory',
    price: 49,
    description:
      'Route review, fare-class guidance, and email summary for one domestic or short-haul itinerary.',
    features: [
      'Single itinerary review',
      'Connection timing analysis',
      'Written advisory summary',
      'Email support (2 business days)',
    ],
  },
  {
    id: 'urgent',
    name: 'Urgent Itinerary Support',
    price: 99,
    description:
      'Same-week travel changes, disruption response, and live phone coordination with an advisor.',
    features: [
      'Priority advisor queue',
      'Change & cancel strategy',
      'Live phone coordination',
      '48-hour response window',
    ],
    recommended: true,
  },
  {
    id: 'premium',
    name: 'Premium Concierge Coordination',
    price: 199,
    description:
      'Complex multi-leg or international logistics with backup routing and escalation support.',
    features: [
      'Multi-segment planning',
      'International routing strategy',
      'Backup itinerary options',
      'Dedicated advisor session',
    ],
  },
];

export const PAYMENT_DISCLAIMER =
  'FareTransit LLC is an independent logistics consultancy. Service fees cover advisory and coordination only—we do not issue airline or rail tickets directly. Carrier fares and taxes are billed separately per your approved quote.';
