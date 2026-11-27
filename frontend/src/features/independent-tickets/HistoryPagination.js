import React from 'react';
export const pageSizes=[10,25,50,100];
export const lastOffset=(total,size)=>Math.max(0,Math.floor((Math.max(1,total)-1)/size)*size);
export function HistoryPagination({total,offset,size,loading,onOffset,onSize}){
 const pages=Math.max(1,Math.ceil(total/size)),page=Math.min(pages,Math.floor(offset/size)+1);
 const go=n=>onOffset(Math.max(0,Math.min(pages-1,n-1))*size);
 return <div className="it-history-pagination-bar">
 <label>Rows per page<select value={size} onChange={e=>onSize(Number(e.target.value))}>{pageSizes.map(n=><option key={n} value={n}>{n}</option>)}</select></label>
 <span role="status" className="it-page-count">{total?offset+1:0}–{Math.min(offset+size,total)} of {total} records</span>
 <div className="it-pagination-buttons"><button type="button" aria-label="First page" disabled={loading||page===1} onClick={()=>go(1)}>«</button><button type="button" disabled={loading||page===1} onClick={()=>go(page-1)}>Previous</button><label className="it-page-jump">Page<select aria-label="Go to page" value={page} disabled={loading} onChange={e=>go(Number(e.target.value))}>{Array.from({length:pages},(_,i)=><option key={i+1} value={i+1}>{i+1}</option>)}</select>of {pages}</label><button type="button" disabled={loading||page>=pages} onClick={()=>go(page+1)}>Next</button><button type="button" aria-label="Last page" disabled={loading||page>=pages} onClick={()=>go(pages)}>»</button></div>
 </div>;
}
