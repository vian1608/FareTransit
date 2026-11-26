import {parseBaggageAllowance,formatBaggageAllowance} from './baggageAllowance';
test('unknown allowance is distinct from explicitly no baggage',()=>{
 expect(parseBaggageAllowance('')).toEqual({carryOn:'',checked:'',custom:false});
 expect(formatBaggageAllowance('0','0')).toBe('No carry-on or checked bags');
 expect(parseBaggageAllowance('No carry-on or checked bags')).toEqual({carryOn:'0',checked:'0',custom:false});
});
test('carry-on and checked quantities are independent and preserve missing information',()=>{
 expect(parseBaggageAllowance('1 Carry-On')).toEqual({carryOn:'1',checked:'',custom:false});
 expect(formatBaggageAllowance('1','2')).toBe('1 carry-on · 2 checked bags');
 expect(parseBaggageAllowance(formatBaggageAllowance('1','2'))).toEqual({carryOn:'1',checked:'2',custom:false});
 expect(formatBaggageAllowance('','2')).toBe('2 checked bags');
 expect(formatBaggageAllowance('1','0')).toBe('1 carry-on · No checked bags');
});
test('unrecognized imported terms must not be reinterpreted',()=>{
 expect(parseBaggageAllowance('2 bags, 23 kg each').custom).toBe(true);
 expect(parseBaggageAllowance('1 carry-on + 1 carry-on').custom).toBe(true);
});
