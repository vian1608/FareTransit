import React,{useEffect,useRef,useState} from 'react';
import {HistoryPagination,lastOffset} from './HistoryPagination';
import api,{getApiErrorMessage} from '../../shared/api/api';
const names={processing:'Sending',accepted:'Provider accepted',sent:'Sent',delivered:'Delivered',engaged:'Engagement detected',delivery_delayed:'Delayed',failed:'Failed',uncertain:'Uncertain',bounced:'Bounced',complained:'Complaint',suppressed:'Suppressed',opened:'Open detected',clicked:'Click detected'};
const time=v=>v?new Date(v).toLocaleString():'—';
const root=kind=>'/admin/customer-service-emails/'+kind;
export default function CustomerEmailHistory({kind,refreshVersion=0}){
 const [email,setEmail]=useState(''),[size,setSize]=useState(25);
 const top=useRef(null);
 const navigateOffset=value=>{setOffset(value);top.current?.scrollIntoView({block:'start'});};
 const [search,setSearch]=useState(''),[status,setStatus]=useState('all'),[from,setFrom]=useState(''),[to,setTo]=useState(''),[offset,setOffset]=useState(0),[rows,setRows]=useState([]),[total,setTotal]=useState(0),[loading,setLoading]=useState(true),[error,setError]=useState(''),[webhook,setWebhook]=useState(false),[detail,setDetail]=useState(null),[detailBusy,setDetailBusy]=useState(false),[detailError,setDetailError]=useState(''),[revision,setRevision]=useState(0);
 const seq=useRef(0),modal=useRef(null),detailSeq=useRef(0),listSeq=useRef(0);
 useEffect(()=>{
  let active=true;const request=++listSeq.current;setLoading(true);setError('');
  const timer=setTimeout(async()=>{
   try{const r=await api.get(root(kind),{params:{search,email,status,from:from||undefined,to:to||undefined,offset,limit:size}});if(active&&request===listSeq.current){if(offset>lastOffset(r.data.total||0,size)){setOffset(lastOffset(r.data.total||0,size));return;}setRows(r.data.data||[]);setTotal(r.data.total||0);setWebhook(Boolean(r.data.webhookConfigured));}}
   catch(e){if(active){setRows([]);setTotal(0);setError(getApiErrorMessage(e)||'Could not load email history.');}}
   finally{if(active)setLoading(false);}
  },250);
  return()=>{active=false;clearTimeout(timer);};
 },[kind,search,email,status,from,to,offset,size,refreshVersion,revision]);
 const filter=setter=>e=>{setter(e.target.value);setOffset(0);};
 const open=async id=>{
  const request=++detailSeq.current;setDetail(null);setDetailBusy(true);setDetailError('');if(!modal.current?.open)modal.current?.showModal();
  try{const r=await api.get(root(kind)+'/'+id);if(request===detailSeq.current)setDetail(r.data.data);}
  catch(e){if(request===detailSeq.current)setDetailError(getApiErrorMessage(e)||'Could not load the archived email.');}
  finally{if(request===detailSeq.current)setDetailBusy(false);}
 };
 const refresh=async id=>{
  if(detailBusy)return;const request=++seq.current;setDetailBusy(true);setDetailError('');
  try{await api.post(root(kind)+'/'+id+'/refresh',{});if(request===seq.current){setRevision(v=>v+1);await open(id);}}
  catch(e){if(request===seq.current)setDetailError(getApiErrorMessage(e)||'Could not refresh provider status.');}
  finally{if(request===seq.current)setDetailBusy(false);}
 };
 const close=()=>{detailSeq.current++;seq.current++;setDetailBusy(false);modal.current?.close();};
 return <section className="it-card it-history" ref={top} style={{marginTop:20}}>
 <div className="it-row" style={{justifyContent:'space-between',alignItems:'center'}}><div><h2>{kind==='refund'?'Refund email history':'Feedback email history'}</h2><p className="it-muted">{total} matching email attempt{total===1?'':'s'} · Newest first</p></div><button type="button" onClick={()=>setRevision(v=>v+1)}>Refresh history</button></div>
 <div className="it-history-filters">
 <label>Search by recipient email<input type="search" value={email} onChange={filter(setEmail)} placeholder="Email address or domain" maxLength={254}/></label>
 <label>Search all records<input value={search} onChange={filter(setSearch)} placeholder={kind==='refund'?'Email, passenger, last four, amount':'Recipient or provider ID'}/></label>
 <label>Delivery status<select value={status} onChange={filter(setStatus)}><option value="all">All statuses</option>{Object.entries(names).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
 <label>From (UTC)<input type="date" value={from} max={to||undefined} onChange={filter(setFrom)}/></label><label>To (UTC)<input type="date" value={to} min={from||undefined} onChange={filter(setTo)}/></label>
 </div>
 <p className="it-muted">{webhook?'Provider events are enabled if the Resend webhook subscription is active.':'Automatic provider events are not configured. Refresh individual messages to check provider status if API read access is available.'} First-party open detection is available for these emails. Open and click detection is not proof of a human reading the email or leaving a review.</p>
 {error?<p role="alert" className="it-error">{error}</p>:loading?<p role="status">Loading email history…</p>:!rows.length?<p>No matching email attempts.</p>:<div className="it-history-list">{rows.map((row,i)=><details className="it-history-entry" key={row.id}><summary><span className="it-history-serial">{offset+i+1}</span><span className="it-history-main"><strong>{row.recipient}</strong><small>{kind==='refund'?(row.details?.passengerName||'—')+' · '+(row.details?.amount||'—')+' USD':row.subject}</small></span><span className="it-history-summary-meta"><strong>{names[row.status]||row.status}</strong><small>{row.open_count||0} opens · {row.click_count||0} clicks</small><small>{time(row.created_at)}</small></span><span className="it-history-arrow" aria-hidden="true">⌄</span></summary><div className="it-history-expanded"><div className="it-history-meta"><span>Sent by: {row.actor}</span>{kind==='refund'&&<><span>Cardholder: {row.details?.cardholderName||'—'}</span><span>{row.details?.cardBrand||'Card'} •••• {row.details?.last4||'—'}</span></>}{row.provider_id&&<span>Provider ID: {row.provider_id}</span>}</div>{row.last_error&&<p role="status" className="it-error">{row.last_error}</p>}<button type="button" onClick={()=>open(row.id)}>View details & archived email</button></div></details>)}</div>}
 <HistoryPagination total={total} offset={offset} size={size} loading={loading} onOffset={navigateOffset} onSize={n=>{setSize(n);setOffset(0);}}/>
 <dialog ref={modal} onCancel={close} style={{width:'min(850px,94vw)',maxHeight:'90vh',overflowY:'auto',border:'1px solid #dce3ec',borderRadius:12,padding:20}}><div className="it-row" style={{justifyContent:'space-between'}}><h2>Email details</h2><button type="button" onClick={close}>Close</button></div>
 {detailError&&<p className="it-error" role="alert">{detailError}</p>}{detailBusy&&<p role="status">Loading or refreshing…</p>}
 {detail&&<><p><strong>{detail.subject}</strong></p><dl>{[['Recipient',detail.recipient],['Delivery status',names[detail.status]||detail.status],['Submitted',time(detail.created_at)],['Provider accepted',time(detail.accepted_at)],['Provider reference',detail.provider_id],['Sent by',detail.actor],...(kind==='refund'?[['Passenger',detail.details?.passengerName],['Cardholder',detail.details?.cardholderName],['Payment card',detail.details?.cardBrand+' •••• '+detail.details?.last4],['Confirmed refund amount',detail.details?.amount+' USD'],['Refund processing verified by operator',detail.details?.refundProcessed?'Yes':'No']]:[])].map(([k,v])=><div key={k} style={{display:'grid',gridTemplateColumns:'minmax(110px,1fr) 2fr',gap:10,borderBottom:'1px solid #e5e9ef',padding:'8px 0'}}><dt>{k}</dt><dd style={{margin:0,overflowWrap:'anywhere'}}>{v||'—'}</dd></div>)}</dl>
 <button type="button" disabled={detailBusy||!detail.provider_id} onClick={()=>refresh(detail.id)}>Check provider status</button>
 <h3>Activity timeline</h3><p>{time(detail.created_at)} — Send attempt recorded</p>{detail.accepted_at&&<p>{time(detail.accepted_at)} — Accepted by provider</p>}{detail.last_error&&<p role="status">{detail.last_error}</p>}{(detail.events||[]).map((e,i)=><p key={i}>{time(e.occurred_at)} — {names[e.kind]||e.kind} ({e.source==='provider_status'?'observed on status check':e.source==='faretransit'?'email image loaded':'verified provider event'})</p>)}
 <h3>Archived email</h3><iframe title="Archived customer service email" sandbox="" referrerPolicy="no-referrer" srcDoc={detail.html.replaceAll('https://www.faretransit.com/assets/refund-cards/',window.location.origin+'/assets/refund-cards/')} style={{width:'100%',height:1050,border:'1px solid #dce3ec',borderRadius:10}}/>
 </>}</dialog></section>;
}
