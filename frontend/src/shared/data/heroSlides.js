const heroImage = (filename) => `${process.env.PUBLIC_URL}/images/hero/${filename}`;

export const heroOfferTag = {
  label: 'Limited Offer',
  highlight: 'Up to 30% off',
  detail: 'on travel within 3 days',
};

export const flightHeroSlides = [
  {
    id: 'flight-intro',
    type: 'content',
    backgroundImage: heroImage('flight-slide.jpg'),
    eyebrow: 'FareTransit LLC — Air Logistics',
    title: 'Urgent & Complex Air Travel Logistics Advisory',
    lead:
      'Independent consultancy for time-sensitive itineraries, routing strategy, and itinerary optimization across domestic and international air networks.',
    showActions: true,
  },
  {
    id: 'flight-aircraft',
    type: 'image',
    image: heroImage('flight-aircraft.jpg'),
    alt: 'Commercial aircraft prepared for departure',
    caption: 'Strategic routing across domestic and international networks',
  },
  {
    id: 'flight-cabin',
    type: 'image',
    image: heroImage('flight-cabin.jpg'),
    alt: 'Premium aircraft cabin seating',
    caption: 'Cabin-class advisory tailored to your logistics needs',
  },
  {
    id: 'flight-travelers',
    type: 'image',
    image: heroImage('flight-travelers.jpg'),
    alt: 'Travelers satisfied with their journey',
    caption: 'Trusted by clients for urgent and complex travel logistics',
  },
];

export const railHeroSlides = [
  {
    id: 'rail-intro',
    type: 'content',
    backgroundImage: heroImage('rail-slide.jpg'),
    eyebrow: 'FareTransit LLC — Rail Logistics',
    title: 'Amtrak & National Rail Logistics Advisory',
    lead:
      'Independent consultancy for urgent rail itineraries, connection strategy, and itinerary optimization across Amtrak and partner rail networks.',
    showActions: true,
  },
  {
    id: 'rail-train',
    type: 'image',
    image: heroImage('rail-train.jpg'),
    alt: 'Passenger train traveling through scenic landscape',
    caption: 'National rail corridors planned with connection precision',
  },
  {
    id: 'rail-interior',
    type: 'image',
    image: heroImage('rail-interior.jpg'),
    alt: 'Comfortable passenger train interior seating',
    caption: 'Class and seating strategy for every segment of your journey',
  },
  {
    id: 'rail-travelers',
    type: 'image',
    image: heroImage('rail-travelers.jpg'),
    alt: 'Happy group of travelers on a trip',
    caption: 'Compassionate support when your plans cannot wait',
  },
];
