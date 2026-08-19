const heroImage = (filename) => `${process.env.PUBLIC_URL}/images/hero/${filename}`;

export const heroOfferTag = {
  label: 'Urgent Travel',
  highlight: 'Up to 20% off',
  detail: 'on travel within 3 days',
};

export const flightHeroSlides = [
  {
    id: 'flight-intro',
    type: 'content',
    backgroundImage: heroImage('flight-slide.jpg'),
    eyebrow: 'FareTransit — Flight Booking Assistance',
    title: 'Simple Flight Booking With Real Human Support',
    lead:
      'We help travelers and families compare routes, connections, baggage and total travel time before completing a reservation.',
    mobileLead: 'We help travelers compare routes, connections and total travel time.',
  },
  {
    id: 'flight-aircraft',
    type: 'content',
    backgroundImage: heroImage('flight-aircraft.jpg'),
    alt: 'Commercial aircraft prepared for departure',
    eyebrow: 'FareTransit — Flight Booking Assistance',
    title: 'Strategic Routing Across Domestic & International Networks',
    lead:
      'Compare flight schedules, layovers, and airline baggage allowances with dedicated reservation guidance.',
    mobileLead: 'Compare flight schedules, layovers and baggage allowances.',
  },
  {
    id: 'flight-cabin',
    type: 'content',
    backgroundImage: heroImage('flight-cabin.jpg'),
    alt: 'Premium aircraft cabin seating',
    eyebrow: 'FareTransit — Flight Booking Assistance',
    title: 'Cabin-Class Advisory Tailored To Your Travel Needs',
    lead:
      'From Economy to Premium & Business Class, find comfortable flight options configured for your itinerary.',
    mobileLead: 'Find comfortable flight options configured for your trip.',
  },
  {
    id: 'flight-travelers',
    type: 'content',
    backgroundImage: heroImage('flight-travelers.jpg'),
    alt: 'Travelers satisfied with their journey',
    eyebrow: 'FareTransit — Flight Booking Assistance',
    title: 'Trusted Flight Support For Families & Independent Travelers',
    lead:
      'Personal coordination for parents, relatives, and multi-city travel with 24/7 travel day support.',
    mobileLead: 'Personal travel coordination with 24/7 support.',
  },
];

export const railHeroSlides = [
  {
    id: 'rail-intro',
    type: 'content',
    backgroundImage: heroImage('rail-slide.jpg'),
    eyebrow: 'FareTransit — Rail Travel Support',
    title: 'Amtrak & National Rail Travel Support',
    lead:
      'Independent assistance for rail itineraries, connection planning, and journey optimization across Amtrak and partner rail networks.',
    mobileLead: 'Independent assistance for Amtrak and national rail itineraries.',
  },
  {
    id: 'rail-train',
    type: 'content',
    backgroundImage: heroImage('rail-train.jpg'),
    alt: 'Passenger train traveling through scenic landscape',
    eyebrow: 'FareTransit — Rail Travel Support',
    title: 'National Rail Corridors Planned With Connection Precision',
    lead:
      'Compare Northeast Corridor, Acela, and long-distance train schedules with expert passenger assistance.',
    mobileLead: 'Compare Northeast Corridor and long-distance train schedules.',
  },
  {
    id: 'rail-interior',
    type: 'content',
    backgroundImage: heroImage('rail-interior.jpg'),
    alt: 'Comfortable passenger train interior seating',
    eyebrow: 'FareTransit — Rail Travel Support',
    title: 'Class & Seating Strategy For Every Segment Of Your Journey',
    lead:
      'Get clear information on Coach, Business, and Sleeper accommodation for a comfortable trip.',
    mobileLead: 'Clear info on Coach, Business and Sleeper seats.',
  },
  {
    id: 'rail-travelers',
    type: 'content',
    backgroundImage: heroImage('rail-travelers.jpg'),
    alt: 'Happy group of travelers on a trip',
    eyebrow: 'FareTransit — Rail Travel Support',
    title: 'Compassionate Support When Your Travel Plans Cannot Wait',
    lead:
      'Priority booking assistance and route comparison when you need to travel on short notice.',
    mobileLead: 'Priority route comparison for urgent travel.',
  },
];

