import {dispatchIndependentTicket,independentDeliveryConfigured} from '../modules/independent-tickets/ticket.dispatch.mjs';
const pause=ms=>new Promise(r=>setTimeout(r,ms));
let stopping=false;
process.on('SIGTERM',()=>{stopping=true;});
process.on('SIGINT',()=>{stopping=true;});
if(!independentDeliveryConfigured()){console.error('Independent ticket worker disabled or unconfigured');process.exitCode=1;}
else {
 const once=process.argv.includes('--once');
 do{
  try{const result=await dispatchIndependentTicket();if(!result.claimed&&!once)await pause(5000);}
  catch{console.error('Independent ticket queue unavailable');if(!once)await pause(15000);}
 }while(!once&&!stopping);
}
