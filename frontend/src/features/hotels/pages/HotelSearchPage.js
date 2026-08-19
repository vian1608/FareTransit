import React, { useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import HeroSlider from '../../../shared/components/HeroSlider';
import ProductSearchCard from '../../../shared/components/ProductSearchCard';
import SeamlessAdvisorySection from '../../../shared/components/SeamlessAdvisorySection';
import hotelApi from '../hotelApi';
import './HotelSearchPage.css';

const day = (offset) => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
};

const hotelHeroSlides = [
  {
    id: 'hotel-search-1',
    eyebrow: 'FareTransit — Hotel Search & Booking Assistance',
    title: 'Search Hotels. Keep Every Request Trackable.',
    lead: 'Compare live hotel options and send your selected stay directly into our travel team workflow.',
    image: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1800&q=80'
  },
  {
    id: 'hotel-search-2',
    eyebrow: 'Hotels, Resorts & Vacation Stays',
    title: 'Find the Right Stay for Your Trip',
    lead: 'Search by destination, dates and guests, then request the property you want without losing the booking trail.',
    image: 'https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?auto=format&fit=crop&w=1800&q=80'
  }
];

const heroOffer = {
  label: 'LIVE SEARCH',
  highlight: 'Google Hotels results',
  detail: 'Booking requests are handled by FareTransit'
};

function buildSearchFromParams(params) {
  return {
    q: params.get('q') || '',
    check_in_date: params.get('check_in_date') || day(7),
    check_out_date: params.get('check_out_date') || day(8),
    adults: params.get('adults') || '2',
    children: params.get('children') || '0',
    children_ages: params.get('children_ages') || '',
    currency: params.get('currency') || 'USD',
    rating: params.get('rating') || '',
    hotel_class: params.get('hotel_class') || '',
    sort_by: params.get('sort_by') || '',
    free_cancellation: params.get('free_cancellation') || ''
  };
}

function SearchForm({ value, onChange, onSubmit, busy }) {
  const update = (key, nextValue) => onChange({ ...value, [key]: nextValue });
  return (
    <form className="hotel-search-form" onSubmit={onSubmit}>
      <div className="hotel-search-grid">
        <label className="hotel-field hotel-field--destination">
          <span>Destination or hotel</span>
          <input required value={value.q} onChange={(e) => update('q', e.target.value)} placeholder="Bali Resorts, Miami Beach, Hilton…" />
        </label>
        <label className="hotel-field">
          <span>Check in</span>
          <input required type="date" min={day(0)} value={value.check_in_date} onChange={(e) => update('check_in_date', e.target.value)} />
        </label>
        <label className="hotel-field">
          <span>Check out</span>
          <input required type="date" min={value.check_in_date || day(0)} value={value.check_out_date} onChange={(e) => update('check_out_date', e.target.value)} />
        </label>
        <label className="hotel-field">
          <span>Adults</span>
          <select value={value.adults} onChange={(e) => update('adults', e.target.value)}>{[1,2,3,4,5,6,7,8].map((n)=><option key={n} value={n}>{n}</option>)}</select>
        </label>
        <label className="hotel-field">
          <span>Children</span>
          <select value={value.children} onChange={(e) => update('children', e.target.value)}>{[0,1,2,3,4,5,6].map((n)=><option key={n} value={n}>{n}</option>)}</select>
        </label>
        {Number(value.children) > 0 && <label className="hotel-field hotel-field--ages"><span>Children ages</span><input value={value.children_ages} onChange={(e) => update('children_ages', e.target.value)} placeholder="5,8" /></label>}
        <label className="hotel-field"><span>Currency</span><select value={value.currency} onChange={(e) => update('currency', e.target.value)}><option>USD</option><option>EUR</option><option>GBP</option><option>CAD</option><option>AUD</option><option>INR</option></select></label>
        <label className="hotel-field"><span>Rating</span><select value={value.rating} onChange={(e) => update('rating', e.target.value)}><option value="">Any</option><option value="7">3.5+</option><option value="8">4.0+</option><option value="9">4.5+</option></select></label>
        <label className="hotel-field"><span>Hotel class</span><select value={value.hotel_class} onChange={(e) => update('hotel_class', e.target.value)}><option value="">Any</option><option value="3">3-star</option><option value="4">4-star</option><option value="5">5-star</option></select></label>
        <label className="hotel-field"><span>Sort</span><select value={value.sort_by} onChange={(e) => update('sort_by', e.target.value)}><option value="">Relevance</option><option value="3">Lowest price</option><option value="8">Highest rating</option><option value="13">Most reviewed</option></select></label>
        <label className="hotel-field hotel-field--check"><input type="checkbox" checked={value.free_cancellation === 'true'} onChange={(e) => update('free_cancellation', e.target.checked ? 'true' : '')}/><span>Free cancellation</span></label>
      </div>
      <button className="hotel-search-button" disabled={busy}>{busy ? 'Searching…' : 'Search Hotels'}</button>
    </form>
  );
}

