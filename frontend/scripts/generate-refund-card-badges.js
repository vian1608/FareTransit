// Generate small, self-hosted PNG network badges for HTML email clients.
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib');
const target=path.join(__dirname,'../public/assets/refund-cards');
fs.mkdirSync(target,{recursive:true});
const font={A:["01110","10001","10001","11111","10001","10001","10001"],C:["01111","10000","10000","10000","10000","10000","01111"],D:["11110","10001","10001","10001","10001","10001","11110"],E:["11111","10000","10000","11110","10000","10000","11111"],I:["111","010","010","010","010","010","111"],M:["10001","11011","10101","10101","10001","10001","10001"],O:["01110","10001","10001","10001","10001","10001","01110"],R:["11110","10001","10001","11110","10100","10010","10001"],S:["01111","10000","10000","01110","00001","00001","11110"],V:["10001","10001","10001","10001","10001","01010","00100"],X:["10001","10001","01010","00100","01010","10001","10001"]};
const u32=n=>{const b=Buffer.alloc(4);b.writeUInt32BE(n>>>0);return b;};
const crc=a=>{let n=0xffffffff;for(const b of a){n^=b;for(let j=0;j<8;j++)n=(n>>>1)^((n&1)?0xedb88320:0);}return (n^0xffffffff)>>>0};
const chunk=(name,data)=>{const type=Buffer.from(name),bytes=Buffer.concat([type,data]);return Buffer.concat([u32(data.length),bytes,u32(crc(bytes))]);};
function badge(kind){
 const w=144,h=48,p=Buffer.alloc(w*h),palette=[[255,255,255],[31,48,115],[235,0,27],[247,158,27],[0,111,181],[255,111,0],[23,43,70]];
 const rect=(x,y,ww,hh,c)=>{for(let j=y;j<y+hh;j++)for(let i=x;i<x+ww;i++)if(i>=0&&i<w&&j>=0&&j<h)p[j*w+i]=c;};
 const circle=(cx,cy,r,c)=>{for(let y=0;y<h;y++)for(let x=0;x<w;x++)if((x-cx)**2+(y-cy)**2<=r*r)p[y*w+x]=c;};
 function label(t,s,c){const width=[...t].reduce((n,l)=>n+(font[l][0].length+1)*s,0)-s;let x=Math.floor((w-width)/2),y=Math.floor((h-7*s)/2);for(const l of t){const g=font[l];for(let j=0;j<7;j++)for(let i=0;i<g[j].length;i++)if(g[j][i]==='1')rect(x+i*s,y+j*s,s,s,c);x+=(g[0].length+1)*s;}}
 if(kind==='visa'){rect(0,0,w,4,1);rect(0,h-4,w,4,1);label('VISA',4,1);}
 if(kind==='mastercard'){circle(59,24,19,2);circle(85,24,19,3);for(let y=0;y<h;y++)for(let x=0;x<w;x++)if((x-59)**2+(y-24)**2<=361&&(x-85)**2+(y-24)**2<=361)p[y*w+x]=5;}
 if(kind==='amex'){rect(0,0,w,h,4);label('AMEX',4,0);}
 if(kind==='discover'){rect(0,h-4,w,4,5);label('DISCOVER',3,6);}
 const raw=Buffer.alloc((w+1)*h);for(let y=0;y<h;y++)p.copy(raw,y*(w+1)+1,y*w,(y+1)*w);
 const ihdr=Buffer.concat([u32(w),u32(h),Buffer.from([8,3,0,0,0])]);
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('PLTE',Buffer.from(palette.flat())),chunk('IDAT',zlib.deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);
}
for(const brand of ['visa','mastercard','amex','discover'])fs.writeFileSync(path.join(target,brand+'.png'),badge(brand));
