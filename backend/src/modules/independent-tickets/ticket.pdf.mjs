import PDFDocument from 'pdfkit';
import {carrierName,cents,money,paymentTotal} from './ticket.model.mjs';
import {localCarrierLogo,localBrandMark} from './ticket.branding.mjs';

import {flightDisplay,connectionDisplay} from './ticket.flight-display.mjs';
import {displayUsd,merchantAmount,paymentLabel,maskedCard} from './ticket.payment-display.mjs';
import {passengerSeatGroups} from './ticket.seats.mjs';
const burgundy='#8b1236',ink='#23334b';
import {ticketTitle,ticketConfirmationLine} from './ticket.header.mjs';
import {supportPhone,supportPhoneUri} from './ticket.support.mjs';
export {ticketConfirmationLine as pdfConfirmationLine} from './ticket.header.mjs';
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
   const title=(t,keep=0)=>{ensure(32+keep);doc.font('Helvetica-Bold').fontSize(13).fillColor(burgundy);doc.x=44;doc.y+=8;doc.text(t,44,doc.y,{width});doc.x=44;doc.y+=5;};
   const para=t=>{doc.font('Helvetica').fontSize(10).fillColor(ink).text(String(t??''),44,doc.y,{width,lineGap:2});doc.x=44;};
   const logo=(file,x,y,w=28)=>{if(file)try{doc.image(file,x,y,{fit:[w,w]});}catch{/* Fall back to printed name */}};
   // Single compact header row. Airline branding is informational, not a partnership claim.
   const brand=localBrandMark(),right=44+width;
   logo(brand,44,44,38);
   doc.font('Helvetica-Bold').fillColor(burgundy).fontSize(23).text('FareTransit',brand?90:44,51,{lineBreak:false});
   const carriers=[...new Set(d.segments.map(s=>s.carrier).filter(Boolean))];
   // Header is logo-only; airline names remain in the detailed itinerary.
   const marks=carriers.map(localCarrierLogo).filter(Boolean).slice(0,5);
   const markSize=36,markGap=8;
   marks.forEach((file,i)=>logo(file,right-marks.length*markSize-(marks.length-1)*markGap+i*(markSize+markGap),45,markSize));
   doc.x=44;doc.y=94;
   const y=doc.y;doc.roundedRect(44,y,width,34,8).fill(burgundy);
   doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(15).text(ticketTitle(d),58,y+9,{width:width-28,lineBreak:false});
   doc.x=44;doc.y=y+43;
   const confirmationLine=ticketConfirmationLine(d);if(confirmationLine)para(confirmationLine);
   if(draft)para('DRAFT — NOT VALID FOR TRAVEL');
   const smallLabel=(s,x,y,w,align='left')=>doc.font('Helvetica-Bold').fontSize(8).fillColor('#64748b').text(s,x,y,{width:w,align,lineBreak:false});
   title('Passenger details',d.passengers.length?85:0);
   for(const [i,p] of d.passengers.entries()){
    const name=p.name||'Not entered',ticket=p.ticketNumber||'',left=ticket?width*.51-24:width-24,right=width*.49-24;
    doc.font('Helvetica-Bold').fontSize(13);const nameH=doc.heightOfString(name,{width:left}),ticketH=ticket?doc.heightOfString(ticket,{width:right}):0;
    const h=60+Math.max(nameH,ticketH);ensure(h+8);const yy=doc.y,x=44;
    doc.roundedRect(x,yy,width,h,7).lineWidth(.7).stroke('#dce3ec');doc.rect(x+1,yy+1,width-2,22).fill('#f4f6fa');
    smallLabel('PASSENGER '+String(i+1).padStart(2,'0'),x+12,yy+7,width-24);
    smallLabel('PASSENGER NAME',x+12,yy+33,left);doc.font('Helvetica-Bold').fontSize(13).fillColor(ink).text(name,x+12,yy+46,{width:left});
    if(ticket){const xx=x+width*.51;doc.moveTo(xx,yy+23).lineTo(xx,yy+h-1).stroke('#e5eaf0');smallLabel('E-TICKET NUMBER',xx+12,yy+33,right,'right');doc.font('Helvetica-Bold').fontSize(13).fillColor(ink).text(ticket,xx+12,yy+46,{width:right,align:'right'});}
    doc.x=44;doc.y=yy+h+8;
    const groups=passengerSeatGroups(d,p);
    if(groups.length){
     ensure(36);doc.font('Helvetica-Bold').fontSize(11).fillColor(ink).text('Assigned seats - '+name,44,doc.y,{width});doc.moveDown(.4);
     for(const g of groups){
      for(let offset=0;offset<g.legs.length;offset+=4){
       const before=doc.page;ensure(84);if(doc.page!==before){doc.font('Helvetica-Bold').fontSize(10).fillColor(ink).text('Assigned seats - '+name,44,doc.y,{width});doc.moveDown(.4);}
       const gy=doc.y;smallLabel(g.direction.toUpperCase(),44,gy,width);const boxY=gy+13,boxW=(width-18)/4;
       g.legs.slice(offset,offset+4).forEach((l,j)=>{
        const bx=44+j*(boxW+6);
        doc.roundedRect(bx,boxY,boxW,60,5).fill('#f4f6fa');
        doc.font('Helvetica-Bold').fontSize(10).fillColor(ink).text(l.flight,bx+3,boxY+6,{width:boxW-6,align:'center',lineBreak:false,ellipsis:true});
        doc.font('Helvetica').fontSize(8).fillColor('#64748b').text(l.route,bx+3,boxY+19,{width:boxW-6,align:'center',lineBreak:false,ellipsis:true});
        doc.text(l.date,bx+3,boxY+30,{width:boxW-6,align:'center',lineBreak:false});
        doc.font('Helvetica-Bold').fontSize(16).fillColor(burgundy).text(l.seat,bx+3,boxY+41,{width:boxW-6,align:'center',lineBreak:false});
       });
       doc.x=44;doc.y=boxY+67;
      }
     }
    }
   }
   if(d.references.length){
    title('Airline confirmation',76);
    for(const r of d.references){
     const name=carrierName(r.carrier),logoFile=localCarrierLogo(r.carrier),nameX=logoFile?86:56,right=width*.40;
     const nameWidth=width-right-30-(nameX-44);doc.font('Helvetica-Bold').fontSize(12);
     const h=Math.max(68,35+doc.heightOfString(name,{width:nameWidth}));ensure(h+8);const yy=doc.y,x=44;
     doc.roundedRect(x,yy,width,h,7).lineWidth(.7).stroke('#dce3ec');logo(logoFile,x+12,yy+18,24);
     smallLabel('AIRLINE',nameX,yy+15,nameWidth);doc.font('Helvetica-Bold').fontSize(12).fillColor(ink).text(name,nameX,yy+29,{width:nameWidth});
     const rx=x+width-right-9;doc.roundedRect(rx,yy+9,right,h-18,5).fill('#f4f6fa');smallLabel('CONFIRMATION CODE (PNR)',rx+4,yy+17,right-8,'center');
     doc.font('Helvetica-Bold').fontSize(20).fillColor(burgundy).text(r.pnr||'—',rx+4,yy+32,{width:right-8,align:'center',lineBreak:false,ellipsis:true});
     doc.x=44;doc.y=yy+h+8;
    }
   }
   for(const direction of ['outbound','inbound']){
    const seg=d.segments.filter(s=>s.direction===direction);if(!seg.length)continue;
    title(direction==='outbound'?'Outbound journey':'Inbound journey',190);
    // Draw the route arrow as a vector: built-in Helvetica uses WinAnsi,
    // which cannot encode U+2192. Keep the airport labels as searchable text.
    ensure(20);
    const routeY=doc.y,origin=seg[0].from,destination=seg[seg.length-1].to;
    doc.font('Helvetica').fontSize(10).fillColor(ink);
    doc.text(origin,44,routeY,{lineBreak:false});
    const arrowX=44+doc.widthOfString(origin)+6,arrowY=routeY+5;
    doc.save().lineWidth(.9).strokeColor(ink).moveTo(arrowX,arrowY).lineTo(arrowX+12,arrowY).moveTo(arrowX+8,arrowY-3).lineTo(arrowX+12,arrowY).lineTo(arrowX+8,arrowY+3).stroke().restore();
    doc.text(destination+' · '+seg.length+' flight'+(seg.length===1?'':'s'),arrowX+18,routeY,{lineBreak:false});
    doc.x=44;doc.y=routeY+15;
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
    title('Payment & merchant charges',104);
    const merchants=d.payment.merchants;
    ensure(34);let yy=doc.y;doc.roundedRect(44,yy,width,24,4).fill('#f4f6fa');smallLabel('MERCHANT / PAYMENT METHOD',56,yy+8,width*.6);smallLabel('AMOUNT (USD)',44+width*.64,yy+8,width*.36-12,'right');doc.x=44;doc.y=yy+29;
    for(const m of merchants){
     const name=m.merchant||'Merchant to be confirmed',card=maskedCard(m),left=width*.62-24;
     doc.font('Helvetica-Bold').fontSize(12);const nameH=doc.heightOfString(name,{width:left});
     doc.font('Helvetica').fontSize(9);const cardH=card?doc.heightOfString(card,{width:left})+4:0;
     const h=Math.max(60,40+nameH+cardH);ensure(h+4);yy=doc.y;
     doc.roundedRect(44,yy,width,h,5).lineWidth(.7).stroke('#dce3ec');
     doc.font('Helvetica-Bold').fontSize(12).fillColor(ink).text(name,56,yy+10,{width:left});
     let sy=yy+13+nameH;if(card){doc.font('Helvetica').fontSize(9).fillColor('#475569').text(card,56,sy,{width:left});sy+=cardH;}
     const [bg,fg]=m.status==='charged'?['#edf6ef','#245c36']:m.status==='authorized'?['#eef3fa','#355579']:['#fff6e7','#845817'];
     doc.font('Helvetica-Bold').fontSize(8);const label=paymentLabel(m.status),bw=doc.widthOfString(label)+14;
     doc.roundedRect(56,sy+3,bw,15,3).fill(bg);doc.fillColor(fg).text(label,63,sy+7,{lineBreak:false});
     doc.font('Helvetica-Bold').fontSize(15).fillColor(ink).text(merchantAmount(m),44+width*.64,yy+h/2-9,{width:width*.36-12,align:'right',lineBreak:false,ellipsis:true});
     doc.x=44;doc.y=yy+h+4;
    }
    for(const status of ['charged','authorized','pending'])if(merchants.some(m=>m.status===status)){
     const valid=merchants.filter(m=>m.status===status).every(m=>cents(m.amount)!==null&&m.currency==='USD');
     ensure(42);yy=doc.y;doc.roundedRect(44,yy,width,36,5).fill('#f4f6fa');
     doc.font('Helvetica-Bold').fontSize(11).fillColor(ink).text('Total '+status,56,yy+12,{width:width*.45,lineBreak:false});
     doc.font('Helvetica-Bold').fontSize(18).fillColor(burgundy).text(valid?displayUsd(paymentTotal(d,status))+' USD':'Amount to be confirmed',44+width*.47,yy+9,{width:width*.53-12,align:'right',lineBreak:false,ellipsis:true});
     doc.x=44;doc.y=yy+41;
    }
    para('Separate merchant transactions may appear on your card statement.');
   }
   if(d.notes){
    title('Special notes');doc.font('Helvetica').fontSize(10);
    const nh=doc.heightOfString(d.notes,{width:width-28,lineGap:3})+24;
    if(nh<doc.page.height-120){ensure(nh+8);const ny=doc.y;doc.roundedRect(44,ny,width,nh,4).fill('#f4f6fa');doc.rect(44,ny,3,nh).fill(burgundy);doc.font('Helvetica').fontSize(10).fillColor(ink).text(d.notes,58,ny+12,{width:width-28,lineGap:3});doc.x=44;doc.y=ny+nh+8;}
    else{doc.font('Helvetica').fontSize(10).fillColor(ink).text(d.notes,44,doc.y,{width,lineGap:3});doc.x=44;}
   }
   ensure(78);const fy=doc.y+7;doc.moveTo(44,fy).lineTo(44+width,fy).stroke('#dce3ec');doc.font('Helvetica-Bold').fontSize(11).fillColor(burgundy).text('Prepared by FareTransit LLC',44,fy+10,{width:width*.55,lineBreak:false});
   doc.font('Helvetica').fontSize(9).fillColor(ink).text('support@faretransit.com',44+width*.55,fy+11,{width:width*.45,align:'right',lineBreak:false});doc.font('Helvetica-Bold').fontSize(10).fillColor(ink).text(supportPhone,44+width*.55,fy+24,{width:width*.45,align:'right',lineBreak:false,link:supportPhoneUri});doc.x=44;doc.y=fy+42;para('Airline reservation details should be verified with the airline.');
   // PDFKit can auto-create pages when a width-constrained text line is drawn
   // below the content boundary. Stamp page numbers with an explicit x/y
   // and NO wrapping width, so footer drawing cannot create extra pages.
   const range=doc.bufferedPageRange();
   for(let i=range.start;i<range.start+range.count;i++){
    doc.switchToPage(i);
    const text='FareTransit · '+(i-range.start+1)+' / '+range.count;
    doc.font('Helvetica').fontSize(8).fillColor('#65758b');
    const x=44+width-doc.widthOfString(text);
    doc.text(text,x,doc.page.height-32,{lineBreak:false});
   }
   if(doc.bufferedPageRange().count!==range.count)throw Error('PDF footer unexpectedly added pages');
   doc.end();
  }catch(e){doc.destroy();reject(e);}
 });
}
