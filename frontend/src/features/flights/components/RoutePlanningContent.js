import React from 'react';
import { Link } from 'react-router-dom';
import './RoutePlanningContent.css';

function originHub(originCity = '') {
  const normalized = originCity.toLowerCase();
  if (normalized.includes('new york')) return { label: 'Flights from New York', to: '/flights/from-new-york' };
  if (normalized.includes('los angeles')) return { label: 'Flights from Los Angeles', to: '/flights/from-los-angeles' };
  return { label: 'Flight planning hub', to: '/flights' };
}

export default function RoutePlanningContent({
  mode = 'flight',
  originCity,
  destinationCity,
  originCode,
  destinationCode,
  insights = [],
}) {
  const isFlight = mode === 'flight';
  const hub = originHub(originCity);

  return (
    <section className="route-planning-content" aria-labelledby="route-planning-heading">
      <div className="container route-planning-content__shell">
        <div className="route-planning-content__intro">
          <span className="route-planning-content__eyebrow">PLAN THE WHOLE TRIP</span>
          <h2 id="route-planning-heading">
            {isFlight ? 'Flight' : 'Rail'} planning from {originCity} to {destinationCity}
          </h2>
          <p>
            Use the route as a starting point, then compare the details that can change the real value of the trip:
            schedule, connections, fare conditions, baggage or luggage needs, and traveler assistance.
          </p>
        </div>

        {insights?.length > 0 && (
          <div className="route-planning-content__insights">
            {insights.map((insight) => (
              <div className="route-insight" key={insight.title}>
                <h3>{insight.title}</h3>
                <p>{insight.text}</p>
              </div>
            ))}
          </div>
        )}

        <div className="route-planning-grid">
          <article>
            <span className="route-planning-grid__icon" aria-hidden="true">01</span>
            <h3>Review timing and connections</h3>
            <p>
              Compare the scheduled departure, arrival and total elapsed travel time. For connecting trips, check whether the connection is practical rather than choosing only by price.
            </p>
          </article>

          <article>
            <span className="route-planning-grid__icon" aria-hidden="true">02</span>
            <h3>{isFlight ? 'Compare the fare conditions' : 'Compare ticket conditions'}</h3>
            <p>
              {isFlight
                ? 'Airline fare names are not standardized. Review the actual seat, baggage, change and refund benefits attached to the option shown for the itinerary.'
                : 'Review the ticket rules, seating options, schedule restrictions and any change or cancellation conditions before selecting a rail itinerary.'}
            </p>
          </article>

          <article>
            <span className="route-planning-grid__icon" aria-hidden="true">03</span>
            <h3>{isFlight ? 'Plan baggage before checkout' : 'Plan luggage and accessibility'}</h3>
            <p>
              {isFlight
                ? 'Carry-on and checked-bag terms can differ by fare. FareTransit only displays priced additional baggage when reliable itinerary-level baggage information is available.'
                : 'Consider luggage quantity, station access and any mobility or boarding assistance that should be arranged before the travel date.'}
            </p>
          </article>

          <article>
            <span className="route-planning-grid__icon" aria-hidden="true">04</span>
            <h3>Check traveler information</h3>
            <p>
              Confirm passenger names and required identification details before submitting the reservation. Add seating, mobility or other assistance requests early when possible.
            </p>
          </article>
        </div>

        <div className="route-planning-summary">
          <div>
            <span>{originCode}</span>
            <strong aria-hidden="true">→</strong>
            <span>{destinationCode}</span>
          </div>
          <p>
            Availability, schedules, prices and operating conditions can change. Review the exact itinerary and applicable provider terms before ticketing.
          </p>
        </div>

        <nav className="route-planning-links" aria-label="Related route planning guides">
          {isFlight && <Link to={hub.to}>{hub.label}</Link>}
          {isFlight && <Link to="/fare-types">Airline fare types</Link>}
          {isFlight && <Link to="/baggage">Baggage planning</Link>}
          <Link to="/guides">Travel planning guides</Link>
          <Link to="/how-it-works">How FareTransit works</Link>
        </nav>
      </div>
    </section>
  );
}
