import React from 'react';
import { Link, useParams } from 'react-router-dom';
import NotFoundPage from '../../../shared/pages/NotFoundPage';
import { getCarRentalLocation } from '../../../shared/data/carRentalLocations';
import { SUPPORT_PHONE_DISPLAY, SUPPORT_PHONE_HREF } from '../../../shared/constants/supportContact';
import './../../../shared/pages/SeoDestinationPage.css';

export default function CarRentalLocationPage() {
  const { locationSlug } = useParams();
  const location = getCarRentalLocation(locationSlug);

  if (!location) return <NotFoundPage />;

  return (
    <div className="seo-destination-page">
      <section className="seo-destination-hero seo-destination-hero--cars">
        <div className="container">
          <p className="seo-destination-eyebrow">Car rental planning &amp; booking assistance</p>
          <h1>{location.pageName}</h1>
          <p>{location.intro}</p>
          <div className="seo-destination-actions">
            <a className="seo-destination-button seo-destination-button--primary" href={SUPPORT_PHONE_HREF}>Call {SUPPORT_PHONE_DISPLAY}</a>
            <Link className="seo-destination-button seo-destination-button--secondary" to="/car-rentals">Car Rental Home</Link>
          </div>
        </div>
      </section>

      <section className="seo-destination-section" aria-labelledby="rental-plan-title">
        <div className="container">
          <h2 id="rental-plan-title">Plan the rental around the trip</h2>
          <div className="seo-destination-grid">
            {location.sections.map((section) => (
              <article className="seo-destination-card" key={section.heading}>
                <h3>{section.heading}</h3>
                <p>{section.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="seo-destination-section seo-destination-section--white" aria-labelledby="rental-help-title">
        <div className="container">
          <h2 id="rental-help-title">What to have ready before you call</h2>
          <ul className="seo-destination-checklist">
            <li>Pickup and return location, dates and approximate times.</li>
            <li>Driver age requirements, passenger count and the amount of luggage you expect.</li>
            <li>Your preferred vehicle category and whether airport or city pickup is more practical.</li>
            <li>Any questions about supplier policies, parking, tolls or the reservation process.</li>
          </ul>
        </div>
      </section>

      <section className="seo-destination-section" aria-labelledby="rental-next-title">
        <div className="container">
          <h2 id="rental-next-title">Connect the rental to the rest of your travel</h2>
          <p>Review the flight arrival time and hotel location before deciding when and where to pick up the vehicle.</p>
          <div className="seo-destination-links">
            <Link to="/car-rentals">Explore car rental assistance</Link>
            {location.relatedHotel && <Link to={location.relatedHotel}>{location.relatedHotelLabel}</Link>}
            {location.relatedFlight && <Link to={location.relatedFlight}>{location.relatedFlightLabel}</Link>}
            <Link to="/hotels">Search hotels</Link>
            <Link to="/flights">Explore flights</Link>
          </div>
        </div>
      </section>
    </div>
  );
}
