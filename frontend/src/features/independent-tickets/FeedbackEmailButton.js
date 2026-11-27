import React,{useEffect,useRef,useState} from 'react';
import api,{getApiErrorMessage} from '../../shared/api/api';
import './IndependentTicket.css';
import CustomerEmailHistory from './CustomerEmailHistory';

export default function FeedbackEmailPage(){
 const lock=useRef(false),emailField=useRef(null);
 const [html,setHtml]=useState(''),[previewError,setPreviewError]=useState(''),[historyVersion,setHistoryVersion]=useState(0);
 useEffect(()=>{let active=true;api.get('/admin/feedback-email/preview').then(r=>{if(active)setHtml(r.data.html||'');}).catch(()=>{if(active)setPreviewError('Email preview unavailable.');});return()=>{active=false;};},[]);
 const [email,setEmail]=useState(''),[busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[error,setError]=useState('');
 const reset=()=>{setEmail('');setNotice('');setError('');requestAnimationFrame(()=>emailField.current?.focus());};
 const send=async e=>{
  e.preventDefault();if(lock.current||notice)return;
  lock.current=true;setBusy(true);setError('');
  try{const r=await api.post('/admin/feedback-email',{email:email.trim()});if(!r.data?.success)throw Error('Email acceptance could not be verified.');setNotice(r.data.message||'Feedback email accepted by the email provider.');}
  catch(e){setError(getApiErrorMessage(e)||e.message);}
  finally{lock.current=false;setBusy(false);setHistoryVersion(v=>v+1);}
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
 <section className="it-card"><h2>Email template</h2><p><strong>Subject:</strong> How was your experience with Fare Transit?</p>{previewError?<p role="alert" className="it-error">{previewError}</p>:html?<iframe title="Feedback email preview" sandbox="" referrerPolicy="no-referrer" srcDoc={html} style={{width:'100%',height:1050,border:'1px solid #dce3ec',borderRadius:10}}/>:<p role="status">Loading email preview…</p>}</section>
 </div><CustomerEmailHistory kind="feedback" refreshVersion={historyVersion}/></main>;
}
