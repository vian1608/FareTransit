// Preserve the existing ticket baggage string contract, including legacy free text.
// Blank means unknown, not zero; a zero allowance must be selected explicitly.
export function parseBaggageAllowance(value) {
  const text=String(value||'').trim();
  if(!text)return {carryOn:'',checked:'',custom:false};
  if(/^(?:none|no baggage(?: allowance)?|no carry-on or checked bags)$/i.test(text))return {carryOn:'0',checked:'0',custom:false};
  const result={carryOn:'',checked:'',custom:false};
  for(const part of text.split(/\s*(?:,|;|\u00b7|\+)\s*/)){
    const match=part.match(/^(?:(\d{1,2})\s+|(no)\s+)(carry[ -]?ons?|checked bags?)$/i);
    if(!match||Number(match[1]||0)>9)return {carryOn:'',checked:'',custom:true};
    const key=/^carry/i.test(match[3])?'carryOn':'checked';
    if(result[key]!=='')return {carryOn:'',checked:'',custom:true};
    result[key]=match[2]?'0':String(Number(match[1]));
  }
  return result;
}
export function formatBaggageAllowance(carryOn,checked) {
  const valid=v=>typeof v==='string'&&/^[0-9]$/.test(v);
  const carry=valid(carryOn)?Number(carryOn):null;
  const bags=valid(checked)?Number(checked):null;
  if(carry===0&&bags===0)return 'No carry-on or checked bags';
  const parts=[];
  if(carry!==null)parts.push(carry===0?'No carry-on':carry+' carry-on'+(carry===1?'':'s'));
  if(bags!==null)parts.push(bags===0?'No checked bags':bags+' checked bag'+(bags===1?'':'s'));
  return parts.join(' · ');
}
