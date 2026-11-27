// Minimal Supabase-shaped in-memory adapter for delivery unit tests; no network or real email.
export function memoryEmailDb(){
 const rows=[];
 return {rows,from(){
  let mode='select',payload,filters={};
  const matches=row=>Object.entries(filters).every(([key,value])=>row[key]===value);
  const q={
   upsert(value){mode='upsert';payload=value;return q;},
   update(value){mode='update';payload=value;return q;},
   select(){return q;},
   eq(key,value){filters[key]=value;return q;},
   async maybeSingle(){
    if(mode==='upsert'){
     if(rows.some(r=>r.idempotency_key===payload.idempotency_key))return {data:null,error:null};
     const row={id:'00000000-0000-4000-8000-'+String(rows.length+1).padStart(12,'0'),tracking_token:'10000000-0000-4000-8000-'+String(rows.length+1).padStart(12,'0'),status:'processing',provider_id:null,...payload};rows.push(row);return {data:{...row},error:null};
    }
    const row=rows.find(matches);if(mode==='update'&&row)Object.assign(row,payload);
    return {data:row?{...row}:null,error:null};
   },
   async single(){return q.maybeSingle();}
  };return q;
 }};
}
