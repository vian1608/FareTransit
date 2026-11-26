import PDFDocument from 'pdfkit';
import {carrierName,cents,money,paymentTotal} from './ticket.model.mjs';
import {localCarrierLogo,localBrandMark} from './ticket.branding.mjs';

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
    for(const s of seg){ensure(104);const yy=doc.y;logo(localCarrierLogo(s.carrier),44,yy,28);doc.font('Helvetica-Bold').fontSize(11).fillColor(ink).text(carrierName(s.carrier)+' · '+s.carrier+' '+s.flight,80,yy+4,{width:width-36});doc.y=Math.max(doc.y,yy+32);para(s.from+'   '+s.departureDate+' '+s.departureTime+'   →   '+s.to+'   '+s.arrivalDate+' '+s.arrivalTime);if(s.cabin)para('Cabin: '+s.cabin);if(s.operatingCarrier)para('Operated by '+carrierName(s.operatingCarrier));if(s.baggage)para('Baggage: '+s.baggage);para('Local airport times');doc.moveDown(.4);}
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
