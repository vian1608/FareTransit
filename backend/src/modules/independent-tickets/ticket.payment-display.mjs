import {cents} from './ticket.model.mjs';
const formatter=new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',minimumFractionDigits:2,maximumFractionDigits:2});
export const displayUsd=minor=>Number.isSafeInteger(minor)?formatter.format(minor/100):'Amount to be confirmed';
export const merchantAmount=m=>displayUsd(cents(m.amount));
export const paymentLabel=status=>({charged:'Charged',authorized:'Authorized',pending:'Pending'}[status]||'Unverified');
export const maskedCard=m=>m.cardLast4?[m.cardBrand||'Card','ending in '+m.cardLast4].join(' '):'';
