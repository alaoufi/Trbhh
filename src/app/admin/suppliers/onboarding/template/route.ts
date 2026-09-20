import {Workbook} from 'exceljs';
import {requireAction} from '@/lib/roles';
import {ONBOARDING_FIELDS} from '@/lib/suppliers/onboarding-fields';
export const runtime='nodejs';
export async function GET(){
 await requireAction('suppliers','view');const workbook=new Workbook(),sheet=workbook.addWorksheet('تسجيل متجر سلة');sheet.views=[{rightToLeft:true}];
 sheet.columns=[{header:'الحقل',key:'field',width:42},{header:'القيمة',key:'value',width:60}];
 sheet.getRow(1).font={bold:true,color:{argb:'FFFFFFFF'}};sheet.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF16294A'}};
 for(const [,label,required]of ONBOARDING_FIELDS){const row=sheet.addRow([label,'']);row.getCell(2).numFmt='@';row.getCell(1).font={bold:required};row.getCell(2).note=required?'مطلوب. أدخل القيمة كنص.':'اختياري. الخلية الفارغة لا تغير القيمة الحالية؛ اكتب لا يوجد لمسحها.';}
 const bytes=await workbook.xlsx.writeBuffer();return new Response(new Uint8Array(bytes),{headers:{'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Content-Disposition':'attachment; filename="salla-store-onboarding.xlsx"','Cache-Control':'private, no-store'}});
}
