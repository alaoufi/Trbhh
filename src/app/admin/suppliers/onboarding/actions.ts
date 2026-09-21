'use server';
import {revalidatePath} from 'next/cache';
import {prisma} from '@/lib/prisma';
import {requireAction,hasAction} from '@/lib/roles';
import {MAX_ONBOARDING_BYTES,parseOnboardingWorkbook} from '@/lib/suppliers/onboarding-input';
import {inspectOnboarding,issuePreviewToken,verifyPreviewToken,onboardingFileHash,saveOnboarding,safeOnboardingFilename} from '@/lib/suppliers/onboarding-store';
import {testSupplierReadiness} from '@/lib/suppliers/readiness';
import {supplierConfig} from '@/lib/suppliers/config';
import {issueMerchantInvitation} from '@/lib/suppliers/merchant-oauth';
import type {OnboardingUiState} from '@/components/supplier-onboarding';
const messages:Record<string,string>={onboarding_file:'تعذر قراءة ملف Excel.',onboarding_size:'حجم الملف يتجاوز 10 ميجابايت.',onboarding_not_excel:'الملف ليس مصنف Excel حديثًا صالحًا. افتحه واحفظ نسخة بصيغة .xlsx أو .xlsm ثم أعد الرفع.',onboarding_archive:'بنية ملف Excel كبيرة أو غير سليمة.',onboarding_encrypted:'ملف Excel محمي بكلمة مرور؛ احفظ نسخة غير مشفرة ثم أعد الرفع.',onboarding_sheet:'لم نجد بيانات المورد المطلوبة. نزّل نموذج «بيانات المورد» من هذه الصفحة واملأه؛ يمكن إبقاء أوراق التعليمات وسنتجاوزها تلقائيًا.',onboarding_product_export:'هذا ملف منتجات سلة، وليس ملف بيانات المورد. لا ترفعه هنا؛ أضف المورد بنموذج تربح ثم أنشئ رابط التفويض من صفحة تكامل الموردين لتتم مزامنة المنتجات آليًا.',onboarding_single_store:'الملف يجب أن يحتوي بيانات متجر واحد فقط.',onboarding_formula:'استبدل معادلات Excel بقيم نصية قبل الرفع.',onboarding_secret:'احذف حقول كلمات المرور والرموز والأسرار من الملف.',onboarding_header:'يوجد عنوان حقل غير معروف؛ استخدم نموذج التسجيل المتاح للتحميل.',onboarding_duplicate_field:'يوجد حقل مكرر في الملف.',onboarding_cell:'خلية غير صالحة؛ استخدم قيمًا نصية.',onboarding_url_conflict:'يوجد تعارض: رابط متجر سلة مسجل لمورد آخر.',onboarding_identity_conflict:'بيانات السجل لا تطابق المورد المرتبط سابقًا. راجع ملف المورد.',onboarding_duplicate_registration:'السجل التجاري موجود لدى أكثر من مورد؛ يلزم معالجة التعارض أولًا.',onboarding_provider_conflict:'المورد مرتبط بمزود آخر؛ لم يتغير ربطه.',onboarding_preview_stale:'تغيرت بيانات المورد منذ المعاينة؛ أعد المعاينة قبل الحفظ.',onboarding_preview_expired:'انتهت المعاينة أو تغير الملف؛ ارفعه للمعاينة مجددًا.',onboarding_forbidden:'صلاحيتك لا تسمح بإنشاء أو تعديل هذا المورد.',onboarding_encryption:'مفتاح التشفير غير جاهز؛ راجع إعداد الخادم.'};
function failure(error:unknown):OnboardingUiState{return {errors:[messages[error instanceof Error?error.message:'']||'تعذر إكمال العملية؛ لم نعتمد أي حفظ جزئي. أعد المحاولة.'],warnings:[]};}
function toUiReport(r:{imported:string[];corrected:{label:string;note:string}[];skipped:{label:string;note:string}[];needsReview:string[]}){return {imported:r.imported.length,corrected:r.corrected.map(c=>({label:c.label,note:c.note})),skipped:r.skipped.map(s=>({label:s.label,note:s.note})),needsReview:r.needsReview};}
async function readFile(form:FormData){const file=form.get('file');if(!(file instanceof File)||!file.size)throw Error('onboarding_file');if(file.size>MAX_ONBOARDING_BYTES)throw Error('onboarding_size');const bytes=Buffer.from(await file.arrayBuffer());return {file,bytes,parsed:await parseOnboardingWorkbook(bytes,file.name)};}
const secret=()=>process.env.SUPPLIER_TOKEN_ENCRYPTION_KEY||'';
export async function previewOnboarding(_previous:OnboardingUiState,form:FormData):Promise<OnboardingUiState>{
 const admin=await requireAction('suppliers','view');
 if(!await hasAction(admin.uid,'suppliers','add')&&!await hasAction(admin.uid,'suppliers','edit'))return failure(Error('onboarding_forbidden'));
 try{const {file,bytes,parsed}=await readFile(form);if(parsed.errors.length)return {errors:parsed.errors,warnings:parsed.warnings,report:toUiReport(parsed.report)};const state=await inspectOnboarding(prisma,parsed.values,secret());
  await prisma.admin_log.create({data:{admin_id:BigInt(admin.uid),action:'معاينة ملف متجر سلة',target:state.existing?String(state.existing.id):'',note:JSON.stringify({filename:safeOnboardingFilename(file.name),operation:state.existing?'update':'create',fields:state.changedKeys})}});
  return {errors:[],warnings:[...parsed.warnings,...state.warnings],report:toUiReport(parsed.report),preview:{token:issuePreviewToken(state.fingerprint,BigInt(admin.uid),onboardingFileHash(bytes),secret()),filename:safeOnboardingFilename(file.name),storeName:parsed.values.store_name!,registrationNumber:parsed.values.registration_number!,supplierId:state.existing?String(state.existing.id):null,connected:state.connected,changes:state.changes}};
 }catch(e){return failure(e);}
}
export async function confirmOnboarding(_previous:OnboardingUiState,form:FormData):Promise<OnboardingUiState>{
 const admin=await requireAction('suppliers','view');
 try{const {file,bytes,parsed}=await readFile(form);if(parsed.errors.length)return {errors:parsed.errors,warnings:parsed.warnings,report:toUiReport(parsed.report)};const fingerprint=verifyPreviewToken(String(form.get('token')||''),BigInt(admin.uid),onboardingFileHash(bytes),secret());
  const saved=await saveOnboarding(prisma,{values:parsed.values,fingerprint,filename:file.name,adminId:BigInt(admin.uid),secret:secret(),canCreate:await hasAction(admin.uid,'suppliers','add'),canEdit:await hasAction(admin.uid,'suppliers','edit')});
  const warnings=[...parsed.warnings];let authorizationUrl:string|undefined,authorizationExpiresAt:string|undefined;
  if(!saved.connected){try{const invitation=await issueMerchantInvitation(prisma,BigInt(saved.supplierId),BigInt(admin.uid),supplierConfig());authorizationUrl=invitation.url;authorizationExpiresAt=invitation.expiresAt.toISOString();}catch{warnings.push('تم حفظ المورد، لكن تعذر إنشاء رابط التفويض الآن. أنشئه من صفحة التكاملات.');}}
  revalidatePath('/admin/suppliers');revalidatePath('/admin/suppliers/integrations');return {errors:[],warnings,report:toUiReport(parsed.report),saved:{...saved,authorizationUrl,authorizationExpiresAt}};
 }catch(e){return failure(e);}
}
export async function checkOnboarding(_previous:OnboardingUiState,form:FormData):Promise<OnboardingUiState>{
 const admin=await requireAction('suppliers','edit');
 try{const raw=String(form.get('supplierId')||'');if(!/^[1-9]\d{0,14}$/.test(raw))throw Error();const id=BigInt(raw);
  const [supplier]=await prisma.$queryRaw<{name:string}[]>`SELECT s.name FROM commerce_suppliers s JOIN supplier_onboarding o ON o.supplier_id=s.id WHERE s.id=${id}`;if(!supplier)throw Error();
  const result=await testSupplierReadiness(prisma,id,BigInt(admin.uid),supplierConfig());
  const [current]=await prisma.$queryRaw<{id:bigint}[]>`SELECT id FROM supplier_connections WHERE supplier_id=${id} AND provider='salla' AND status='connected' LIMIT 1`;
  return {errors:[],warnings:[],saved:{supplierId:raw,storeName:supplier.name,connected:!!current,status:result.status,code:result.code,sampleCount:result.sampleCount}};
 }catch{return {errors:['تعذر فحص الاتصال. تحقق من إعدادات سلة وصلاحيات قراءة المتجر والمنتجات ثم أعد المحاولة.'],warnings:[]};}
}
