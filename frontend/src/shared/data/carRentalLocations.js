export const carRentalLocations = {
  miami: {
    slug: 'miami',
    label: 'Miami',
    title: 'Car Rentals in Miami | Rental Booking Assistance | FareTransit',
    pageName: 'Car Rentals in Miami',
    description: 'Plan a Miami car rental with practical guidance on airport versus city pickup, vehicle type and trip needs, then contact FareTransit for reservation assistance.',
    intro: 'A rental car can make sense in Miami when your trip extends beyond one neighborhood or includes beaches, suburbs, cruise connections or destinations across South Florida.',
    sections: [
      { heading: 'Airport or city pickup?', text: 'Airport pickup can simplify an arrival-day handoff, while a city location may work better if you do not need a car for the entire stay.' },
      { heading: 'Choose for passengers and luggage', text: 'Match the vehicle category to your group size, luggage and driving plans instead of focusing only on the lowest base rate.' },
      { heading: 'Plan for parking and tolls', text: 'Review parking needs and supplier toll policies before confirming so the rental works with the rest of your trip.' },
    ],
    relatedHotel: '/hotels/miami',
    relatedHotelLabel: 'Need a hotel in Miami too?',
  },
  orlando: {
    slug: 'orlando',
    label: 'Orlando',
    title: 'Car Rentals in Orlando | Rental Booking Assistance | FareTransit',
    pageName: 'Car Rentals in Orlando',
    description: 'Plan an Orlando car rental for theme parks, family travel or airport pickup, then contact FareTransit for reservation assistance and vehicle-selection help.',
    intro: 'Orlando trips often involve multiple parks, hotels and attractions spread across Central Florida, making pickup location and vehicle size important planning decisions.',
    sections: [
      { heading: 'Airport pickup', text: 'Picking up near Orlando International Airport can be convenient when you want the vehicle for the full trip.' },
      { heading: 'Family and luggage space', text: 'SUVs, vans and larger categories may be worth comparing when you are traveling with children, strollers or multiple bags.' },
      { heading: 'Hotel parking and driving plans', text: 'Check your hotel parking arrangements and how often you expect to drive before choosing the rental period.' },
    ],
    relatedHotel: '/hotels/orlando',
    relatedHotelLabel: 'Need a hotel in Orlando too?',
  },
  lax: {
    slug: 'lax',
    label: 'Los Angeles International Airport (LAX)',
    title: 'LAX Car Rentals | Airport Rental Booking Assistance | FareTransit',
    pageName: 'Car Rentals at LAX',
    description: 'Plan a rental car at Los Angeles International Airport with guidance on pickup timing, vehicle size and local driving needs, then contact FareTransit for assistance.',
    intro: 'Los Angeles is spread out, so a rental car can be useful when your itinerary includes several neighborhoods, beaches or destinations outside the central city.',
    sections: [
      { heading: 'Allow time for the airport handoff', text: 'Airport rental pickup may involve a transfer from the terminal area, so leave enough time in your arrival plan.' },
      { heading: 'Pick a practical category', text: 'Choose based on luggage, passenger count and expected driving rather than reserving more vehicle than you need.' },
      { heading: 'Consider parking', text: 'Parking availability and cost can vary greatly by hotel and neighborhood, so include that in your trip plan.' },
    ],
    relatedFlight: '/flight-lax-to-jfk',
    relatedFlightLabel: 'Looking for Los Angeles to New York flights?',
  },
  jfk: {
    slug: 'jfk',
    label: 'John F. Kennedy International Airport (JFK)',
    title: 'JFK Car Rentals | Airport Rental Booking Assistance | FareTransit',
    pageName: 'Car Rentals at JFK',
    description: 'Plan a rental car at JFK with practical guidance on airport pickup, vehicle selection and New York-area driving needs, then contact FareTransit for assistance.',
    intro: 'A JFK rental is most useful when your trip extends beyond areas that are easy to cover by public transit or when you are continuing to destinations outside New York City.',
    sections: [
      { heading: 'Decide whether you need a car in the city', text: 'For a Manhattan-only stay, a rental may be unnecessary; for outer-borough, suburban or regional travel, it can be more practical.' },
      { heading: 'Allow time for pickup', text: 'Build the rental handoff into your arrival schedule, especially after a long or international flight.' },
      { heading: 'Review toll and parking needs', text: 'Understand the supplier toll policy and where you expect to park before confirming the rental.' },
    ],
    relatedHotel: '/hotels/new-york',
    relatedHotelLabel: 'Need a hotel in New York City too?',
    relatedFlight: '/flight-lax-to-jfk',
    relatedFlightLabel: 'Looking for Los Angeles to New York flights?',
  },
};

export const carRentalLocationSlugs = Object.keys(carRentalLocations);

export function getCarRentalLocation(slug) {
  return carRentalLocations[slug] || null;
}
