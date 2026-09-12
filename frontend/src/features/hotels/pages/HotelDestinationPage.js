import React from 'react';
import { Link, useParams } from 'react-router-dom';
import NotFoundPage from '../../../shared/pages/NotFoundPage';
import { getHotelDestination } from '../../../shared/data/hotelDestinations';
import './../../../shared/pages/SeoDestinationPage.css';

const RELATED_CARS = {
  miami: '/car-rentals/miami',
  'new-york': '/car-rentals/jfk',
  orlando: '/car-rentals/orlando',
};

export default function HotelDestinationPage() {
  const { destinationSlug } = useParams();
  const destination = getHotelDestination(destinationSlug);

  if (!destination) return <NotFoundPage />;

  const searchHref = `/hotels?q=${encodeURIComponent(destination.city)}`;
  const relatedCar = RELATED_CARS[destination.slug];

  return (
    <div className="seo-destination-page">
      <section className="seo-destination-hero seo-destination-hero--hotels">
        <div className="container">
          <p className="seo-destination-eyebrow">Hotel planning &amp; reservation assistance</p>
          <h1>{destination.pageName}</h1>
          <p>{destination.intro}</p>
          <div className="seo-destination-actions">
            <Link className="seo-destination-button seo-destination-button--primary" to={searchHref}>Search {destination.city} Hotels</Link>
            <Link className="seo-destination-button seo-destination-button--secondary" to="/hotels">Hotel Search Home</Link>
          </div>
        </div>
      </section>

      <section className="seo-destination-section" aria-labelledby="hotel-areas-title">
        <div className="container">
          <h2 id="hotel-areas-title">Where to stay in {destination.city}</h2>
          <p>Start with the part of the destination that best matches the way you expect to spend the trip.</p>
          <div className="seo-destination-grid">
            {destination.areas.map((area) => (
              <article className="seo-destination-card" key={area.name}>
                <h3>{area.name}</h3>
                <p>{area.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="seo-destination-section seo-destination-section--white" aria-labelledby="hotel-compare-title">
        <div className="container">
          <h2 id="hotel-compare-title">What to compare before requesting a hotel</h2>
          <ul className="seo-destination-checklist">
            {destination.considerations.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </div>
      </section>

      <section className="seo-destination-section" aria-labelledby="hotel-next-title">
        <div className="container">
          <h2 id="hotel-next-title">Plan the rest of the trip</h2>
          <p>Keep the stay connected to your flight and ground-transportation plans instead of treating each booking as a separate decision.</p>
          <div className="seo-destination-links">
            <Link to={searchHref}>Search hotels in {destination.city}</Link>
            {destination.flightLink && <Link to={destination.flightLink}>{destination.flightLabel}</Link>}
            {relatedCar && <Link to={relatedCar}>Explore car rental help for {destination.city}</Link>}
            <Link to="/flights">Explore flight booking assistance</Link>
          </div>
        </div>
      </section>
    </div>
  );
}
