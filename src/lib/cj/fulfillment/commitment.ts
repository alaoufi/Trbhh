import {validateLiveCjQuote,type LiveCjQuote} from '../live-quote';
import type {Commitment} from './worker';
import {canonicalCjDestination} from '../live-destination';
function record(value:unknown):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value))throw Error('cj_quote_shape_invalid');return value as Record<string,unknown>;}
/** Validate the original hashed snapshot before selecting its supplier fields. */
export function validateAndTransformLiveCjQuoteToCommitment(value:unknown):Commitment {
 const raw=record(value),destination=record(raw.destination);
 if(Object.values(destination).some(v=>typeof v!=='string'))throw Error('cj_quote_destination_invalid');
 for(const key of ['checkedAt','expiresAt','destinationHash','fulfillmentGroup','supplierReference','originAreaId','originCountry','logisticName'])if(typeof raw[key]!=='string'||!raw[key])throw Error('cj_quote_shape_invalid');
 for(const key of ['version','supplierFreightUsdMinor','supplierTaxUsdMinor','supplierUsdMinor','usdToSarX100','marginBps','customerShippingSarMinor','customerTaxSarMinor','customerSarMinor'])if(typeof raw[key]!=='number'||!Number.isSafeInteger(raw[key]))throw Error('cj_quote_shape_invalid');
 if(!Array.isArray(raw.lines))throw Error('cj_quote_lines_invalid');
 for(const value of raw.lines){const line=record(value);for(const key of ['productId','pid','vid'])if(typeof line[key]!=='string')throw Error('cj_quote_lines_invalid');for(const key of ['quantity','supplierUnitUsdMinor','customerUnitSarMinor'])if(typeof line[key]!=='number'||!Number.isSafeInteger(line[key]))throw Error('cj_quote_lines_invalid');}
 // Payment initiation already checked expiry. Fulfillment may legitimately run later;
 // validate the historical approved quote at its own checked instant, not today's clock.
 const quote=raw as unknown as LiveCjQuote;
 validateLiveCjQuote(quote,quote.destination,new Date(quote.checkedAt));
 const canonical=canonicalCjDestination(quote.destination,{alreadyCanonical:true});
 return {supplierReference:quote.supplierReference,supplierUsdMinor:quote.supplierUsdMinor,supplierFreightUsdMinor:quote.supplierFreightUsdMinor,supplierTaxUsdMinor:quote.supplierTaxUsdMinor,originAreaId:quote.originAreaId,originCountry:quote.originCountry,logisticName:quote.logisticName,lines:quote.lines.map(({pid,vid,quantity,supplierUnitUsdMinor})=>({pid,vid,quantity,supplierUnitUsdMinor})),destination:canonical};
}
