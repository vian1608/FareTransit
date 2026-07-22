import React from 'react';
import { Helmet } from 'react-helmet-async';
import { Link, useParams, Navigate } from 'react-router-dom';
import AirlineLogo from '../../../shared/components/AirlineLogo';
import AirlineFaq from '../components/AirlineFaq';
import { AIRLINE_ACTIONS } from '../../../shared/config/airlineActionContent';
import { getAirlineFromSlug, getAirlineDisplayName } from '../../../shared/utils/airlineDisplay';
import { getAirlineFaqs } from '../../../shared/utils/getAirlineFaqs';
import { getAirlineMetaDescription } from '../../../shared/utils/airlineMeta';
import { SUPPORT_PHONE_DISPLAY, SUPPORT_PHONE_HREF } from '../../../shared/constants/supportContact';
import AirlineLegalFinePrint from '../components/AirlineLegalFinePrint';
import airlinesData from '../../../shared/data/airlinesData.json';
import './AirlineActionPage.css';

const baggageBySlug = Object.fromEntries(airlinesData.map((a) => [a.slug, a.baggage]));

function AirlineActionPage({ action }) {
  const { airline: airlineSlug } = useParams();
  const config = AIRLINE_ACTIONS[action];
  const airline = getAirlineFromSlug(airlineSlug);

  if (!config || !airlineSlug) {
    return <Navigate to="/" replace />;
  }

  const airlineName = getAirlineDisplayName(airlineSlug);
  const canonicalUrl = `https://faretransit.com/${action}/${airline.slug}`;
  const faqs = getAirlineFaqs(airline.slug, airlineName, baggageBySlug[airline.slug]);
  const metaDescription = getAirlineMetaDescription(airlineName);

  return (
    <div className={`airline-action-page airline-action-page--${action}`}>
      <Helmet>
        <title>{config.h1(airlineName)} | FareTransit LLC</title>
        <meta name="description" content={metaDescription} />
        <meta property="og:description" content={metaDescription} />
        <meta name="twitter:description" content={metaDescription} />
        <link rel="canonical" href={canonicalUrl} />
      </Helmet>

      <div className="airline-action-container">
        <nav className="airline-action-breadcrumbs" aria-label="Breadcrumb">
          <Link to="/">{config.breadcrumbRoot}</Link>
          <span aria-hidden="true">›</span>
          <span>{airlineName} Airlines</span>
          <span aria-hidden="true">›</span>
          <span>{config.breadcrumbDesk}</span>
        </nav>

        <section className="airline-action-hero">
          <div className="airline-action-hero__top">
            <AirlineLogo slug={airline.slug} airlineName={airlineName} className="airline-action-hero__logo" />
            <div className="airline-action-hero__copy">
              <h1>{config.h1(airlineName)}</h1>
              <p className="airline-action-hero__subtext">{config.subtext}</p>
            </div>
          </div>

          <a href={SUPPORT_PHONE_HREF} className="airline-action-call-cta">
            <i className="fas fa-phone" aria-hidden="true" />
            <span>{config.callLabel}</span>
            <strong>{SUPPORT_PHONE_DISPLAY}</strong>
          </a>
        </section>

        <section className="airline-action-faq-card">
          <h2>{config.faqTitle(airlineName)}</h2>
          <p>{config.faqIntro}</p>
          <AirlineFaq airlineName={airlineName} faqs={faqs} />
        </section>

        <AirlineLegalFinePrint />
      </div>
    </div>
  );
}

export default AirlineActionPage;
