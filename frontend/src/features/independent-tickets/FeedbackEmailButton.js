import React,{useRef,useState} from 'react';
import api,{getApiErrorMessage} from '../../shared/api/api';
import './IndependentTicket.css';

export default function FeedbackEmailButton({className,disabled=false}){
 const dialog=useRef(null),lock=useRef(false);
 const [email,setEmail]=useState(''),[busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[error,setError]=useState('');
 const open=()=>{setEmail('');setNotice('');setError('');dialog.current?.showModal();};
 const close=()=>{if(!lock.current)dialog.current?.close();};
 const send=async e=>{
  e.preventDefault();if(lock.current||notice)return;
  lock.current=true;setBusy(true);setError('');
  try{const r=await api.post('/admin/feedback-email',{email:email.trim()});if(!r.data?.success)throw Error('Email acceptance could not be verified.');setNotice(r.data.message||'Feedback email accepted by the email provider.');}
  catch(e){setError(getApiErrorMessage(e)||e.message);}
  finally{lock.current=false;setBusy(false);}
 };
 return <>
 <button type="button" className={className} onClick={open} disabled={disabled}>Send feedback email</button>
 <dialog ref={dialog} className="it-modal" aria-labelledby="feedback-email-title" style={{border:'1px solid #dce2eb',width:'min(480px, calc(100% - 32px))',boxSizing:'border-box'}} onCancel={e=>{if(lock.current)e.preventDefault();}}>
  <header><h2 id="feedback-email-title" style={{color:'#8b1236'}}>Send feedback email</h2><button type="button" onClick={close} disabled={busy} aria-label="Close feedback email dialog">Close</button></header>
  <p>Invite any Fare Transit passenger to share their honest experience on Trustpilot. No reservation ID is required.</p>
  <form onSubmit={send}>
   <label>Passenger email<input autoFocus type="email" autoComplete="email" required maxLength={254} value={email} disabled={busy||Boolean(notice)} onChange={e=>setEmail(e.target.value)} placeholder="passenger@example.com"/></label>
   <p style={{fontSize:13,color:'#64748b'}}>Subject: How was your experience with Fare Transit?</p>
   {error&&<p role="alert" className="it-error">{error}</p>}{notice&&<p role="status" className="it-notice">{notice}</p>}
   <div className="it-row"><button type="button" onClick={close} disabled={busy}>{notice?'Done':'Cancel'}</button>{!notice&&<button type="submit" className="it-primary" disabled={busy||!email.trim()}>{busy?'Sending…':'Send feedback email'}</button>}</div>
  </form>
 </dialog>
 </>;
}
