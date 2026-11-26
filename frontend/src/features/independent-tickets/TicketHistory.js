import React,{useEffect,useState} from 'react';
import api,{getApiErrorMessage} from '../../shared/api/api';
const root='/admin/independent-tickets/v1';
const labels={all:'All statuses',draft:'Draft',queued:'Queued',processing:'Processing',sent:'Accepted by provider',delivered:'Delivered',opened:'Open detected',no_open:'No open detected',delivery_delayed:'Delayed',bounced:'Bounced',failed:'Failed',suppressed:'Suppressed',complained:'Spam complaint',uncertain:'Uncertain',pixel_open:'Open detected'};
const label=k=>labels[k]||k;
const date=v=>v?new Date(v).toLocaleString():'—';
const tone=k=>['opened','pixel_open','delivered'].includes(k)?'good':['failed','bounced','suppressed','complained'].includes(k)?'bad':['delivery_delayed','uncertain','queued','processing'].includes(k)?'warn':'neutral';
export function TicketActivity({delivery:d,compact=false}){
 const status=d.provider_status||d.status;
 return <div className="it-activity">
 <div className="it-activity-badges"><span className={'it-status it-'+tone(status)}>{label(status)}</span>{Number(d.open_count)>0?<span className="it-status it-good">Open detected</span>:d.status==='sent'&&<span className="it-status it-neutral">{d.open_tracking_available?'No open detected':'Open tracking unavailable for this send'}</span>}</div>
 <dl className="it-activity-facts"><div><dt>Sent / accepted</dt><dd>{date(d.sent_at)}</dd></div><div><dt>Delivered</dt><dd>{date(d.delivered_at)}</dd></div><div><dt>First detected open</dt><dd>{date(d.first_open_at)}</dd></div><div><dt>Last detected open</dt><dd>{date(d.last_open_at)}</dd></div><div><dt>Detected open events</dt><dd>{Number(d.open_count)||0}</dd></div><div><dt>Open detection source</dt><dd>{d.open_source==='resend'?'Resend':d.open_source==='faretransit'?'FareTransit image':'—'}</dd></div></dl>
 {d.events?.length>0&&<details><summary>Recent activity ({d.events.length})</summary><ol className="it-event-list">{d.events.map((e,i)=><li key={e.kind+e.occurred_at+i}><strong>{label(e.kind)}</strong><span>{date(e.occurred_at)} · {e.source==='resend'?'Resend':'FareTransit'}</span></li>)}</ol></details>}
 {!compact&&d.last_error&&<p role="status">{d.last_error}</p>}
 </div>;
}
export default function TicketHistory({refresh,busy,onOpen,onDownload}){
 const [search,setSearch]=useState(''),[status,setStatus]=useState('all'),[airline,setAirline]=useState(''),[from,setFrom]=useState(''),[to,setTo]=useState(''),[offset,setOffset]=useState(0),[reload,setReload]=useState(0);
 const [result,setResult]=useState(null),[error,setError]=useState(''),[loading,setLoading]=useState(false),[updated,setUpdated]=useState(null);
 useEffect(()=>{
  let active=true,inFlight=false;const load=async()=>{if(inFlight||document.hidden)return;inFlight=true;try{const r=await api.get(root+'/tickets',{params:{offset,search,status,airline,from:from||undefined,to:to||undefined}});if(active){setResult(r.data);setUpdated(new Date());setError('');}}catch(e){if(active)setError(getApiErrorMessage(e));}finally{inFlight=false;if(active)setLoading(false);}};
  setLoading(true);const timer=setTimeout(load,250),interval=setInterval(load,30000);
  const visible=()=>{if(!document.hidden)load();};document.addEventListener('visibilitychange',visible);
  return()=>{active=false;clearTimeout(timer);clearInterval(interval);document.removeEventListener('visibilitychange',visible);};
 },[offset,search,status,airline,from,to,reload,refresh]);
 const change=setter=>e=>{setter(e.target.value);setOffset(0);};
 const rows=result?.data||[],m=result?.metrics||{},total=result?.total||0;
 return <section className="it-card it-history" id="ticket-history">
 <header><div><h2>Ticket history</h2><p className="it-muted">Delivery & email activity · recipient-level tracking</p></div><button type="button" disabled={loading} onClick={()=>setReload(v=>v+1)}>Refresh history</button></header>
 <div className="it-history-metrics">{[['Matching tickets',total],['Email deliveries',m.recipients],['Delivered',m.delivered],['Open detected',m.opened],['Issues',m.failed]].map(([k,v])=><div key={k}><small>{k}</small><strong>{result?(v??0):'—'}</strong></div>)}</div>
 <div className="it-history-filters"><label>Search all tickets<input value={search} onChange={change(setSearch)} placeholder="Passenger, PNR, email, ticket ID, route" maxLength={200}/></label><label>Delivery / open status<select value={status} onChange={change(setStatus)}>{Object.entries(labels).filter(([k])=>k!=='pixel_open').map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label><label>Airline code<input value={airline} onChange={change(setAirline)} maxLength={3} placeholder="UA, AA..."/></label><label>Created from (UTC)<input type="date" value={from} onChange={change(setFrom)}/></label><label>Created through (UTC)<input type="date" value={to} onChange={change(setTo)}/></label></div>
 <p className="it-muted">{loading?'Refreshing…':updated?'Updated '+updated.toLocaleTimeString()+' · refreshes every 30 seconds while visible':'Loading history…'} · Opens are image requests, not verified reads or PDF views.</p>
 {result&&!result.providerWebhookConfigured&&<p className="it-history-note">FareTransit open detection is available for new e-ticket emails. Provider delivery and bounce events require the Resend webhook connection.</p>}
 {error&&<p role="alert" className="it-error">{error} {result?'Showing last loaded results.':''}</p>}
 {rows.map(t=><article className="it-history-ticket" key={t.id}><header><div><small className="it-history-ref">{t.reference}</small><h3>{t.passengers?.filter(Boolean).join(' · ')||t.summary?.passenger||'Draft'}</h3><p>{t.summary?.route||'No route entered'}</p></div><button disabled={busy} type="button" onClick={()=>onOpen(t.id)}>Open / recover</button></header>
 <div className="it-history-meta"><span>{t.source_booking_id?'Registered booking':'Manual entry'}</span><span>Revision {t.revision}</span><span>Created {date(t.created_at)}</span>{t.airlines?.length>0&&<span>{t.airlines.join(', ')}</span>}{t.references?.filter(r=>r.pnr).map((r,i)=><span key={i}>{r.carrier} PNR: {r.pnr}</span>)}</div>
 <div className="it-history-meta"><strong>{t.delivery_count} delivery records</strong><span>{t.deliveries?.filter(d=>Number(d.open_count)>0).length||0} detected opens among listed recipients</span></div>
 {t.delivery_count>0?<details><summary>View recipient activity</summary>{t.deliveries.map(d=><div className="it-recipient-activity" key={d.id}><div className="it-row"><strong>{d.recipient||'Recipient unavailable'}</strong><small>Revision {d.revision}{d.source_delivery_id?' · Original archived version':''}</small></div><TicketActivity delivery={d} compact/>{d.pdf_path&&<button disabled={busy} type="button" onClick={()=>onDownload({...d,ticket_reference:t.reference})}>Download original PDF</button>}</div>)}{t.delivery_count>t.deliveries.length&&<p className="it-muted">Showing newest {t.deliveries.length} delivery records.</p>}</details>:<p className="it-muted">Draft · no email deliveries</p>}</article>)}
 {!rows.length&&!loading&&!error&&<p>No matching tickets.</p>}
 <div className="it-row it-history-pagination"><button type="button" disabled={!offset||loading} onClick={()=>setOffset(Math.max(0,offset-25))}>Previous</button><small>{total?offset+1:0}–{Math.min(offset+rows.length,total)} of {total}</small><button type="button" disabled={offset+25>=total||loading} onClick={()=>setOffset(offset+25)}>Next</button></div>
 </section>;
}
