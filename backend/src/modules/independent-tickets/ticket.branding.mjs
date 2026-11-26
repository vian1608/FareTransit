import path from 'node:path';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {getCarrierLogoUrl} from '../../shared/utils/airline-lookup.mjs';
// Only assets present in the repository catalog at rollout; no arbitrary user-controlled image URLs.
const available=new Set(["3U","5J","6E","9C","A3","AA","AC","AD","AF","AI","AK","AM","AR","AS","AT","AV","AY","AZ","B6","BA","BG","BR","BT","CA","CI","CM","CX","CZ","D7","DL","DY","EI","EK","ET","EY","F9","FD","FI","FR","FZ","G3","G9","GA","GF","HA","HO","HU","HX","IB","JL","JQ","JU","KE","KL","KQ","KU","LA","LH","LO","LX","LY","ME","MF","MH","MS","MU","NH","NK","NZ","OS","OZ","PC","PK","PR","QF","QR","QZ","RJ","RO","SA","SC","SK","SN","SQ","SU","SV","TG","TK","TP","TR","U2","UA","UL","UO","UX","VA","VB","VN","VS","VY","W6","WN","WS","WY","XQ","Y4","ZH"]);
const publicRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../../../frontend/public');
export const brandMarkUrl='https://www.faretransit.com/favicon.png';
export const carrierLogoUrl=code=>available.has(code)?getCarrierLogoUrl(code):'';
function localAsset(relative){
 const roots=[publicRoot,path.resolve(process.cwd(),'frontend/public'),path.resolve(process.cwd(),'../frontend/public')];
 for(const root of roots){const p=path.join(root,relative);if(fs.existsSync(p))return p;}
 return null;
}
export const localCarrierLogo=code=>available.has(code)?localAsset('assets/airlines/'+code.toLowerCase()+'.png'):null;
export const localBrandMark=()=>localAsset('favicon.png');
