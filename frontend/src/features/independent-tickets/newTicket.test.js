/** @jest-environment jsdom */
import React from 'react';
import {createRoot} from 'react-dom/client';
import {act,Simulate} from 'react-dom/test-utils';
import IndependentTicketPage from './IndependentTicketPage';
jest.mock('../../shared/api/api',()=>({__esModule:true,default:{get:jest.fn(),post:jest.fn(),patch:jest.fn()},getApiErrorMessage:()=>''}));
jest.mock('../../shared/components/AirlineLogo',()=>()=>null);
jest.mock('./TicketHistory',()=>({__esModule:true,default:()=>null,TicketActivity:()=>null}));
let host,root;
beforeEach(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;host=document.createElement('div');document.body.appendChild(host);root=createRoot(host);act(()=>root.render(<IndependentTicketPage/>));});
afterEach(()=>{act(()=>root.unmount());host.remove();delete global.IS_REACT_ACT_ENVIRONMENT;});
const button=label=>Array.from(host.querySelectorAll('button')).find(b=>b.textContent.trim()===label);
const click=label=>act(()=>button(label).click());
test('New ticket immediately opens a blank flight manual editor and leaves booking import available',()=>{
 expect(host.querySelector('.it-editor')).toBeNull();
 click('+ New ticket');
 expect(host.querySelector('.it-editor')).not.toBeNull();
 expect(button('Flights').className).toBe('it-primary');
 expect(button('Manual Entry').className).toBe('it-primary');
 expect(button('With Booking ID')).toBeDefined();
 click('With Booking ID');
 expect(button('Fetch booking')).toBeDefined();
 click('+ New ticket');
 expect(host.querySelector('.it-editor')).not.toBeNull();
 expect(button('Manual Entry').className).toBe('it-primary');
 expect(button('Fetch booking')).toBeUndefined();
});
test('New ticket resets unsaved fields and closes GDS import',()=>{
 click('+ New ticket');
 const input=host.querySelector('.it-editor input:not([type=checkbox])');
 expect(input).not.toBeNull();
 act(()=>{input.value='Temporary entry';Simulate.change(input);});
 expect(input.value).toBe('Temporary entry');
 click('GDS Import');
 expect(host.querySelector('.it-modal')).not.toBeNull();
 click('+ New ticket');
 expect(host.querySelector('.it-modal')).toBeNull();
 expect(host.querySelector('.it-editor input:not([type=checkbox])').value).toBe('');
});
