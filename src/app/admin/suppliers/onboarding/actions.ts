'use server';
import {revalidatePath} from 'next/cache';
import {prisma} from '@/lib/prisma';
import {requireAction,hasAction} from '@/lib/roles';
import {MAX_ONBOARDING_BYTES,parseOnboardingWorkbook} from '@/lib/suppliers/onboarding-input';
import {inspectOnboarding,issuePreviewToken,verifyPreviewToken,onboardingFileHash,saveOnboarding,safeOnboardingFilename} from '@/lib/suppliers/onboarding-store';
import {testSupplierReadiness} from '@/lib/suppliers/readiness';
import {supplierConfig} from '@/lib/suppliers/config';
import type {OnboardingUiState} from '@/components/supplier-onboarding';
const messages:Record<string,string>={onboarding_file:'ارفع ملف Excel بصيغة .xlsx، بحجم لا يتجاوز 2 ميجابايت ودون وحدات ماكرو.',onboarding_sheet:'استخدم ورقة واحدة تحتوي بيانات متجر واحد، بحد أقصى 100 صف.',onboarding_single_store:'الملف يجب أن يحتوي بيانات متجر واحد فقط.',onboarding_formula:'استبدل معادلات Excel بقيم نصية قبل الرفع.',onboarding_secret:'احذف حقول كلمات المرور والرموز والأسرار من الملف.',onboarding_header:'يوجد عنوان حقل غير معروف؛ استخدم نموذج التسجيل المتاح للتحميل.',onboarding_duplicate_field:'يوجد حقل مكرر في الملف.',onboarding_cell:'خلية غير صالحة؛ استخدم قيمًا نصية.',onboarding_url_conflict:'يوجد تعارض: رابط متجر سلة مسجل لمورد آخر.',onboarding_identity_conflict:'بيانات السجل لا تطابق المورد المرتبط سابقًا. راجع ملف المورد.',onboarding_duplicate_registration:'السجل التجاري موجود لدى أكثر من مورد؛ يلزم معالجة التعارض أولًا.',onboarding_provider_conflict:'المورد مرتبط بمزود آخر؛ لم يتغير ربطه.',onboarding_preview_stale:'تغيرت بيانات المورد منذ المعاينة؛ أعد المعاينة قبل الحفظ.',onboarding_preview_expired:'انتهت المعاينة أو تغير الملف؛ ارفعه للمعاينة مجددًا.',onboarding_forbidden:'صلاحيتك لا تسمح بإنشاء أو تعديل هذا المورد.',onboarding_encryption:'مفتاح التشفير غير جاهز؛ راجع إعداد الخادم.'};
function failure(error:unknown):OnboardingUiState{return {errors:[messages[error instanceof Error?error.message:'']||'تعذر إكمال العملية؛ لم نعتمد أي حفظ جزئي. أعد المحاولة.'],warnings:[]};}
async function readFile(form:FormData){const file=form.get('file');if(!(file instanceof File)||!file.size||file.size>MAX_ONBOARDING_BYTES)throw Error('onboarding_file');const bytes=Buffer.from(await file.arrayBuffer());return {file,bytes,parsed:await parseOnboardingWorkbook(bytes,file.name)};}
const secret=()=>process.env.SUPPLIER_TOKEN_ENCRYPTION_KEY||'';
export async function previewOnboarding(_previous:OnboardingUiState,form:FormData):Promise<OnboardingUiState>{
 const admin=await requireAction('suppliers','view');
 if(!await hasAction(admin.uid,'suppliers','add')&&!await hasAction(admin.uid,'suppliers','edit'))return failure(Error('onboarding_forbidden'));
 try{const {file,bytes,parsed}=await readFile(form);if(parsed.errors.length)return {errors:parsed.errors,warnings:parsed.warnings};const state=await inspectOnboarding(prisma,parsed.values,secret());
  await prisma.admin_log.create({data:{admin_id:BigInt(admin.uid),action:'معاينة ملف متجر سلة',target:state.existing?String(state.existing.id):'',note:JSON.stringify({filename:safeOnboardingFilename(file.name),operation:state.existing?'update':'create',fields:state.changedKeys})}});
  return {errors:[],warnings:[...parsed.warnings,...state.warnings],preview:{token:issuePreviewToken(state.fingerprint,BigInt(admin.uid),onboardingFileHash(bytes),secret()),filename:safeOnboardingFilename(file.name),storeName:parsed.values.store_name!,registrationNumber:parsed.values.registration_number!,supplierId:state.existing?String(state.existing.id):null,connected:state.connected,changes:state.changes}};
 }catch(e){return failure(e);}
}
export async function confirmOnboarding(_previous:OnboardingUiState,form:FormData):Promise<OnboardingUiState>{
 const admin=await requireAction('suppliers','view');
 try{const {file,bytes,parsed}=await readFile(form);if(parsed.errors.length)return {errors:parsed.errors,warnings:parsed.warnings};const fingerprint=verifyPreviewToken(String(form.get('token')||''),BigInt(admin.uid),onboardingFileHash(bytes),secret());
  const saved=await saveOnboarding(prisma,{values:parsed.values,fingerprint,filename:file.name,adminId:BigInt(admin.uid),secret:secret(),canCreate:await hasAction(admin.uid,'suppliers','add'),canEdit:await hasAction(admin.uid,'suppliers','edit')});
  revalidatePath('/admin/suppliers');revalidatePath('/admin/suppliers/integrations');return {errors:[],warnings:parsed.warnings,saved};
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
