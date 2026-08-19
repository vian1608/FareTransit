# FareTransit

FareTransit is a travel-assistance and booking platform focused on helping travelers compare flight options, submit travel requests, manage reservations, and receive human booking support.

**Production website:** https://www.faretransit.com/

**XML sitemap:** https://www.faretransit.com/sitemap.xml

---

## Overview

The application includes:

- Flight search and travel-assistance workflows
- Custom travel inquiry forms
- Senior travel assistance landing pages
- Urgent travel assistance
- Booking-for-parents assistance
- Car rental search
- Flight and train route landing pages
- Airline booking/change/cancellation information pages
- Customer booking and authorization flows
- Admin booking management
- Email and booking workflow automation
- Google Ads lead-conversion tracking
- SEO metadata, canonical URLs, structured data, robots directives, and XML sitemap support

---

## Technology Stack

### Frontend

- React 18
- React Router
- React Helmet Async
- Axios
- Vercel Analytics
- React Select
- Create React App

### Backend

- Node.js
- Express
- Supabase
- Resend / email services
- PDFKit
- JWT authentication
- Axios

### Hosting

The application is configured for deployment on **Vercel**.

---

## Project Structure

```text
faretransit/
├── api/
├── backend/
│   ├── src/
│   ├── tests/
│   └── package.json
├── frontend/
│   ├── public/
│   │   ├── index.html
│   │   ├── robots.txt
│   │   ├── sitemap.xml
│   │   └── assets/
│   ├── src/
│   │   ├── app/
│   │   ├── features/
│   │   ├── shared/
│   │   └── utils/
│   └── package.json
├── vercel.json
└── README.md
```

---

# Website Sitemap

The canonical production origin is:

```text
https://www.faretransit.com
```

The XML sitemap is available at:

```text
https://www.faretransit.com/sitemap.xml
```

## Core Public Pages

| Page | URL |
|---|---|
| Home | https://www.faretransit.com/ |
| Car Rentals | https://www.faretransit.com/car-rentals |
| Contact | https://www.faretransit.com/contact |
| Terms & Conditions | https://www.faretransit.com/terms |
| Privacy Policy | https://www.faretransit.com/privacy-policy |
| Refund Policy | https://www.faretransit.com/refund-policy |

## Travel Assistance Landing Pages

| Page | URL |
|---|---|
| Travel Assistance | https://www.faretransit.com/travel-assistance |
| Booking for Parents | https://www.faretransit.com/booking-for-parents |
| Urgent Travel | https://www.faretransit.com/urgent-travel |
| Senior Flight Assistance | https://www.faretransit.com/senior-travel/flight-deals |

## Flight Route Pages

| Route | URL |
|---|---|
| New York → Miami | https://www.faretransit.com/flight-nyc-to-mia |
| Los Angeles → New York | https://www.faretransit.com/flight-lax-to-jfk |
| New York → London | https://www.faretransit.com/routes/flight-nyc-to-lon |
| Los Angeles → Tokyo | https://www.faretransit.com/routes/flight-lax-to-tokyo |
| Miami → Paris | https://www.faretransit.com/routes/flight-mia-to-paris |
| Chicago → Frankfurt | https://www.faretransit.com/routes/flight-ord-to-fra |
| San Francisco → Sydney | https://www.faretransit.com/routes/flight-sfo-to-syd |
| New York → Dubai | https://www.faretransit.com/routes/flight-jfk-to-dxb |
| Dallas → London | https://www.faretransit.com/routes/flight-dfw-to-lhr |
| Boston → Dublin | https://www.faretransit.com/routes/flight-bos-to-dub |

## Train Route Pages

| Route | URL |
|---|---|
| New York → Washington, D.C. | https://www.faretransit.com/train-nyc-to-dc |
| Washington, D.C. → New York | https://www.faretransit.com/train-dc-to-nyc |
| Philadelphia → New York | https://www.faretransit.com/train-philly-to-nyc |
| Boston → New York | https://www.faretransit.com/train-boston-to-nyc |
| Chicago → St. Louis | https://www.faretransit.com/routes/train-chicago-to-stlouis |
| Los Angeles → San Diego | https://www.faretransit.com/routes/train-la-to-sandiego |
| Seattle → Portland | https://www.faretransit.com/routes/train-seattle-to-portland |
| New York → Albany | https://www.faretransit.com/routes/train-nyc-to-albany |

---

## Human-Readable Site Tree

