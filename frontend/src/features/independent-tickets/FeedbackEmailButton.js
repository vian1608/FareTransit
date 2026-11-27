import React,{useRef,useState} from 'react';
import api,{getApiErrorMessage} from '../../shared/api/api';
import './IndependentTicket.css';

export default function FeedbackEmailPage(){
 const lock=useRef(false),emailField=useRef(null);
 const [email,setEmail]=useState(''),[busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[error,setError]=useState('');
 const reset=()=>{setEmail('');setNotice('');setError('');requestAnimationFrame(()=>emailField.current?.focus());};
 const send=async e=>{
  e.preventDefault();if(lock.current||notice)return;
  lock.current=true;setBusy(true);setError('');
  try{const r=await api.post('/admin/feedback-email',{email:email.trim()});if(!r.data?.success)throw Error('Email acceptance could not be verified.');setNotice(r.data.message||'Feedback email accepted by the email provider.');}
  catch(e){setError(getApiErrorMessage(e)||e.message);}
  finally{lock.current=false;setBusy(false);}
 };
 return <main className="it-page">
 <header><div><p>FareTransit / Customer Service</p><h1>Feedback Email</h1><p>Invite passengers to share their honest experience with Fare Transit.</p></div></header>
 <div className="it-grid" style={{gridTemplateColumns:'repeat(auto-fit,minmax(min(100%,340px),1fr))',alignItems:'start'}}>
 <section className="it-card"><h2>Send feedback email</h2><p>Works with all reservation types. No booking ID or ticket details required.</p>
  <form onSubmit={send}>
   <label>Passenger email<input ref={emailField} type="email" autoComplete="email" required maxLength={254} value={email} disabled={busy||Boolean(notice)} onChange={e=>setEmail(e.target.value)} placeholder="passenger@example.com"/></label>
   {error&&<p role="alert" className="it-error">{error}</p>}{notice&&<p role="status" className="it-notice">{notice}</p>}
   <div className="it-row">{notice?<button type="button" onClick={reset}>Send another feedback email</button>:<button type="submit" className="it-primary" disabled={busy||!email.trim()}>{busy?'Sending…':'Send feedback email'}</button>}</div>
  </form>
  <p className="it-muted">Only send to customers with a genuine Fare Transit experience. All honest reviews are welcome.</p>
 </section>
 <section className="it-card"><h2>Email template</h2><p><strong>Subject:</strong> How was your experience with Fare Transit?</p><div style={{background:'#8b1236',color:'#fff',borderRadius:8,padding:18,margin:'12px 0'}}><small>CUSTOMER EXPERIENCE</small><h3 style={{color:'#fff',margin:'8px 0'}}>Your journey. Your voice.</h3>We'd love to hear from you.</div><p>Dear Valued Passenger,</p><p>Thank you for choosing Fare Transit! We truly appreciate the trust you place in us.</p><p>We welcome your honest feedback on Trustpilot, whether positive or negative.</p><div style={{background:'#f4f6fa',padding:14,borderRadius:8,textAlign:'center'}}><a href="https://www.trustpilot.com/review/faretransit.com" target="_blank" rel="noreferrer" style={{display:'inline-block',background:'#007c58',color:'#fff',padding:'10px 16px',borderRadius:6,textDecoration:'none',fontWeight:700}}>Write a review on Trustpilot</a><p className="it-muted">Leaving a review is optional.</p></div><p>Warm regards,<br/><strong>Alex</strong><br/>Fare Transit Customer Support Team</p><small className="it-muted">Template preview · the sent email includes the complete branded message.</small></section>
 </div></main>;
}
