// Customer-facing reference uses the airline's actual confirmation, never a shortened internal ID.
export function ticketConfirmationLine(d){
 const pnrs=[...new Set((d.references||[]).map(r=>r.pnr).filter(v=>typeof v==='string'&&/^[A-Z0-9]{6}$/.test(v)))];
 return pnrs.length===1?'Airline confirmation: '+pnrs[0]:pnrs.length>1?'Airline confirmations: see confirmation details below':'';
}

export const ticketTitle=d=>d.documentType==='ticket'?'E-Ticket & Itinerary':'Flight Itinerary';