```text
www.faretransit.com
│
├── /
│   ├── /travel-assistance
│   ├── /booking-for-parents
│   ├── /urgent-travel
│   └── /senior-travel/flight-deals
│
├── /car-rentals
│
├── Flight Routes
│   ├── /flight-nyc-to-mia
│   ├── /flight-lax-to-jfk
│   └── /routes/
│       ├── flight-nyc-to-lon
│       ├── flight-lax-to-tokyo
│       ├── flight-mia-to-paris
│       ├── flight-ord-to-fra
│       ├── flight-sfo-to-syd
│       ├── flight-jfk-to-dxb
│       ├── flight-dfw-to-lhr
│       └── flight-bos-to-dub
│
├── Train Routes
│   ├── /train-nyc-to-dc
│   ├── /train-dc-to-nyc
│   ├── /train-philly-to-nyc
│   ├── /train-boston-to-nyc
│   └── /routes/
│       ├── train-chicago-to-stlouis
│       ├── train-la-to-sandiego
│       ├── train-seattle-to-portland
│       └── train-nyc-to-albany
│
├── /contact
├── /terms
├── /privacy-policy
└── /refund-policy
```

---

# SEO and Google Indexing

The site includes a technical SEO layer designed to give search engines consistent crawl and indexing signals.

## Canonical Domain

All public SEO URLs use:

```text
https://www.faretransit.com
```

Non-canonical host variants are redirected to the canonical `www` host.

## Sitemap

The sitemap is stored at:

```text
frontend/public/sitemap.xml
```

Production URL:

```text
https://www.faretransit.com/sitemap.xml
```

Only public canonical pages intended for search indexing should be added to the sitemap.

## Robots.txt

Robots rules are stored at:

```text
frontend/public/robots.txt
```

Production URL:

```text
https://www.faretransit.com/robots.txt
```

## Metadata

Public landing pages use page-specific metadata where applicable, including:

- `<title>`
- Meta description
- Canonical URL
- Open Graph metadata
- Twitter metadata
- Robots directives
- Structured data / JSON-LD

The homepage includes structured data describing FareTransit as a travel-related business and website.

---

## Pages That Should Not Be Indexed

Transactional, account, customer-specific, and administrative pages are intentionally excluded from normal search indexing.

Examples include:

```text
/admin/*
/search
/payment
/booking
/authorize/*
/confirmation/*
/booking-confirmed/*
/my-bookings
/signin
/signup
/return-flight
/car-rentals/search
/car-rentals/results
```

These pages should **not** be added to `sitemap.xml`.

---

# Google Search Console

For Google indexing, the sitemap should be submitted in Google Search Console:

```text
https://www.faretransit.com/sitemap.xml
```

Recommended priority URLs for manual URL Inspection / Request Indexing:

```text
https://www.faretransit.com/
https://www.faretransit.com/travel-assistance
https://www.faretransit.com/senior-travel/flight-deals
https://www.faretransit.com/urgent-travel
https://www.faretransit.com/booking-for-parents
```

Google determines whether and when a page is indexed. A sitemap improves URL discovery but does not guarantee rankings or indexing.

---

# Local Development

## Frontend

```bash
cd frontend
npm install
npm start
```

The frontend development server uses the backend proxy configured in `frontend/package.json`.

## Backend

```bash
cd backend
npm install
npm run dev
```

Required production credentials and service configuration should be provided through environment variables. Do not commit private credentials or API keys to the repository.

---

# Testing

Run the backend production-readiness test suite with:

```bash
cd backend
npm test
```

or:

```bash
npm run verify:production-ready
```

The test suite includes checks for:

- Pre-production safety
- Google Ads lead conversion
- Admin booking workflow
- Admin dashboard button reliability
- Inquiry persistence
- SEO and indexing contracts

Build the frontend with:

```bash
cd frontend
npm run build
```

---

# Updating the Sitemap

When adding a new public SEO page:

1. Create the route and page content.
2. Give the page a unique title and meta description.
3. Add a self-referencing canonical URL.
4. Make sure the page is allowed to be indexed.
5. Add the canonical URL to `frontend/public/sitemap.xml`.
6. Update the `<lastmod>` value when the page receives a meaningful content update.
7. Run the production-readiness tests.
8. Deploy the site.
9. Request indexing in Google Search Console when appropriate.

Do **not** add admin, payment, authorization, search-result, account, or other private/transaction-specific URLs to the sitemap.

---

## Brand

**FareTransit**  
Website: https://www.faretransit.com/  
Support: support@faretransit.com
