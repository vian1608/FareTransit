import {GLOBAL_AIRPORTS} from '../flights/airport-ranker.mjs';
const airports=new Map(GLOBAL_AIRPORTS.map(a=>[a.code,a]));
airports.set('XNA',{code:'XNA',city:'Northwest Arkansas',name:'Northwest Arkansas National Airport',state:'AR',country:'United States'});
airports.set('LIR',{code:'LIR',city:'Liberia',name:'Guanacaste Airport',country:'Costa Rica'});
const zones=new Map();
for(const [zone,codes] of Object.entries({
 'America/New_York':'JFK LGA EWR BOS BWI DCA IAD PHL ATL CLT RDU MIA FLL MCO TPA RSW JAX DTW CLE CMH PIT IND SDF BUF ROC SYR BDL PVD RIC ORF SAV CHS GSP CVG',
 'America/Chicago':'XNA IAH HOU ORD MDW DFW DAL AUS SAT MSY BNA MEM MSP MKE STL MCI OKC TUL OMA DSM LIT BHM',
 'America/Denver':'DEN SLC ABQ ELP COS BOI BZN',
 'America/Phoenix':'PHX TUS',
 'America/Los_Angeles':'LAX SFO SJC OAK SMF SEA PDX SAN SNA LAS RNO ONT BUR LGB GEG',
 'America/Anchorage':'ANC FAI','Pacific/Honolulu':'HNL OGG KOA LIH',
 'America/Costa_Rica':'LIR SJO','America/Toronto':'YYZ YUL YOW','America/Vancouver':'YVR','America/Edmonton':'YYC YEG',
 'America/Mexico_City':'MEX GDL','America/Cancun':'CUN','America/Bogota':'BOG MDE CTG','America/Lima':'LIM','America/Panama':'PTY',
 'Europe/London':'LHR LGW LCY STN MAN EDI','Europe/Dublin':'DUB','Europe/Paris':'CDG ORY','Europe/Amsterdam':'AMS','Europe/Berlin':'FRA MUC BER','Europe/Rome':'FCO MXP','Europe/Madrid':'MAD BCN','Europe/Zurich':'ZRH GVA','Europe/Istanbul':'IST',
 'Asia/Kolkata':'DEL BOM BLR HYD MAA','Asia/Dubai':'DXB AUH','Asia/Qatar':'DOH','Asia/Tokyo':'HND NRT KIX','Asia/Seoul':'ICN','Asia/Singapore':'SIN','Asia/Hong_Kong':'HKG','Asia/Shanghai':'PEK PVG','Asia/Bangkok':'BKK','Asia/Taipei':'TPE','Australia/Sydney':'SYD','Australia/Melbourne':'MEL'
}))for(const code of codes.split(' '))zones.set(code,zone);
export function airportDisplay(code){const a=airports.get(code);return {code:code||'—',city:a?[a.city,a.state||a.country].filter(Boolean).join(', '):'',name:a?.name||''};}
function dateValue(date){if(!/^\d{4}-\d{2}-\d{2}$/.test(date||''))return null;const n=Date.parse(date+'T00:00:00Z');return Number.isFinite(n)&&new Date(n).toISOString().slice(0,10)===date?n:null;}
const dateFormat=new Intl.DateTimeFormat('en-US',{weekday:'short',month:'short',day:'numeric',year:'numeric',timeZone:'UTC'});
export function displayDate(date){const n=dateValue(date);return n===null?'Date to be confirmed':dateFormat.format(n);}
export function displayTime(t){if(!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(t||''))return '—';const [h,m]=t.split(':').map(Number);return (h%12||12)+':'+String(m).padStart(2,'0')+' '+(h>=12?'PM':'AM');}
const formatters=new Map();
function localStamp(ms,zone){
 if(!formatters.has(zone))formatters.set(zone,new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}));
 const p=Object.fromEntries(formatters.get(zone).formatToParts(ms).map(x=>[x.type,x.value]));
 return Date.parse(p.year+'-'+p.month+'-'+p.day+'T'+p.hour+':'+p.minute+':00Z');
}
// Resolve local wall-clock times only where the zone is known. Reject ambiguous or nonexistent DST times.
function instant(code,date,time){
 const zone=zones.get(code);if(!zone||dateValue(date)===null||displayTime(time)==='—')return null;
 const wall=Date.parse(date+'T'+time+':00Z');
 const offsets=new Set([-36,-12,0,12,36].map(h=>{const t=wall+h*3600000;return localStamp(t,zone)-t;}));
 const candidates=[...offsets].map(o=>wall-o).filter(t=>localStamp(t,zone)===wall);
 return candidates.length===1?candidates[0]:null;
}
function elapsed(start,end){if(start===null||end===null)return null;const m=(end-start)/60000;return Number.isInteger(m)&&m>0&&m<=10080?m:null;}
export function durationLabel(m){return m===null?'':(Math.floor(m/60)?Math.floor(m/60)+'h ':'')+(m%60?m%60+'m':Math.floor(m/60)?'':'0m');}
export function flightDisplay(s){
 const a=dateValue(s.departureDate),b=dateValue(s.arrivalDate);
 const dayShift=a===null||b===null?null:(b-a)/86400000;
 return {from:airportDisplay(s.from),to:airportDisplay(s.to),departureTime:displayTime(s.departureTime),arrivalTime:displayTime(s.arrivalTime),departureDate:displayDate(s.departureDate),arrivalDate:displayDate(s.arrivalDate),dayShift:dayShift?((dayShift>0?'+':'')+dayShift+' day'+(Math.abs(dayShift)===1?'':'s')):'',duration:durationLabel(elapsed(instant(s.from,s.departureDate,s.departureTime),instant(s.to,s.arrivalDate,s.arrivalTime))).trim()};
}
export function connectionDisplay(s,next){
 if(!next||!s.to||s.to!==next.from)return null;
 const airport=airportDisplay(s.to);
 const minutes=elapsed(instant(s.to,s.arrivalDate,s.arrivalTime),instant(next.from,next.departureDate,next.departureTime));
 return {airport,duration:durationLabel(minutes).trim()};
}
