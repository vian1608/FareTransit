/**
 * Shared Email Itinerary Renderer
 * Renders complete multi-segment HTML and plain text for Booking Request, Authorization, and Final Ticket emails.
 */

export function renderEmailItineraryHtml(itineraryInput) {
  const itinerary = itineraryInput || {};
  const outboundSegs = Array.isArray(itinerary.outbound) ? itinerary.outbound : [];
  const returnSegs = Array.isArray(itinerary.return) ? itinerary.return : [];

  if (outboundSegs.length === 0 && returnSegs.length === 0) {
    return `<div style="padding: 12px; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; color: #64748b; font-size: 13px;">Itinerary details pending confirmation.</div>`;
  }

  const renderSegmentHtml = (seg, idx, totalSegs) => {
    const airline = seg.airlineName || (seg.carrierCode ? `${seg.carrierCode} Airlines` : 'Commercial Airline');
    const flightNo = seg.carrierCode && seg.flightNumber ? `${seg.carrierCode} ${seg.flightNumber}` : (seg.flightNumber || seg.carrierCode || 'Flight details pending');
    const cabin = seg.cabinClass || 'Economy';
    const origin = seg.originCode || '—';
    const dest = seg.destinationCode || '—';
    const depDate = seg.departureDate || '';
    const depTime = seg.departureTime || '';
    const arrDate = seg.arrivalDate || '';
    const arrTime = seg.arrivalTime || '';

    let segmentCard = `
      <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px; margin-bottom: 10px;">
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #f1f5f9; padding-bottom: 8px; margin-bottom: 10px;">
          <div>
            <strong style="color: #1e3a5f; font-size: 14px;">${airline}</strong>
            <span style="font-size: 12px; color: #64748b; margin-left: 8px; font-weight: 700;">${flightNo}</span>
          </div>
          <span style="background: #f1f5f9; color: #475569; padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 700; text-transform: uppercase;">${cabin}</span>
        </div>
        <div style="display: table; width: 100%; font-size: 13px;">
          <div style="display: table-cell; width: 45%; vertical-align: top;">
            <div style="font-size: 18px; font-weight: 800; color: #1e3a5f;">${origin}</div>
            <div style="color: #334155; font-weight: 600;">${depTime}</div>
            ${depDate ? `<div style="color: #64748b; font-size: 11px;">${depDate}</div>` : ''}
          </div>
          <div style="display: table-cell; width: 10%; text-align: center; vertical-align: middle; color: #8b1236; font-size: 16px; font-weight: 800;">
            →
          </div>
          <div style="display: table-cell; width: 45%; text-align: right; vertical-align: top;">
            <div style="font-size: 18px; font-weight: 800; color: #1e3a5f;">${dest}</div>
            <div style="color: #334155; font-weight: 600;">${arrTime}</div>
            ${arrDate ? `<div style="color: #64748b; font-size: 11px;">${arrDate}</div>` : ''}
          </div>
        </div>
      </div>
    `;

    if (idx < totalSegs - 1) {
      segmentCard += `
        <div style="text-align: center; padding: 4px 0 10px; color: #92400e; font-size: 12px; font-weight: 700;">
          🔄 Connection at ${dest}
        </div>
      `;
    }

    return segmentCard;
  };

  let html = '';

  if (outboundSegs.length > 0) {
    html += `
      <div style="margin-bottom: 18px;">
        <h4 style="margin: 0 0 10px; color: #1e3a5f; font-size: 13px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px;">
          🛫 Outbound Journey
        </h4>
        ${outboundSegs.map((seg, i) => renderSegmentHtml(seg, i, outboundSegs.length)).join('')}
      </div>
    `;
  }

  if (returnSegs.length > 0) {
    html += `
      <div style="margin-top: 18px;">
        <h4 style="margin: 0 0 10px; color: #1e3a5f; font-size: 13px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px;">
          🛬 Return Journey
        </h4>
        ${returnSegs.map((seg, i) => renderSegmentHtml(seg, i, returnSegs.length)).join('')}
      </div>
    `;
  }

  return html;
}

export function renderEmailItineraryText(itineraryInput) {
  const itinerary = itineraryInput || {};
  const outboundSegs = Array.isArray(itinerary.outbound) ? itinerary.outbound : [];
  const returnSegs = Array.isArray(itinerary.return) ? itinerary.return : [];

  if (outboundSegs.length === 0 && returnSegs.length === 0) {
    return 'Flight itinerary details pending confirmation.';
  }

  const renderSegText = (seg, idx, total) => {
    const airline = seg.airlineName || (seg.carrierCode ? `${seg.carrierCode} Airlines` : 'Commercial Airline');
    const flightNo = seg.carrierCode && seg.flightNumber ? `${seg.carrierCode} ${seg.flightNumber}` : (seg.flightNumber || 'Flight details pending');
    const origin = seg.originCode || '—';
    const dest = seg.destinationCode || '—';
    const depDate = seg.departureDate ? ` on ${seg.departureDate}` : '';
    const depTime = seg.departureTime ? ` at ${seg.departureTime}` : '';
    const arrTime = seg.arrivalTime ? ` -> arrives ${seg.arrivalTime}` : '';
    const cabin = seg.cabinClass ? ` (${seg.cabinClass})` : '';

    let text = `${idx + 1}. ${airline} ${flightNo}${cabin}\n   ${origin}${depTime}${depDate} -> ${dest}${arrTime}`;
    if (idx < total - 1) {
      text += `\n   [Connection at ${dest}]`;
    }
    return text;
  };

  let lines = [];

  if (outboundSegs.length > 0) {
    lines.push('OUTBOUND JOURNEY:');
    outboundSegs.forEach((seg, i) => {
      lines.push(renderSegText(seg, i, outboundSegs.length));
    });
  }

  if (returnSegs.length > 0) {
    lines.push('\nRETURN JOURNEY:');
    returnSegs.forEach((seg, i) => {
      lines.push(renderSegText(seg, i, returnSegs.length));
    });
  }

  return lines.join('\n');
}