function BookingRequestModal({ property, search, onClose, onCreated }) {
  const [form, setForm] = useState({ firstName:'', lastName:'', email:'', phone:'', rooms:'1' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      const clientRequestId = window.crypto?.randomUUID ? window.crypto.randomUUID() : `hotel-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const result = await hotelApi.requestBooking({
        clientRequestId,
        propertyToken: property.propertyToken,
        propertyName: property.name,
        rooms: Number(form.rooms || 1),
        customer: { firstName: form.firstName, lastName: form.lastName, email: form.email, phone: form.phone },
        search
      });
      onCreated(result);
    } catch (err) { setError(err.message || 'Unable to submit hotel request.'); }
    finally { setSaving(false); }
  };
  return <div className="hotel-modal-backdrop" role="presentation" onMouseDown={(e)=>{if(e.target===e.currentTarget)onClose();}}>
    <div className="hotel-modal" role="dialog" aria-modal="true" aria-label={`Request ${property.name}`}>
      <button type="button" className="hotel-modal-close" onClick={onClose} aria-label="Close">×</button>
      <h2>Request {property.name}</h2>
      <p className="hotel-muted">This creates a trackable request for our travel team. It is not marked confirmed until supplier confirmation is received.</p>
      {error && <div className="hotel-alert hotel-alert--error">{error}</div>}
      <form onSubmit={submit} className="hotel-booking-form">
        <div className="hotel-booking-grid">
          <label><span>First name</span><input required value={form.firstName} onChange={(e)=>setForm({...form,firstName:e.target.value})}/></label>
          <label><span>Last name</span><input required value={form.lastName} onChange={(e)=>setForm({...form,lastName:e.target.value})}/></label>
          <label><span>Email</span><input required type="email" value={form.email} onChange={(e)=>setForm({...form,email:e.target.value})}/></label>
          <label><span>Phone</span><input value={form.phone} onChange={(e)=>setForm({...form,phone:e.target.value})}/></label>
          <label><span>Rooms</span><select value={form.rooms} onChange={(e)=>setForm({...form,rooms:e.target.value})}>{[1,2,3,4,5].map(n=><option key={n}>{n}</option>)}</select></label>
        </div>
        <button className="hotel-search-button" disabled={saving}>{saving ? 'Creating CRM request…' : 'Submit Hotel Request'}</button>
      </form>
    </div>
  </div>;
}

function HotelCard({ property, onRequest }) {
  return <article className="hotel-result-card">
    <div className="hotel-result-image">{property.image ? <img src={property.image} alt="" loading="lazy"/> : <div className="hotel-image-placeholder"><i className="fas fa-hotel"/></div>}</div>
    <div className="hotel-result-content">
      <div className="hotel-result-heading"><div><div className="hotel-class">{property.hotelClass || property.type || 'Hotel'}</div><h2>{property.name}</h2></div>{property.overallRating && <div className="hotel-rating"><strong>{property.overallRating.toFixed(1)}</strong><span>{property.reviews ? `${property.reviews.toLocaleString()} reviews` : 'Guest rating'}</span></div>}</div>
      {property.description && <p className="hotel-description">{property.description}</p>}
      {property.amenities?.length > 0 && <div className="hotel-amenities">{property.amenities.slice(0,5).map((item)=><span key={item}>{item}</span>)}</div>}
      <div className="hotel-result-footer"><div className="hotel-price"><span>From</span><strong>{property.ratePerNight?.lowest || 'Price on request'}</strong><small>{property.totalRate?.lowest ? `${property.totalRate.lowest} total` : 'per night'}</small></div><button className="hotel-request-button" onClick={()=>onRequest(property)} disabled={!property.propertyToken}>Request Booking</button></div>
    </div>
  </article>;
}

export default function HotelSearchPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [form, setForm] = useState(() => buildSearchFromParams(params));
  const [results, setResults] = useState([]);
  const [nextPageToken, setNextPageToken] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);
  const [created, setCreated] = useState(null);

  const searchFromUrl = useMemo(() => buildSearchFromParams(params), [params]);
  const hasSearch = Boolean(params.get('q') && params.get('check_in_date') && params.get('check_out_date'));

  useEffect(() => { setForm(searchFromUrl); }, [searchFromUrl]);

  useEffect(() => {
    if (!hasSearch) { setResults([]); return; }
    let live = true;
    setLoading(true); setError(''); setCreated(null);
    hotelApi.search(searchFromUrl).then((data) => {
      if (!live) return;
      setResults(data?.properties || []);
      setNextPageToken(data?.nextPageToken || null);
    }).catch((err) => { if (live) setError(err.message || 'Hotel search failed.'); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [hasSearch, location.search]);

  const submitSearch = (e) => {
    e.preventDefault();
    if (form.check_out_date <= form.check_in_date) { setError('Check-out date must be after check-in date.'); return; }
    const next = new URLSearchParams();
    Object.entries(form).forEach(([key,value])=>{if(value!=='' && value!==null && value!==undefined)next.set(key,String(value));});
    navigate(`/hotels/results?${next.toString()}`);
  };

  const loadMore = async () => {
    if (!nextPageToken || loadingMore) return;
    setLoadingMore(true); setError('');
    try {
      const data = await hotelApi.search({ ...searchFromUrl, next_page_token: nextPageToken });
      setResults((prev)=>[...prev,...(data?.properties||[])]);
      setNextPageToken(data?.nextPageToken || null);
    } catch (err) { setError(err.message || 'Unable to load more hotels.'); }
    finally { setLoadingMore(false); }
  };

  const onCreated = (record) => { setSelected(null); setCreated(record); };

  return <div className="hotel-page">
    <Helmet>
      <title>Hotel Search & Booking Assistance | FareTransit</title>
      <meta name="description" content="Search hotels and resorts by destination and dates, then submit a trackable hotel booking request to FareTransit travel team."/>
      <link rel="canonical" href="https://www.faretransit.com/hotels"/>
    </Helmet>
    <HeroSlider slides={hotelHeroSlides} variant="flights" serviceNavActive="hotels" offerTag={heroOffer}/>
    <section className="hotel-search-section">
      <div className="container">
        <ProductSearchCard
          theme="hotels"
          eyebrow="Find a stay"
          title="Search Hotels"
          trustIcon="fas fa-hotel"
          trustText="Live hotel search. Trackable reservation requests."
        >
          <SearchForm value={form} onChange={setForm} onSubmit={submitSearch} busy={loading}/>
        </ProductSearchCard>
      </div>
    </section>
    <section className="hotel-results-section"><div className="container">
      {created && <div className="hotel-alert hotel-alert--success"><strong>Request received.</strong> Hotel reference <b>{created.hotelCode}</b> · CRM lead <b>{created.leadCode}</b>. Our team can now track this request end-to-end.</div>}
      {error && <div className="hotel-alert hotel-alert--error">{error}</div>}
      {loading && <div className="hotel-loading"><i className="fas fa-circle-notch fa-spin"/> Searching live hotel options…</div>}
      {!loading && hasSearch && <div className="hotel-results-header"><div><span className="hotel-eyebrow">Search results</span><h2>Hotels for {searchFromUrl.q}</h2><p>{searchFromUrl.check_in_date} to {searchFromUrl.check_out_date} · {searchFromUrl.adults} adult{Number(searchFromUrl.adults)!==1?'s':''}</p></div><strong>{results.length} shown</strong></div>}
      {!loading && hasSearch && results.length===0 && !error && <div className="hotel-empty">No matching hotels were returned. Try broader filters or another destination.</div>}
      <div className="hotel-results-list">{results.map((property,index)=><HotelCard key={`${property.propertyToken||property.name}-${index}`} property={property} onRequest={setSelected}/>)}</div>
      {nextPageToken && <div className="hotel-load-more-wrap"><button className="hotel-load-more" onClick={loadMore} disabled={loadingMore}>{loadingMore?'Loading…':'Show More Hotels'}</button></div>}
    </div></section>
    <SeamlessAdvisorySection variant="flight"/>
    {selected && <BookingRequestModal property={selected} search={searchFromUrl} onClose={()=>setSelected(null)} onCreated={onCreated}/>} 
  </div>;
}
