import {describe,it,expect} from 'vitest';
import {allocateCosts} from '@/lib/suppliers/reservations';
describe('reserved stock cost policy',()=>{
 it('exhausts a partial batch then prices the remainder exactly',()=>{expect(allocateCosts([{id:1n,remaining_quantity:3,held_quantity:0,unit_cost_minor:3500}],5,4000)).toEqual([{reservationId:1n,quantity:3,unitCostMinor:3500},{reservationId:null,quantity:2,unitCostMinor:4000}]);});
 it('uses next batch after consuming the first',()=>{expect(allocateCosts([{id:1n,remaining_quantity:50,held_quantity:1,unit_cost_minor:3500},{id:2n,remaining_quantity:100,held_quantity:0,unit_cost_minor:3200}],50,4000)).toEqual([{reservationId:1n,quantity:49,unitCostMinor:3500},{reservationId:2n,quantity:1,unitCostMinor:3200}]);});
 it('falls back to normal cost after exhaustion',()=>{expect(allocateCosts([{id:1n,remaining_quantity:0,held_quantity:0,unit_cost_minor:3500}],1,4000)).toEqual([{reservationId:null,quantity:1,unitCostMinor:4000}]);});
 it('does not oversell held quantity and rejects invalid quantities',()=>{expect(allocateCosts([{id:1n,remaining_quantity:50,held_quantity:50,unit_cost_minor:3500}],1,4000)[0].reservationId).toBeNull();expect(()=>allocateCosts([],0,4000)).toThrow();});
});
