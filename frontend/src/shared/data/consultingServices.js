export const consultingServices = [
  {
    id: 'standard',
    name: 'Standard Flight Assistance',
    price: 49,
    description:
      'Route review, fare-class guidance, and email summary for one domestic or short-haul itinerary.',
    features: [
      'Single itinerary review',
      'Connection timing analysis',
      'Written summary details',
      'Email support (2 business days)',
    ],
  },
  {
    id: 'urgent',
    name: 'Urgent Itinerary Support',
    price: 99,
    description:
      'Same-week travel changes, disruption response, and live phone coordination with a travel specialist.',
    features: [
      'Priority specialist queue',
      'Change & cancel options',
      'Live phone support',
      '48-hour response window',
    ],
    recommended: true,
  },
  {
    id: 'premium',
    name: 'Premium Concierge Coordination',
    price: 199,
    description:
      'Complex multi-leg or international flight routing with backup options and priority support.',
    features: [
      'Multi-segment planning',
      'International routing assistance',
      'Backup itinerary options',
      'Dedicated specialist session',
    ],
  },
];

export const PAYMENT_DISCLAIMER =
  'FareTransit LLC is an independent flight-search and reservation-assistance service. Service fees cover reservation support and travel assistance—we are not affiliated with or endorsed by individual airlines.';
