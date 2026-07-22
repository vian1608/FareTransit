const publicUrl = process.env.PUBLIC_URL || '';

const img = (file) => `${publicUrl}/images/${file}`;

export const flightFamousRoutes = [
  {
    title: 'NYC to London (LHR)',
    path: '/flight-nyc-to-lon',
    image: img('london_lhr.png'),
    desc: 'Direct transatlantic routes available.',
  },
  {
    title: 'LAX to Tokyo (NRT)',
    path: '/flight-lax-to-tokyo',
    image: img('tokyo_nrt.png'),
    desc: 'Premium cabins on direct Pacific flights.',
  },
  {
    title: 'Miami to Paris (CDG)',
    path: '/flight-mia-to-paris',
    image: img('paris_cdg.png'),
    desc: 'Non-stop flights to Charles de Gaulle.',
  },
  {
    title: 'Chicago to Frankfurt',
    path: '/flight-ord-to-fra',
    image: img('frankfurt_fra.png'),
    desc: 'Direct access to the heart of Europe.',
  },
  {
    title: 'SFO to Sydney',
    path: '/flight-sfo-to-syd',
    image: img('sydney_syd.png'),
    desc: 'Transpacific routes with lie-flat seating.',
  },
  {
    title: 'JFK to Dubai',
    path: '/flight-jfk-to-dxb',
    image: img('dubai_dxb.png'),
    desc: 'Ultimate luxury to the Middle East.',
  },
  {
    title: 'Dallas to London',
    path: '/flight-dfw-to-lhr',
    image: img('london_lhr.png'),
    desc: 'Non-stop from Texas to the UK.',
  },
  {
    title: 'Boston to Dublin',
    path: '/flight-bos-to-dub',
    image: img('flight_route_2.png'),
    desc: 'Fastest route to Ireland.',
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
    path: '/train-chicago-to-stlouis',
    image: img('train_route_1.png'),
    desc: 'Lincoln Service through the Midwest',
  },
  {
    title: 'LA to San Diego',
    path: '/train-la-to-sandiego',
    image: img('train_route_2.png'),
    desc: 'Pacific Surfliner ocean views',
  },
  {
    title: 'Seattle to Portland',
    path: '/train-seattle-to-portland',
    image: img('train_route_1.png'),
    desc: 'Amtrak Cascades beautiful greenery',
  },
  {
    title: 'NYC to Albany',
    path: '/train-nyc-to-albany',
    image: img('amtrak_scenic_view.png'),
    desc: 'Empire Service up the Hudson River',
  },
];
