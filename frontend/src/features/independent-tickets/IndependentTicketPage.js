import {reconcileSeats,setPassengerSeat} from './seatAssignments';
import PassengerSeatFields from './PassengerSeatFields';
import TicketHistory,{TicketActivity} from './TicketHistory';
import {parseBaggageAllowance,formatBaggageAllowance} from './baggageAllowance';
import React,{useEffect,useRef,useState} from 'react';
import api,{getApiErrorMessage} from '../../shared/api/api';
import {parseGdsLine} from '../../shared/utils/gdsItineraryHelper';
import AirlineLogo from '../../shared/components/AirlineLogo';
import './IndependentTicket.css';
const root='/admin/independent-tickets/v1';
const persistenceEnabled=process.env.REACT_APP_INDEPENDENT_TICKET_PERSISTENCE_ENABLED==='true';
const sendingEnabled=persistenceEnabled&&process.env.REACT_APP_INDEPENDENT_TICKET_EMAIL_ENABLED==='true';
const blank=()=>({customer:{name:'',email:'',phone:''},passengers:[{name:'',ticketNumber:''}],references:[],segments:[],gds:{outbound:'',inbound:''},payment:{show:false,merchants:[]},notes:'',verified:false,documentType:'itinerary'});
const newSegment=direction=>({direction,carrier:'',flight:'',from:'',to:'',departureDate:'',arrivalDate:'',departureTime:'',arrivalTime:'',cabin:'',operatingCarrier:'',baggage:''});
const newMerchant=()=>({merchant:'',amount:'',currency:'USD',cardBrand:'',cardLast4:'',status:'pending'});
const sample='01 UA 556 Y 15SEP EWRIAH 1045 1336 NN1 ARR=2027-09-15';
const prompt='Convert the attached Google Flights screenshot to FareTransit GDS-style lines. Use this exact format: '+sample+'. Separate outbound and inbound in your response. Include every connecting segment. Preserve carrier, flight number, date, airport codes, and local departure/arrival times. For missing class/status, use X and NN1 as unverified placeholders, not actual reservation status. List missing information separately for human review; never invent PNR, ticket number, flight times, or dates. Append ARR=YYYY-MM-DD to EACH line when the actual local arrival date is visible or explicitly supplied (including overnight flights); omit ARR= when unknown. Use the actual travel year, not the example year. Never infer arrival dates from clock times alone. Paste only the GDS lines into the matching journey box.';
const validDate=s=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;
const validTime=s=>/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(s);
export function parseJourney(text,year,direction){
 if(!/^\d{4}$/.test(String(year)))throw Error('Enter a four-digit travel year.');
 const lines=text.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
 if(!lines.length)throw Error('Enter '+direction+' GDS lines.');
 return lines.map((line,i)=>{
  const arrivalMatch=line.match(/\s+ARR=(\d{4}-\d{2}-\d{2})$/i);
  const arrivalDate=arrivalMatch?arrivalMatch[1]:'';
  if(arrivalDate&&!validDate(arrivalDate))throw Error(direction+' line '+(i+1)+': invalid ARR arrival date.');
  const gdsLine=arrivalMatch?line.slice(0,arrivalMatch.index):line;
  // Reject incomplete lines before the shared parser can insert its legacy defaults.
  if(!/^\d{1,2}[ .:]+[A-Z0-9]{2,3}\s+\d{1,4}[A-Z]?\s+[A-Z]\s+(?:\d{1,2}[A-Z]{3}|\d{4}-\d{2}-\d{2})\s+[A-Z]{6}\s+\d{4}\s+\d{4}\s+[A-Z0-9]+$/i.test(gdsLine))throw Error(direction+' line '+(i+1)+': use the documented complete GDS format.');
  const p=parseGdsLine(gdsLine,year,i+1);
  if(!p?.success||!validDate(p.departure_date)||!validTime(p.departure_time)||!validTime(p.arrival_time))throw Error(direction+' line '+(i+1)+': invalid date or time.');
  return {...newSegment(direction),carrier:p.carrier_code,flight:p.flight_number,from:p.origin_airport,to:p.destination_airport,departureDate:p.departure_date,arrivalDate,departureTime:p.departure_time,arrivalTime:p.arrival_time};
 });
}
function Field({label,value,onChange,type='text',maxLength,disabled=false}){return <label>{label}<input type={type} value={value||''} maxLength={maxLength} disabled={disabled} onChange={e=>onChange(e.target.value)}/></label>;}
function Choice({label,value,onChange,options}){return <label>{label}<select value={value} onChange={e=>onChange(e.target.value)}>{options.map(o=><option key={o[0]} value={o[0]}>{o[1]}</option>)}</select></label>;}
const bagCountOptions=[['','Not specified'],['0','None'],...Array.from({length:9},(_,i)=>[String(i+1),String(i+1)])];
function BaggageAllowance({value,onChange,segmentNumber}){
 const parsed=parseBaggageAllowance(value);
 const change=(key,next)=>{
  const carry=key==='carryOn'?next:parsed.carryOn;
  const checked=key==='checked'?next:parsed.checked;
  if(parsed.custom&&!window.confirm('Replace the existing baggage details with the selected allowance?'))return;
  onChange(formatBaggageAllowance(carry,checked));
 };
 return <div className="it-baggage" role="group" aria-label={'Baggage allowance for segment '+segmentNumber}>
  <div className="it-baggage-header"><strong>Baggage allowance</strong><small>Per passenger, for this flight segment</small></div>
  {parsed.custom&&<div className="it-baggage-existing"><small>Existing baggage details (preserved until changed)</small><Field label="Imported / custom baggage details" value={value} maxLength={100} onChange={onChange}/></div>}
  <div className="it-baggage-grid">
   <Choice label="Carry-on bags" value={parsed.carryOn} onChange={v=>change('carryOn',v)} options={bagCountOptions}/>
   <Choice label="Checked bags" value={parsed.checked} onChange={v=>change('checked',v)} options={bagCountOptions}/>
   <div className="it-baggage-actions">
    <button type="button" onClick={()=>{if(!parsed.custom||window.confirm('Replace the existing baggage details?'))onChange(formatBaggageAllowance('0','0'));}}>No carry-on / checked bags</button>
    <button type="button" onClick={()=>{if(!parsed.custom||window.confirm('Clear the existing baggage details?'))onChange('');}}>Not specified</button>
   </div>
  </div>
  <small className="it-baggage-summary">{value?'Ticket display: '+value:'Baggage section hidden until specified.'} Verify the allowance with the supplier; personal items are not specified here.</small>
 </div>;
}
function Importer({initial,onApply,onClose}){
 const [out,setOut]=useState(true),[inb,setIn]=useState(Boolean(initial?.inbound)),[ot,setOT]=useState(initial?.outbound||''),[it,setIT]=useState(initial?.inbound||''),[oy,setOY]=useState(String(new Date().getFullYear())),[iy,setIY]=useState(String(new Date().getFullYear())),[help,setHelp]=useState(false),[err,setErr]=useState('');
 function apply(){try{if(!out&&!inb)throw Error('Select a journey.');const result=[...(out?parseJourney(ot,oy,'outbound'):[]),...(inb?parseJourney(it,iy,'inbound'):[])];if(result.length>60)throw Error('Maximum 60 segments.');onApply(result,{outbound:out?ot:'',inbound:inb?it:''});}catch(e){setErr(e.message);}}
 return <div className="it-overlay"><section role="dialog" aria-modal="true" aria-label="GDS itinerary import" className="it-modal"><header><h2>GDS itinerary import</h2><button type="button" onClick={()=>setHelp(!help)} aria-label="GDS import help">ⓘ</button><button type="button" onClick={onClose}>Close</button></header>
 {help&&<aside><p><strong>Sample command</strong></p><pre>{sample}</pre><p>To convert a Google Flights screenshot, copy this prompt and use it with GPT outside the CRM.</p><pre>{prompt}</pre><button type="button" onClick={()=>navigator.clipboard.writeText(prompt).catch(()=>setErr('Copy failed; select the prompt manually.'))}>Copy conversion prompt</button></aside>}
 <div className="it-row"><label><input type="checkbox" checked={out} onChange={e=>setOut(e.target.checked)}/> Outbound</label><label><input type="checkbox" checked={inb} onChange={e=>setIn(e.target.checked)}/> Inbound</label></div>
 <p>{out&&inb?'Round trip':out?'One way':inb?'Inbound only':'Select at least one direction'}</p>
 {out&&<><Field label="Outbound travel year" value={oy} onChange={setOY}/><label>Outbound GDS lines<textarea rows={5} value={ot} onChange={e=>setOT(e.target.value)}/></label></>}
 {inb&&<><Field label="Inbound travel year" value={iy} onChange={setIY}/><label>Inbound GDS lines<textarea rows={5} value={it} onChange={e=>setIT(e.target.value)}/></label></>}
 {err&&<p role="alert" className="it-error">{err}</p>}<p>Include ARR=YYYY-MM-DD for each verified arrival date. If omitted, confirm the date in the editor. GDS input does not prove a reservation is confirmed.</p><button className="it-primary" type="button" onClick={apply} disabled={!out&&!inb}>Parse & import</button></section></div>;
}
function RecipientFields({values,onChange,max=5,label='Additional email addresses'}){
 return <div className="it-record"><strong>{label}</strong><p>Each recipient receives a separate private email. Other recipient addresses are not disclosed.</p>
 {values.map((value,i)=><div className="it-row" key={i}><Field label={'Email '+(i+1)} type="email" value={value} onChange={v=>onChange(values.map((x,j)=>j===i?v:x))} maxLength={254}/><button type="button" onClick={()=>onChange(values.filter((_,j)=>j!==i))}>Remove</button></div>)}
 <button type="button" disabled={values.length>=max} onClick={()=>onChange([...values,''])}>+ Add email address</button><small> Up to {max} additional address{max===1?'':'es'} in this request.</small></div>;
}
const validAddress=v=>typeof v==='string'&&v.length<=254&&/^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(v.trim());
export default function IndependentTicketPage(){
 const [service,setService]=useState(''),[mode,setMode]=useState(''),[bid,setBid]=useState(''),[source,setSource]=useState(null),[sourceRef,setSourceRef]=useState(''),[draft,setDraft]=useState(blank),[record,setRecord]=useState(null),[deliveries,setDeliveries]=useState([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[preview,setPreview]=useState(null),[showGds,setShowGds]=useState(false),[confirm,setConfirm]=useState(false);
 const [extraEmails,setExtraEmails]=useState([]),[forward,setForward]=useState(null),[forwardEmails,setForwardEmails]=useState(['']),[forwardVerified,setForwardVerified]=useState(false);
 const changeExtras=v=>{setExtraEmails(v);setConfirm(false);};
 const resetRecipients=()=>{setExtraEmails([]);setForward(null);setForwardEmails(['']);setForwardVerified(false);};
 const lock=useRef(false);
 const [historyRefresh,setHistoryRefresh]=useState(0);
 const loadHistory=()=>setHistoryRefresh(v=>v+1);
 useEffect(()=>{
  if(!persistenceEnabled||!record?.id)return undefined;
  let active=true,inFlight=false;const refresh=async()=>{if(document.hidden||inFlight)return;inFlight=true;try{const r=await api.get(root+'/tickets/'+record.id);if(active)setDeliveries(r.data.deliveries||[]);}catch{/* Retain prior delivery details; never reset the editor. */}finally{inFlight=false;}};
  const timer=setInterval(refresh,30000);return()=>{active=false;clearInterval(timer);};
 },[record?.id]);
 const run=async(fn)=>{if(lock.current)return;lock.current=true;setBusy(true);setError('');setNotice('');try{await fn();}catch(e){setError(e.userMessage||e.response?.data?.error?.message||e.message);}finally{lock.current=false;setBusy(false);}};
 const update=fn=>{setDraft(d=>({...reconcileSeats(fn(d)),verified:false}));setPreview(null);setConfirm(false);};
 const patch=(key,value)=>update(d=>({...d,[key]:value}));
 const changeCustomer=(key,value)=>update(d=>({...d,customer:{...d.customer,[key]:value}}));
 const changeRow=(key,i,field,value)=>update(d=>({...d,[key]:d[key].map((r,j)=>i===j?{...r,[field]:value,...(key==='passengers'&&field==='name'&&r.name!==value?{seats:[]}: {})}:r)}));
 const removeRow=(key,i)=>update(d=>({...d,[key]:d[key].filter((_,j)=>i!==j)}));
 const changeMerchant=(i,key,value)=>update(d=>({...d,payment:{...d.payment,merchants:d.payment.merchants.map((m,j)=>j===i?{...m,[key]:value}:m)}}));
 const clear=()=>{resetRecipients();setService('flight');setMode('manual');setShowGds(false);setBid('');setSource(null);setSourceRef('');setRecord(null);setDraft(blank());setPreview(null);setDeliveries([]);setConfirm(false);setError('');setNotice('');};
 const selectMode=m=>{resetRecipients();setMode(m);setSource(null);setSourceRef('');setRecord(null);setDraft(blank());setPreview(null);setDeliveries([]);setConfirm(false);};
 const fetchBooking=()=>run(async()=>{if(!bid.trim())throw Error('Enter booking ID.');const r=await api.get(root+'/bookings/'+encodeURIComponent(bid.trim()));resetRecipients();setDeliveries([]);setDraft(r.data.data);setSource(r.data.sourceBookingId);setSourceRef(r.data.reference||'');setRecord(null);setPreview(null);setConfirm(false);setNotice('Booking imported into independent draft. Original booking remains unchanged.');});
 const saveDraft=async()=>{if(record&&JSON.stringify(record.draft)===JSON.stringify(draft))return record;const r=record?await api.patch(root+'/tickets/'+record.id,{revision:record.revision,data:draft}):await api.post(root+'/tickets',{sourceBookingId:source,data:draft});setRecord(r.data.data);setDraft(r.data.data.draft);await loadHistory();return r.data.data;};
 const save=()=>run(async()=>{await saveDraft();setNotice('Draft saved.');});
 const makePreview=()=>run(async()=>{const r=await api.post(root+'/preview',{data:draft});setPreview(r.data);setConfirm(false);});
 const processBatch=async(items,ticketId)=>{
  const results=[];
  // Each delivery is durable before any request to Resend. The worker claims one at a time.
  for(const item of items){
   if(item.existing&&item.status!=='queued'&&item.status!=='processing'){results.push(item);continue;}
   try{const r=await api.post(root+'/deliveries/'+item.id+'/process',{}, {timeout:60000});results.push({...item,status:r.data.data?.status||'unknown'});}
   catch{results.push({...item,status:'unknown'});}
  }
  const counts={};for(const item of results)counts[item.status]=(counts[item.status]||0)+1;
  const message='Delivery results: '+Object.entries(counts).map(([status,count])=>count+' '+(status==='sent'?'accepted by email provider':status)).join(' · ')+'. Previously submitted addresses are not sent again. Check history for pending or failed deliveries.';
  setNotice(message);
  try{const h=await api.get(root+'/tickets/'+ticketId);setDeliveries(h.data.deliveries||[]);}catch{setNotice(message+' History refresh failed; reopen the saved ticket.');}
  await loadHistory();
 };
 const processDelivery=(id,ticketId)=>processBatch([{id}],ticketId);
 const send=()=>run(async()=>{
  if(!confirm||!draft.verified||!preview||preview.errors.length||extraEmails.some(v=>!validAddress(v)))throw Error('Review and approve the preview and all recipient addresses first.');
  const saved=await saveDraft();
  const r=await api.post(root+'/tickets/'+saved.id+'/send',{revision:saved.revision,additionalRecipients:extraEmails.map(v=>v.trim()),recipientsVerified:true});
  setConfirm(false);setPreview(null);setExtraEmails([]);setNotice('Ticket saved. Processing individual deliveries…');
  await processBatch(r.data.deliveries||[{id:r.data.data}],saved.id);
 });
 const beginForward=delivery=>{setForward(delivery.id);setForwardEmails(['']);setForwardVerified(false);};
 const forwardTicket=()=>run(async()=>{
  if(!forward||!forwardVerified||!forwardEmails.length||forwardEmails.some(v=>!validAddress(v)))throw Error('Verify the new recipient addresses and passenger authorization.');
  const r=await api.post(root+'/deliveries/'+forward+'/add-recipients',{recipients:forwardEmails.map(v=>v.trim()),recipientsVerified:true});
  setForward(null);setForwardEmails(['']);setForwardVerified(false);setNotice('Original archived ticket saved for additional recipients…');
  await processBatch(r.data.deliveries,record.id);
 });
 const openTicket=id=>run(async()=>{const r=await api.get(root+'/tickets/'+id);const t=r.data.data;resetRecipients();setService('flight');setMode(t.source_booking_id?'booking':'manual');setRecord(t);setSource(t.source_booking_id);setSourceRef('');setBid(t.source_booking_id||'');setDraft(t.draft);setDeliveries(r.data.deliveries||[]);setPreview(null);setConfirm(false);setNotice('Ticket recovered. Previous delivery snapshots remain unchanged.');});
 const retry=id=>run(async()=>{await api.post(root+'/deliveries/'+id+'/retry');setNotice('Retry queued.');await processDelivery(id,record.id);});
 const processQueued=id=>run(async()=>{setNotice('Checking and processing queued delivery…');await processDelivery(id,record.id);});
 const recoverVersion=delivery=>run(async()=>{const r=await api.get(root+'/deliveries/'+delivery.id);if(r.data.data.ticket_id!==record.id)throw Error('Delivery does not belong to this ticket.');resetRecipients();setDraft({...r.data.data.snapshot,verified:false});setConfirm(false);setPreview(null);setNotice('Historical snapshot restored to the editor. Save to create a new draft revision.');});
 const download=delivery=>run(async()=>{const r=await api.get(root+'/deliveries/'+delivery.id+'/pdf',{responseType:'blob'});const url=URL.createObjectURL(r.data);const a=document.createElement('a');a.href=url;a.download=(delivery.ticket_reference||record?.reference||'FareTransit-ticket')+'.pdf';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
 return <main className="it-page"><header><div><p>FareTransit / Bookings</p><h1>Independent E-Ticket Sender</h1><p>Create an independent agency itinerary or receipt from a genuine reservation.</p>{!persistenceEnabled&&<p role="status" className="it-notice">Review mode — use the editor and generate a draft preview. Nothing is saved or emailed yet. Keep this tab open while editing.</p>}</div><button type="button" onClick={clear} disabled={busy}>+ New ticket</button></header>
 {error&&<p role="alert" className="it-error">{error}</p>}{notice&&<p role="status" className="it-notice">{notice}</p>}
 <section className="it-card"><h2>1. Select service</h2><div className="it-row">{[['flight','Flights'],['hotel','Hotels — Under process'],['car','Cars — Under process']].map(([v,l])=><button key={v} type="button" disabled={v!=='flight'||busy} className={service===v?'it-primary':''} onClick={()=>setService(v)}>{l}</button>)}</div>
 {service==='flight'&&<><h2>2. Select entry method</h2><div className="it-row"><button type="button" className={mode==='booking'?'it-primary':''} onClick={()=>selectMode('booking')} disabled={busy}>With Booking ID</button><button type="button" className={mode==='manual'?'it-primary':''} onClick={()=>selectMode('manual')} disabled={busy}>Manual Entry</button></div></>}
 {service==='flight'&&mode==='booking'&&<div className="it-row"><Field label="FareTransit booking ID" value={bid} onChange={setBid}/><button type="button" onClick={fetchBooking} disabled={busy||!bid.trim()}>Fetch booking</button>{sourceRef&&<span>{sourceRef}</span>}</div>}</section>
 {service==='flight'&&mode&&(mode==='manual'||source)&&<fieldset disabled={busy} className="it-editor">
 <section className="it-card"><h2>3. Customer & document</h2><div className="it-grid"><Field label="Customer name" value={draft.customer.name} onChange={v=>changeCustomer('name',v)}/><Field label="Primary recipient email" type="email" value={draft.customer.email} onChange={v=>changeCustomer('email',v)}/><Field label="Phone (optional)" value={draft.customer.phone} onChange={v=>changeCustomer('phone',v)}/><Choice label="Document type" value={draft.documentType} onChange={v=>patch('documentType',v)} options={ [['itinerary','Flight itinerary'],['ticket','Issued e-ticket receipt']]}/></div>
 {source&&<p>Registered booking facts must match the source when sending. Correct the original booking before re-importing any changed reservation details.</p>}</section>
 <section className="it-card"><h2>Passengers</h2><small className="it-seat-hint">Enter assigned seats directly below each passenger. All seats are optional. Changing passenger names or flight identity clears affected assignments for verification.</small>{draft.passengers.map((p,i)=><div className="it-record" key={i}><div className="it-row"><Field label="Passenger name" value={p.name} onChange={v=>changeRow('passengers',i,'name',v)}/><div style={{flex:1,minWidth:180}}><Field label="Issued ticket number (13 digits, if applicable)" value={p.ticketNumber} onChange={v=>changeRow('passengers',i,'ticketNumber',v)}/><small role="status" style={{color:p.ticketNumber&& !/^\d{13}$/.test(p.ticketNumber.replace(/[- ]/g,''))?'#9b1826':undefined}}>{p.ticketNumber.replace(/\D/g,'').length} / 13 digits{p.ticketNumber&&!/^\d{13}$/.test(p.ticketNumber.replace(/[- ]/g,''))?' — check against original airline receipt':''}</small></div><button type="button" onClick={()=>removeRow('passengers',i)}>Remove</button></div><PassengerSeatFields passenger={p} index={i} segments={draft.segments} onSeat={(index,key,seat)=>update(d=>setPassengerSeat(d,index,key,seat))}/></div>)}<button type="button" onClick={()=>patch('passengers',[...draft.passengers,{name:'',ticketNumber:''}])}>+ Add passenger</button>
 <h2>Airline confirmations</h2>{draft.references.map((r,i)=><div className="it-row it-record" key={i}><Field label="Carrier code" value={r.carrier} onChange={v=>changeRow('references',i,'carrier',v.toUpperCase())} maxLength={3}/><Field label="Actual airline PNR" value={r.pnr} onChange={v=>changeRow('references',i,'pnr',v.toUpperCase())}/><button type="button" onClick={()=>removeRow('references',i)}>Remove</button></div>)}<button type="button" onClick={()=>patch('references',[...draft.references,{carrier:'',pnr:''}])}>+ Add airline reference</button></section>
 <section className="it-card"><header><h2>Flight itinerary</h2>{mode==='manual'&&<button type="button" onClick={()=>setShowGds(true)}>GDS Import</button>}</header>{draft.segments.some(s=>!s.arrivalDate)&&<div className="it-notice"><p><strong>{draft.segments.filter(s=>!s.arrivalDate).length} segment(s) need an arrival date.</strong> Check the supplier itinerary. Overnight and date-line flights may arrive on a different local date.</p><button type="button" onClick={()=>{if(window.confirm('Confirm that EVERY segment with a missing arrival date arrives on its departure calendar date, according to the original itinerary?'))update(d=>({...d,segments:d.segments.map(s=>!s.arrivalDate&&validDate(s.departureDate)?{...s,arrivalDate:s.departureDate}:s)}));}}>Confirm all missing arrivals are same day</button></div>}{draft.segments.map((s,i)=><div className="it-record" key={i}><div className="it-row"><strong>Segment {i+1}</strong>{s.carrier&&<AirlineLogo carrierCode={s.carrier}/>}<button type="button" onClick={()=>removeRow('segments',i)}>Remove</button></div><div className="it-grid"><Choice label="Direction" value={s.direction} onChange={v=>changeRow('segments',i,'direction',v)} options={ [['outbound','Outbound'],['inbound','Inbound']]}/>{[['carrier','Carrier code'],['flight','Flight number'],['from','Origin airport'],['to','Destination airport'],['departureDate','Departure date','date'],['departureTime','Departure local time','time'],['arrivalDate','Arrival date (verify)','date'],['arrivalTime','Arrival local time','time'],['cabin','Cabin'],['operatingCarrier','Operating carrier code']].map(([k,l,t])=><Field key={k} label={l} type={t} value={s[k]} onChange={v=>changeRow('segments',i,k,v)}/>)}</div>{validDate(s.departureDate)&&<div className="it-row"><small>Set verified arrival date:</small>{[['Same day',0],['Next day',1],['Previous day',-1]].map(([label,days])=><button type="button" key={label} onClick={()=>{const d=new Date(s.departureDate+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+days);changeRow('segments',i,'arrivalDate',d.toISOString().slice(0,10));}}>{label}</button>)}</div>}<BaggageAllowance value={s.baggage} segmentNumber={i+1} onChange={v=>changeRow('segments',i,'baggage',v)}/></div>)}<div className="it-row"><button type="button" onClick={()=>patch('segments',[...draft.segments,newSegment('outbound')])}>+ Outbound segment</button><button type="button" onClick={()=>patch('segments',[...draft.segments,newSegment('inbound')])}>+ Inbound segment</button></div></section>
 <section className="it-card"><h2>Merchant payment details</h2><label><input type="checkbox" checked={draft.payment.show} onChange={e=>update(d=>({...d,payment:{...d.payment,show:e.target.checked}}))}/> Include on ticket</label>{draft.payment.show&&<>{draft.payment.merchants.map((m,i)=><div className="it-record it-grid" key={i}><Field label="Merchant name" value={m.merchant} onChange={v=>changeMerchant(i,'merchant',v)}/><Field label="Amount USD" value={m.amount} onChange={v=>changeMerchant(i,'amount',v)}/><Field label="Card brand" value={m.cardBrand} onChange={v=>changeMerchant(i,'cardBrand',v)}/><Field label="Last four digits only" value={m.cardLast4} maxLength={4} onChange={v=>changeMerchant(i,'cardLast4',v.replace(/\D/g,''))}/><Choice label="Transaction status" value={m.status} onChange={v=>changeMerchant(i,'status',v)} options={ [['pending','Pending'],['authorized','Authorized'],['charged','Charged — verified']]}/><button type="button" onClick={()=>update(d=>({...d,payment:{...d.payment,merchants:d.payment.merchants.filter((_,j)=>j!==i)}}))}>Remove</button></div>)}<button type="button" onClick={()=>update(d=>({...d,payment:{...d.payment,merchants:[...d.payment.merchants,newMerchant()]}}))}>+ Add merchant</button><p>No base fare, taxes or service charge breakdown. Enter actual merchant amounts only.</p></>}</section>
 <section className="it-card"><h2>Special notes</h2><textarea rows={4} value={draft.notes} maxLength={4000} placeholder="Optional; hidden when empty" onChange={e=>patch('notes',e.target.value)}/><label><input type="checkbox" checked={draft.verified} onChange={e=>{setDraft(d=>({...d,verified:e.target.checked}));setConfirm(false);}}/> I verified the reservation, recipient and payment information against genuine supplier records.</label><div className="it-row">{persistenceEnabled&&<button type="button" onClick={save}>Save draft</button>}<button className="it-primary" type="button" onClick={makePreview}>Generate preview</button></div></section>
 {preview&&<section className="it-card"><h2>Preview</h2>{preview.errors?.length>0&&<ul className="it-error">{preview.errors.map((e,i)=><li key={i}>{e}</li>)}</ul>}<iframe title="Ticket preview" sandbox="" srcDoc={preview.html}/><button type="button" onClick={()=>{setPreview(null);setConfirm(false);}}>Edit ticket</button>{sendingEnabled?<><p><strong>Primary recipient:</strong> {draft.customer.email}</p><RecipientFields values={extraEmails} onChange={changeExtras} max={4}/><label><input type="checkbox" checked={confirm} onChange={e=>setConfirm(e.target.checked)}/> I confirm the passenger authorized this ticket to be sent to the primary recipient and every additional address listed above.</label><button className="it-primary" type="button" disabled={!confirm||!draft.verified||Boolean(preview.errors?.length)||extraEmails.some(v=>!validAddress(v))} onClick={send}>Save & send {extraEmails.length?('to '+(1+extraEmails.length)+' addresses'):'email'}</button></>:<p>Email delivery is disabled during review.</p>}</section>}</fieldset>}
 {persistenceEnabled&&record&&<section className="it-card"><header><h2>Delivery history · {record.reference}</h2><button type="button" disabled={busy} onClick={()=>openTicket(record.id)}>Refresh / recover saved draft</button></header>{deliveries.length?deliveries.map(d=><div className="it-record" key={d.id}><strong>{d.status.toUpperCase()}</strong> · Revision {d.revision} · Attempts {d.attempts}<p>{new Date(d.created_at).toLocaleString()}</p><p><strong>Recipient:</strong> {d.recipient||"See saved delivery"}</p>{d.source_delivery_id&&<small>Additional recipient · original archived version</small>}{d.last_error&&<p role="status">{d.last_error}</p>}{d.provider_id&&<small>Provider ID: {d.provider_id}</small>}<TicketActivity delivery={d} compact/><div className="it-row"><button type="button" disabled={busy} onClick={()=>recoverVersion(d)}>Recover this version</button>{sendingEnabled&&['queued','processing'].includes(d.status)&&<button type="button" disabled={busy} onClick={()=>processQueued(d.id)}>Process / check delivery</button>}{sendingEnabled&&d.status==='failed'&&d.retry_safe&&<button type="button" disabled={busy} onClick={()=>retry(d.id)}>Retry if eligible</button>}{d.pdf_path&&<button type="button" disabled={busy} onClick={()=>download(d)}>Download archived PDF</button>}{sendingEnabled&&d.status==='sent'&&d.pdf_path&&<button type="button" disabled={busy} onClick={()=>beginForward(d)}>Send to another email</button>}</div>{forward===d.id&&<fieldset disabled={busy} className="it-editor"><div className="it-record"><h3>Send original ticket to another email</h3><p>Version {d.revision} will be sent exactly as archived. The original booking, contact and PDF remain unchanged.</p><RecipientFields values={forwardEmails} onChange={v=>{setForwardEmails(v);setForwardVerified(false);}} label="New recipient addresses"/><label><input type="checkbox" checked={forwardVerified} onChange={e=>setForwardVerified(e.target.checked)}/> I confirmed the passenger authorized these recipients and the original document is still appropriate to share.</label><div className="it-row"><button type="button" onClick={()=>setForward(null)}>Cancel</button><button className="it-primary" type="button" disabled={!forwardVerified||!forwardEmails.length||forwardEmails.some(v=>!validAddress(v))} onClick={forwardTicket}>Send original ticket</button></div></div></fieldset>}</div>):<p>No deliveries yet.</p>}</section>}
 {persistenceEnabled&&<TicketHistory refresh={historyRefresh} busy={busy} onOpen={openTicket} onDownload={download}/>}
 {showGds&&<Importer initial={draft.gds} onClose={()=>setShowGds(false)} onApply={(segments,gds)=>{update(d=>({...d,segments,gds}));setShowGds(false);}}/>}</main>;
}
