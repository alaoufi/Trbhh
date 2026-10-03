import React from 'react';
import {createRoot} from 'react-dom/client';
import {AdForm} from '../../src/components/ad-form';
import {CATEGORY_LABELS} from '../../src/lib/ad-categories/contracts';
import {validateDefinition} from '../../src/lib/ad-categories/validation';

const fields=validateDefinition([{key:'capacity',label:'الحمولة',type:'range',group:'المواصفات',required:false,visible:true,order:0,options:[],min:1,max:100}]);
createRoot(document.getElementById('root')!).render(<AdForm
  action={async()=>({error:{fieldKey:'capacity',message:'الحمولة خارج النطاق المسموح'}})}
  countries={[]} cities={[]} submitLabel="حفظ الاختبار"
  initial={{categoryId:1,subcategoryId:1,title:'عنوان محفوظ',detail:'تفاصيل محفوظة',phone:'0500000000'}}
  categoryConfig={{enabled:true,labels:CATEGORY_LABELS,categories:[{id:1,name:'اختبار',active:true,order:0}],subcategories:[{id:1,categoryId:1,name:'نطاق اختياري',active:true,order:0,version:1,kind:'jobs',priceEnabled:false,goodsEnabled:false,fields}]}}
/>);
