import React,{useRef,useState} from 'react';
import api,{getApiErrorMessage} from '../../shared/api/api';
import './IndependentTicket.css';

const blank=()=>({email:'',passengerName:'',cardholderName:'',last4:'',amount:''});
const fields=[['email','Passenger email','email',254],['passengerName','Passenger name','text',120],['cardholderName','Cardholder name','text',120],['last4','Last four digits of card','text',4],['amount','Refund amount (USD)','text',10]];
export default function RefundEmailPage(){
 const lock=useRef(false);
 const [data,setData]=useState(blank),[busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[error,setError]=useState('');
 const change=(key,value)=>setData(d=>({...d,[key]:key==='last4'?value.replace(/\D/g,'').slice(0,4):value}));
 const valid=Object.values(data).every(v=>v.trim())&&/^\d{4}$/.test(data.last4)&&/^\d{1,7}(\.\d{1,2})?$/.test(data.amount)&&Number(data.amount)>0;
 const formatted=Number(data.amount)>0&&/^\d{1,7}(\.\d{1,2})?$/.test(data.amount)?new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(data.amount)):'—';
 const reset=()=>{setData(blank());setNotice('');setError('');};
 const send=async e=>{
  e.preventDefault();if(lock.current||notice||!valid)return;
  if(!window.confirm('Send a refund request acknowledgement to '+data.email.trim()+' for '+formatted+'? This does not initiate a refund.'))return;
  lock.current=true;setBusy(true);setError('');
  try{const r=await api.post('/admin/refund-email',data);if(!r.data?.success)throw Error('Email acceptance could not be verified.');setNotice(r.data.message);}
  catch(e){setError(getApiErrorMessage(e)||e.message);}
  finally{lock.current=false;setBusy(false);}
 };
 return <main className="it-page">
 <header><div><p>FareTransit / Customer Service</p><h1>Refund Email</h1><p>Send a branded refund request acknowledgement for any reservation.</p></div></header>
 <div className="it-grid" style={{gridTemplateColumns:'repeat(auto-fit,minmax(min(100%,340px),1fr))',alignItems:'start'}}>
 <section className="it-card"><h2>Refund details</h2><p>Enter only the information required for the email. Never enter a full card number or CVV.</p>
 <form onSubmit={send}>
  {fields.map(([key,label,type,maxLength])=><label key={key}>{label}<input type={type} maxLength={maxLength} required value={data[key]} disabled={busy||Boolean(notice)} onChange={e=>change(key,e.target.value)} inputMode={key==='last4'?'numeric':key==='amount'?'decimal':undefined} pattern={key==='last4'?'[0-9]{4}':undefined} autoComplete={key==='email'?'email':'off'} placeholder={{email:'passenger@example.com',passengerName:'Passenger full name',cardholderName:'Name on card',last4:'1234',amount:'250.00'}[key]}/></label>)}
  {error&&<p role="alert" className="it-error">{error}</p>}{notice&&<p role="status" className="it-notice">{notice}</p>}
  {notice?<button type="button" onClick={reset}>New refund email</button>:<button type="submit" className="it-primary" disabled={busy||!valid}>{busy?'Sending…':'Send refund email'}</button>}
 </form><p className="it-muted">Email only. No refund is initiated and no payment record is modified.</p></section>
 <section className="it-card"><h2>Email preview</h2><p><strong>Subject:</strong> Fare Transit | Refund Request Acknowledgement</p>
 <div style={{background:'#8b1236',color:'#fff',borderRadius:8,padding:18,margin:'12px 0'}}><small>CUSTOMER SERVICE</small><h3 style={{color:'#fff',margin:'8px 0'}}>Refund request received</h3>Acknowledgement of your request</div>
 <p>Dear {data.passengerName.trim()||'Valued Passenger'},</p><p>Thank you for choosing Fare Transit.</p><p>We have received your refund request. The details below summarize the amount requested and the card associated with your request.</p>
 <dl style={{background:'#f4f6fa',padding:14,borderRadius:8}}>{[['Passenger name',data.passengerName],['Cardholder name',data.cardholderName],['Card ending in',data.last4?'•••• '+data.last4:'•••• —'],['Refund amount requested (USD)',formatted]].map(([k,v])=><div key={k} style={{display:'flex',justifyContent:'space-between',gap:12,borderBottom:'1px solid #dce3ec',padding:'10px 0'}}><dt>{k}</dt><dd style={{margin:0,fontWeight:700,textAlign:'right',overflowWrap:'anywhere'}}>{v||'—'}</dd></div>)}</dl>
 <p style={{background:'#fff6e8',padding:12,borderRadius:8}}><strong>Refund status:</strong> This email acknowledges your request only. It does not confirm that a refund has been approved, issued or credited. We will contact you with updates once the request has been reviewed.</p>
 <p>If you have questions, please reply to this email or contact support@faretransit.com.</p><p>Warm regards,<br/><strong>Alex</strong><br/>Fare Transit Customer Support Team</p></section>
 </div></main>;
}
