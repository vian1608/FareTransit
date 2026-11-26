import PDFDocument from 'pdfkit';
import {carrierName,cents,money,paymentTotal} from './ticket.model.mjs';
import {localCarrierLogo,localBrandMark} from './ticket.branding.mjs';

import {flightDisplay,connectionDisplay} from './ticket.flight-display.mjs';
const burgundy='#8b1236',ink='#23334b';
export function generateTicketPdf(d,{reference='',createdAt,draft=false}={}){
 return new Promise((resolve,reject)=>{
  const doc=new PDFDocument({size:'LETTER',margin:44,bufferPages:true,info:{Title:'FareTransit travel document',Author:'FareTransit LLC',CreationDate:createdAt?new Date(createdAt):new Date()}});
  const chunks=[];let length=0;
  doc.on('data',chunk=>{length+=chunk.length;if(length>5*1024*1024){doc.destroy(new Error('PDF exceeds maximum size'));return;}chunks.push(chunk);});
  doc.on('error',reject);
  doc.on('end',()=>resolve(Buffer.concat(chunks)));
  try{
   const width=doc.page.width-88;
   const ensure=h=>{if(doc.y+h>doc.page.height-58)doc.addPage();};
   const title=t=>{ensure(35);doc.moveDown(.6).font('Helvetica-Bold').fontSize(13).fillColor(burgundy).text(t);doc.moveDown(.35);};
   const para=t=>{doc.font('Helvetica').fontSize(10).fillColor(ink).text(String(t??''),{width,lineGap:2});};
   const logo=(file,x,y,w=28)=>{if(file)try{doc.image(file,x,y,{fit:[w,w]});}catch{/* Fall back to printed name */}};
   const brand=localBrandMark();logo(brand,44,44,38);doc.font('Helvetica-Bold').fillColor(burgundy).fontSize(23).text('FareTransit',brand?90:44,46);
   doc.y=88;
   const carriers=[...new Set(d.segments.map(s=>s.carrier))];
   if(carriers.length){title('Airline partners in this itinerary');for(const code of carriers){ensure(38);const y=doc.y;logo(localCarrierLogo(code),44,y,28);doc.font('Helvetica-Bold').fontSize(11).fillColor(ink).text(carrierName(code),80,y+6,{width:width-36});doc.y=Math.max(doc.y,y+32);}}
   ensure(55);doc.moveDown(.4);const y=doc.y;doc.rect(44,y,width,35).fill(burgundy);doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(15).text(d.documentType==='ticket'?'E-ticket receipt & flight itinerary':'Flight itinerary',54,y+10,{width:width-20});doc.y=y+45;
   if(reference)para('FareTransit document reference: '+reference);
   if(draft)para('DRAFT — NOT VALID FOR TRAVEL');
   title('Passengers');for(const p of d.passengers){ensure(32);para(p.name+(p.ticketNumber?' · Ticket '+p.ticketNumber:''));}
   if(d.references.length){title('Airline references');for(const r of d.references){ensure(28);para(carrierName(r.carrier)+' · '+r.pnr);}}
   for(const direction of ['outbound','inbound']){
    const seg=d.segments.filter(s=>s.direction===direction);if(!seg.length)continue;
    title(direction==='outbound'?'Outbound journey':'Inbound journey');
    para(seg[0].from+' → '+seg[seg.length-1].to+' · '+seg.length+' flight'+(seg.length===1?'':'s'));
    for(const [i,s] of seg.entries()){
     const f=flightDisplay(s),c=connectionDisplay(s,seg[i+1]);
     const meta=[s.cabin?'Cabin: '+s.cabin:'',s.operatingCarrier?'Operated by '+carrierName(s.operatingCarrier):'',s.baggage?'Baggage: '+s.baggage:''].filter(Boolean).join(' · ');
     doc.font('Helvetica').fontSize(9);const metaHeight=meta?doc.heightOfString(meta,{width:width-24})+18:0;
     const cardHeight=146+metaHeight;
     ensure(cardHeight+10);const yy=doc.y,x=44;
     doc.roundedRect(x,yy,width,cardHeight,7).lineWidth(0.7).stroke('#dce3ec');
     doc.rect(x+1,yy+1,width-2,35).fill('#f4f6fa');
     logo(localCarrierLogo(s.carrier),x+10,yy+5,25);
     doc.font('Helvetica-Bold').fontSize(11).fillColor(ink).text(carrierName(s.carrier)+' · '+s.carrier+' '+s.flight,x+42,yy+12,{width:width-115,lineBreak:false,ellipsis:true});
     doc.font('Helvetica').fontSize(8).fillColor('#64748b').text('FLIGHT '+(i+1)+' OF '+seg.length,x+width-75,yy+13,{width:65,align:'right',lineBreak:false});
     const col=(width-90)/2;
     const endpoint=(airport,clock,date,shift,xx,align,caption)=>{
      const put=(v,y,size,color,bold=false)=>doc.font(bold?'Helvetica-Bold':'Helvetica').fontSize(size).fillColor(color).text(v,xx,yy+y,{width:col-12,align,lineBreak:false,ellipsis:true});
      put(caption,43,8,'#64748b',true);put(clock,56,23,ink,true);put(airport.code+(shift?' ('+shift+')':''),85,13,burgundy,true);
      if(airport.city)put(airport.city,102,9,ink);
      if(airport.name)put(airport.name,114,8,'#64748b');
      put(date,129,9,ink);
     };
     endpoint(f.from,f.departureTime,f.departureDate,'',x+12,'left','DEPARTURE');
     endpoint(f.to,f.arrivalTime,f.arrivalDate,f.dayShift,x+col+90,'right','ARRIVAL');
     const center=x+width/2;
     doc.moveTo(center-25,yy+77).lineTo(center+25,yy+77).stroke('#8b1236');
     doc.moveTo(center+19,yy+73).lineTo(center+25,yy+77).lineTo(center+19,yy+81).stroke('#8b1236');
     if(f.duration)doc.font('Helvetica-Bold').fontSize(10).fillColor(ink).text(f.duration,center-40,yy+85,{width:80,align:'center',lineBreak:false});
     if(meta){doc.moveTo(x+10,yy+145).lineTo(x+width-10,yy+145).stroke('#dce3ec');doc.font('Helvetica').fontSize(9).fillColor(ink).text(meta,x+12,yy+153,{width:width-24});}
     doc.x=44;doc.y=yy+cardHeight+10;
     if(c){ensure(28);const cy=doc.y;doc.roundedRect(x,cy,width,22,5).fill('#f4f6fa');doc.font('Helvetica-Bold').fontSize(9).fillColor('#475569').text((c.duration?c.duration+' layover':'Connection')+' at '+(c.airport.city||c.airport.code)+' ('+c.airport.code+')',x+8,cy+7,{width:width-16,align:'center',lineBreak:false,ellipsis:true});doc.x=44;doc.y=cy+29;}
    }
    para('All departure and arrival times are local to the respective airports.');
   }
   if(d.payment.show&&d.payment.merchants.length){
    title('Payment & merchant charges');
    for(const m of d.payment.merchants){ensure(42);para(m.merchant+' · '+money(cents(m.amount)||0)+' USD · '+m.status+(m.cardLast4?' · '+m.cardBrand+' ending in '+m.cardLast4:''));}
    for(const status of ['charged','authorized','pending'])if(d.payment.merchants.some(m=>m.status===status)){ensure(30);doc.font('Helvetica-Bold').fontSize(11).fillColor(ink).text('Total '+status+': '+money(paymentTotal(d,status))+' USD');}
    para('Separate merchant transactions may appear on your card statement.');
   }
   if(d.notes){title('Special notes');para(d.notes);}
   ensure(44);doc.moveDown();para('Prepared by FareTransit LLC · support@faretransit.com');para('Verify airline reservation details directly with the airline.');
   const range=doc.bufferedPageRange();for(let i=range.start;i<range.start+range.count;i++){doc.switchToPage(i);doc.font('Helvetica').fontSize(8).fillColor('#65758b').text('FareTransit · '+(i+1)+' / '+range.count,44,doc.page.height-43,{align:'right',width,lineBreak:false});}
   doc.end();
  }catch(e){doc.destroy();reject(e);}
 });
}
