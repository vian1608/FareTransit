import React,{useEffect,useRef,useState} from 'react';
import api,{getApiErrorMessage} from '../../shared/api/api';
import './IndependentTicket.css';
import CustomerEmailHistory from './CustomerEmailHistory';

const blank=()=>({email:'',passengerName:'',cardholderName:'',cardBrand:'',last4:'',amount:''});
const fields=[['email','Passenger email','email',254],['passengerName','Passenger name','text',120],['cardholderName','Cardholder name','text',120],['cardBrand','Card type','select',0],['last4','Last four digits of card','text',4],['amount','Refund amount (USD)','text',10]];
export default function RefundEmailPage(){
 const lock=useRef(false);
 const [refundProcessed,setRefundProcessed]=useState(false),[historyVersion,setHistoryVersion]=useState(0);
 const [marketing,setMarketing]=useState(false),[html,setHtml]=useState(''),[previewError,setPreviewError]=useState('');
 const [data,setData]=useState(blank),[busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[error,setError]=useState('');
 const change=(key,value)=>setData(d=>({...d,[key]:key==='last4'?value.replace(/\D/g,'').slice(0,4):value}));
 const valid=Object.values(data).every(v=>v.trim())&&/^\d{4}$/.test(data.last4)&&/^\d{1,7}(\.\d{1,2})?$/.test(data.amount)&&Number(data.amount)>0;
 const formatted=Number(data.amount)>0&&/^\d{1,7}(\.\d{1,2})?$/.test(data.amount)?new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(data.amount)):'—';
 const {passengerName,cardholderName,cardBrand,last4,amount}=data;
 useEffect(()=>{
  let active=true;
  const timer=setTimeout(async()=>{
   try{const r=await api.post('/admin/refund-email/preview',{passengerName,cardholderName,cardBrand,last4,amount,marketing});if(active){if(!r.data?.html)throw Error('Preview unavailable');setHtml(r.data.html.replaceAll('https://www.faretransit.com/assets/refund-cards/',window.location.origin+'/assets/refund-cards/'));setPreviewError('');}}
   catch{if(active){setHtml('');setPreviewError('Email preview unavailable. Please check your connection.');}}
  },350);
  return ()=>{active=false;clearTimeout(timer);};
 },[passengerName,cardholderName,cardBrand,last4,amount,marketing]);
 const reset=()=>{setData(blank());setNotice('');setError('');setMarketing(false);setRefundProcessed(false);};
 const send=async e=>{
  e.preventDefault();if(lock.current||notice||!valid||!refundProcessed)return;
  if(!window.confirm('Send a processed refund confirmation to '+data.email.trim()+' for '+formatted+'? Confirm the refund has already been processed.'))return;
  lock.current=true;setBusy(true);setError('');
  try{const r=await api.post('/admin/refund-email',{...data,marketing,refundProcessed});if(!r.data?.success)throw Error('Email acceptance could not be verified.');setNotice(r.data.message);}
  catch(e){setError(getApiErrorMessage(e)||e.message);}
  finally{lock.current=false;setBusy(false);setHistoryVersion(v=>v+1);}
 };
 return <main className="it-page">
 <header><div><p>FareTransit / Customer Service</p><h1>Refund Email</h1><p>Send a branded refund confirmation after processing the refund.</p></div></header>
 <div className="it-grid" style={{gridTemplateColumns:'repeat(auto-fit,minmax(min(100%,340px),1fr))',alignItems:'start'}}>
 <section className="it-card"><h2>Refund details</h2><p>Enter only the information required for the email. Never enter a full card number or CVV.</p>
 <form onSubmit={send}>
  {fields.map(([key,label,type,maxLength])=><label key={key}>{label}{type==='select'?<select required value={data[key]} disabled={busy||Boolean(notice)} onChange={e=>change(key,e.target.value)}><option value="">Select card type</option><option value="visa">Visa</option><option value="mastercard">Mastercard</option><option value="amex">American Express</option><option value="discover">Discover</option><option value="other">Other card</option></select>:<input type={type} maxLength={maxLength} required value={data[key]} disabled={busy||Boolean(notice)} onChange={e=>change(key,e.target.value)} inputMode={key==='last4'?'numeric':key==='amount'?'decimal':undefined} pattern={key==='last4'?'[0-9]{4}':undefined} autoComplete={key==='email'?'email':'off'} placeholder={{email:'passenger@example.com',passengerName:'Passenger full name',cardholderName:'Name on card',last4:'1234',amount:'250.00'}[key]}/>}</label>)}
  <label style={{display:'flex',alignItems:'flex-start',gap:8}}><input type="checkbox" style={{width:'auto',marginTop:3}} required checked={refundProcessed} disabled={busy||Boolean(notice)} onChange={e=>setRefundProcessed(e.target.checked)}/><span>I confirm that the refund has already been processed to the original payment card.</span></label>
  <label style={{display:'flex',alignItems:'flex-start',gap:8}}><input type="checkbox" style={{width:'auto',marginTop:3}} checked={marketing} disabled={busy||Boolean(notice)} onChange={e=>setMarketing(e.target.checked)}/><span>Include future travel invitation<br/><small>Only select for recipients eligible to receive promotional messages.</small></span></label>
  {error&&<p role="alert" className="it-error">{error}</p>}{notice&&<p role="status" className="it-notice">{notice}</p>}
  {notice?<button type="button" onClick={reset}>New refund email</button>:<button type="submit" className="it-primary" disabled={busy||!valid||!refundProcessed}>{busy?'Sending…':'Send refund email'}</button>}
 </form><p className="it-muted">Email only. No refund is initiated and no payment record is modified.</p></section>
 <section className="it-card"><h2>Email preview</h2><p><strong>Subject:</strong> Fare Transit | Your Refund Has Been Processed</p>
 <p className="it-muted">Live preview of the actual email template, including your selected travel invitation.</p>
 {previewError?<p role="alert" className="it-error">{previewError}</p>:html?<iframe title="Refund email preview" sandbox="" referrerPolicy="no-referrer" srcDoc={html} style={{width:'100%',height:marketing?1400:1150,border:'1px solid #dce3ec',borderRadius:12,background:'#eef2f6'}}/>:<p role="status">Loading email preview…</p>}
 </section>
 </div><CustomerEmailHistory kind="refund" refreshVersion={historyVersion}/></main>;
}
