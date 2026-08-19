const publicUrl = process.env.PUBLIC_URL || '';

const img = (file) => `${publicUrl}/images/${file}`;

export const flightFamousRoutes = [
  {
    title: 'NYC to London (LHR)',
    path: '/routes/flight-nyc-to-lon',
    image: img('london_lhr.png'),
    desc: 'Compare flight schedules, baggage allowances, and direct transatlantic options.',
  },
  {
    title: 'LAX to Tokyo (NRT)',
    path: '/routes/flight-lax-to-tokyo',
    image: img('tokyo_nrt.png'),
    desc: 'Personal assistance comparing Pacific departure times, layovers, and cabin options.',
  },
  {
    title: 'Miami to Paris (CDG)',
    path: '/routes/flight-mia-to-paris',
    image: img('paris_cdg.png'),
    desc: 'Compare non-stop schedules and baggage policies with travel specialist support.',
  },
  {
    title: 'Chicago to Frankfurt',
    path: '/routes/flight-ord-to-fra',
    image: img('frankfurt_fra.png'),
    desc: 'Compare schedules, connections and fare options for international travel.',
  },
  {
    title: 'SFO to Sydney',
    path: '/routes/flight-sfo-to-syd',
    image: img('sydney_syd.png'),
    desc: 'Compare total journey times, seat comfort, and connecting flight options.',
  },
  {
    title: 'JFK to Dubai',
    path: '/routes/flight-jfk-to-dxb',
    image: img('dubai_dxb.png'),
    desc: 'Compare long-haul schedules, baggage rules, and cabin class flexibility.',
  },
  {
    title: 'Dallas to London',
    path: '/routes/flight-dfw-to-lhr',
    image: img('london_lhr.png'),
    desc: 'Compare schedules, layovers, and fare options with personal reservation help.',
  },
  {
    title: 'Boston to Dublin',
    path: '/routes/flight-bos-to-dub',
    image: img('flight_route_2.png'),
    desc: 'Compare flight times, baggage limits, and direct transatlantic connections.',
  },
];

export const trainFamousRoutes = [
  {
    title: 'NYC to Washington, D.C.',
    path: '/train-nyc-to-dc',
    image: img('train_route_1.png'),
    desc: 'Direct Northeast Corridor service',
  },
  {
    title: 'Washington, D.C. to NYC',
    path: '/train-dc-to-nyc',
    image: img('train_route_2.png'),
    desc: 'High-speed business class available',
  },
  {
    title: 'Philadelphia to NYC',
    path: '/train-philly-to-nyc',
    image: img('amtrak_scenic_view.png'),
    desc: 'Fast, reliable Northeast Regional',
  },
  {
    title: 'Boston to NYC',
    path: '/train-boston-to-nyc',
    image: img('train_route_2.png'),
    desc: 'Scenic coastal views on the Acela',
  },
  {
    title: 'Chicago to St. Louis',
    path: '/routes/train-chicago-to-stlouis',
    image: img('train_route_1.png'),
    desc: 'Lincoln Service through the Midwest',
  },
  {
    title: 'LA to San Diego',
    path: '/routes/train-la-to-sandiego',
    image: img('train_route_2.png'),
    desc: 'Pacific Surfliner ocean views',
  },
  {
    title: 'Seattle to Portland',
    path: '/routes/train-seattle-to-portland',
    image: img('train_route_1.png'),
    desc: 'Amtrak Cascades beautiful greenery',
  },
  {
    title: 'NYC to Albany',
    path: '/routes/train-nyc-to-albany',
    image: img('amtrak_scenic_view.png'),
    desc: 'Empire Service up the Hudson River',
  },
];
