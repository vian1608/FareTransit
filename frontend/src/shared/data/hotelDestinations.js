export const hotelDestinations = {
  miami: {
    slug: 'miami',
    city: 'Miami',
    title: 'Hotels in Miami | Stay Planning & Reservation Help | FareTransit',
    pageName: 'Hotels in Miami',
    description: 'Compare Miami hotel areas, stay types and practical booking considerations, then search live hotel options and request reservation assistance from FareTransit.',
    intro: 'Miami offers very different stay experiences depending on whether you want beach access, nightlife, business districts, airport convenience, or a quieter base for a longer trip.',
    areas: [
      { name: 'Miami Beach', text: 'A practical choice when beach access, restaurants and a walkable visitor district matter most.' },
      { name: 'Downtown & Brickell', text: 'Useful for business trips, events and travelers who want an urban base with transit and dining nearby.' },
      { name: 'Miami Airport area', text: 'Worth considering for short stays, late arrivals, early departures or trips centered on onward connections.' },
    ],
    considerations: [
      'Compare the total stay cost, not only the nightly rate, and review taxes or property-specific fees before confirming.',
      'Check cancellation terms and room-type details carefully when your itinerary may still change.',
      'Consider parking, resort-style amenities and distance from the places you plan to visit.',
    ],
    flightLink: '/flight-nyc-to-mia',
    flightLabel: 'Planning New York to Miami flights?',
  },
  'new-york': {
    slug: 'new-york',
    city: 'New York City',
    title: 'Hotels in New York City | Stay Planning & Reservation Help | FareTransit',
    pageName: 'Hotels in New York City',
    description: 'Compare New York City hotel areas and practical stay considerations, then search live hotel options and request reservation assistance from FareTransit.',
    intro: 'New York hotel choices vary sharply by neighborhood, airport access and the attractions or meetings you need to reach. Picking the right area can be as important as choosing the property itself.',
    areas: [
      { name: 'Midtown Manhattan', text: 'Convenient for many first-time visitors who want broad subway access and central sightseeing.' },
      { name: 'Lower Manhattan', text: 'A strong option for downtown business, waterfront access and neighborhoods south of Midtown.' },
      { name: 'Queens & airport corridors', text: 'Can make sense for short stays or travelers prioritizing JFK or LaGuardia access over a Manhattan location.' },
    ],
    considerations: [
      'Compare room size, location and transit access rather than judging a stay only by its headline rate.',
      'Review cancellation terms and the final total before submitting a reservation request.',
      'Estimate the travel time between your hotel, airport and the places you expect to visit most.',
    ],
    flightLink: '/flight-lax-to-jfk',
    flightLabel: 'Planning Los Angeles to New York flights?',
  },
  'las-vegas': {
    slug: 'las-vegas',
    city: 'Las Vegas',
    title: 'Hotels in Las Vegas | Stay Planning & Reservation Help | FareTransit',
    pageName: 'Hotels in Las Vegas',
    description: 'Compare Las Vegas hotel areas, resort-style stays and booking considerations, then search live hotel options and request reservation assistance from FareTransit.',
    intro: 'Las Vegas stays range from large resort properties to quieter off-Strip hotels, so location, included amenities and the final trip total deserve careful comparison.',
    areas: [
      { name: 'The Strip', text: 'Best suited to travelers who want major entertainment, dining and resort properties within the main visitor corridor.' },
      { name: 'Downtown Las Vegas', text: 'A different atmosphere with its own entertainment district and access to central Las Vegas attractions.' },
      { name: 'Airport & off-Strip areas', text: 'Useful when proximity, parking, quieter surroundings or a shorter transfer matters more than staying on the Strip.' },
    ],
    considerations: [
      'Review property-specific fees and inclusions so you understand the complete stay cost.',
      'Check whether parking, pool access or other amenities matter to your plans before choosing a property.',
      'Compare cancellation rules carefully, especially for event weekends or fixed travel dates.',
    ],
  },
  orlando: {
    slug: 'orlando',
    city: 'Orlando',
    title: 'Hotels in Orlando | Family Stay Planning & Reservation Help | FareTransit',
    pageName: 'Hotels in Orlando',
    description: 'Compare Orlando hotel areas for theme-park, family and airport stays, then search live hotel options and request reservation assistance from FareTransit.',
    intro: 'Orlando lodging is spread across several visitor zones, and the right hotel often depends on which parks, events or neighborhoods your trip is built around.',
    areas: [
      { name: 'Walt Disney World area', text: 'Useful for travelers who want to keep theme-park transfer time and family logistics as simple as possible.' },
      { name: 'International Drive & Universal area', text: 'A practical base for Universal, convention travel, dining and attractions around International Drive.' },
      { name: 'Orlando airport area', text: 'Worth considering for overnight connections, early departures and trips that continue elsewhere in Central Florida.' },
    ],
    considerations: [
      'Compare shuttle options, parking and transportation needs before deciding whether an on-site or off-site stay works better.',
      'Check room configuration and occupancy details carefully for family or group travel.',
      'Review cancellation terms and the final stay total before submitting a booking request.',
    ],
  },
};

export const hotelDestinationSlugs = Object.keys(hotelDestinations);

export function getHotelDestination(slug) {
  return hotelDestinations[slug] || null;
}
