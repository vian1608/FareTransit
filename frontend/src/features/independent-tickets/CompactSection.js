import React,{useId,useState} from 'react';

// Presentation-only disclosure: hiding a section never clears or changes the draft.
export default function CompactSection({title,summary,children,initialOpen=false,className='',actions}){
 const [open,setOpen]=useState(initialOpen);
 const id=useId();
 return <div className={'it-disclosure '+className}>
  <div className="it-disclosure-header">
   <button type="button" className="it-disclosure-toggle" aria-expanded={open} aria-controls={id} onClick={()=>setOpen(v=>!v)}>
    <span className="it-disclosure-chevron" aria-hidden="true">{open?'⌄':'›'}</span>
    <span className="it-disclosure-label"><strong>{title}</strong>{summary&&<small>{summary}</small>}</span>
    <span className="it-disclosure-action">{open?'Collapse':'Expand'}</span>
   </button>{actions&&<div className="it-disclosure-actions">{actions}</div>}
  </div>
  <div id={id} className="it-disclosure-body" hidden={!open}>{children}</div>
 </div>;
}
