export type JourneyStage='purchases'|'preparation'|'tracking'|'history';
export function journeyStage(row:{receiptVerified:boolean;supplierStatus:string|null;orderStage:string;shipmentStage?:string;actionRequired?:boolean}):JourneyStage {
 if(!row.receiptVerified||row.supplierStatus!=='supplier_paid'||row.actionRequired)return 'purchases';
 if(row.orderStage==='completed'&&row.shipmentStage==='delivered')return 'history';
 if(row.shipmentStage==='shipped'||row.shipmentStage==='delivered')return 'tracking';
 return 'preparation';
}
