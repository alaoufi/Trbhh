import generated from './generated/snapshot.json';
import {marketListings,type Snapshot,type Listing} from './snapshot';
export type {Listing} from './snapshot';
export const snapshot=generated as Snapshot;
export const isLive=snapshot.mode==='live';
export const categories = [
 {name:'الكل',icon:'LayoutGrid'}, {name:'عقارات',icon:'Building2'}, {name:'سيارات',icon:'Car'}, {name:'معدات وآليات',icon:'Truck'}, {name:'مواشي وزراعة',icon:'Wheat'}, {name:'إلكترونيات',icon:'Smartphone'}, {name:'منزل وأثاث',icon:'Armchair'}, {name:'خدمات',icon:'Wrench'}, {name:'شركات وموردون',icon:'Factory'}, {name:'وظائف',icon:'BriefcaseBusiness'}, {name:'أخرى',icon:'Ellipsis'}
];
export const cities = isLive?['كل المدن',...new Set(snapshot.listings.map(ad=>ad.city).filter(Boolean))]:['كل المدن','الرياض','جدة','الدمام','مكة المكرمة','المدينة المنورة','القصيم','الخبر'];
const demoListings:Listing[] = [
 {id:'101',title:'سيارة دفع رباعي، استخدام نظيف',price:168000,city:'الرياض',category:'سيارات',condition:'مستعمل',time:'قبل ساعتين',image:'/images/suv.jpg',images:['/images/suv.jpg'],seller:'عبدالله العتيبي',verified:true,featured:true,description:'سيارة دفع رباعي واسعة ومناسبة للعائلة، بحالة ممتازة واستخدام شخصي. الصيانة دورية والتكييف يعمل بكفاءة. المعاينة والفحص متاحان بالاتفاق. هذا إعلان تجريبي لعرض التصميم وليس عرضًا حقيقيًا للبيع.',specs:[['نوع المركبة','دفع رباعي'],['الحالة','مستعمل'],['ناقل الحركة','أوتوماتيك'],['الوقود','بنزين'],['الممشى','62,000 كم'],['اللون','أسود']]},
 {id:'102',title:'شقة عصرية بإضاءة طبيعية واسعة',price:780000,city:'الرياض',category:'عقارات',condition:'جديد',time:'قبل 3 ساعات',image:'/images/apartment.jpg',images:['/images/apartment.jpg'],seller:'مساحات للعقار',verified:true,description:'شقة بتوزيع عملي ومساحات مريحة في حي هادئ. ثلاث غرف ومجلس وصالة مع إضاءة طبيعية. جميع المعلومات مثال لمراجعة التصميم.',specs:[['المساحة','180 م²'],['الغرف','3 غرف'],['دورات المياه','3'],['نوع العرض','للبيع']]},
 {id:'103',title:'كنبة قماش بلون محايد',price:1850,city:'جدة',category:'منزل وأثاث',condition:'مستعمل',time:'قبل 4 ساعات',image:'/images/sofa.jpg',images:['/images/sofa.jpg'],seller:'نورة محمد',verified:true,description:'كنبة مريحة بقماش سهل التنظيف، مناسبة لغرفة المعيشة. استخدام بسيط وحالة جيدة. إعلان تجريبي.',specs:[['الخامة','قماش'],['العرض','220 سم'],['الحالة','مستعمل']]},
 {id:'104',title:'لابتوب احترافي للأعمال والدراسة',price:4200,city:'الدمام',category:'إلكترونيات',condition:'مستعمل',time:'قبل 5 ساعات',image:'/images/laptop.jpg',images:['/images/laptop.jpg'],seller:'ركن التقنية',verified:true,featured:true,description:'جهاز خفيف مع شاشة واضحة وبطارية تدوم طويلًا، مناسب للعمل والدراسة. البيانات والصور لشرح التصميم فقط.',specs:[['الذاكرة','16 GB'],['التخزين','512 GB'],['الشاشة','14 بوصة'],['الحالة','مستعمل']]},
 {id:'105',title:'معدات حفر للمشاريع — جاهزة للعمل',price:92000,city:'الدمام',category:'معدات وآليات',condition:'مستعمل',time:'قبل 6 ساعات',image:'/images/excavator.jpg',images:['/images/excavator.jpg'],seller:'المسار للمعدات',verified:true,description:'معدة بحالة تشغيلية جيدة للمشاريع وأعمال الحفر. يمكن تنسيق المعاينة والفحص مع صاحب الإعلان. مثال تجريبي.',specs:[['الفئة','معدات حفر'],['الحالة','مستعمل'],['الموقع','الدمام'],['نوع العرض','للبيع']]},
 {id:'106',title:'كاميرا رقمية صغيرة للرحلات',price:2900,city:'الخبر',category:'إلكترونيات',condition:'مستعمل',time:'قبل 7 ساعات',image:'/images/camera.jpg',images:['/images/camera.jpg'],seller:'خالد أحمد',verified:false,description:'كاميرا مناسبة لتصوير الرحلات والمناسبات بحجم صغير وسهل الحمل. مثال لواجهة الإعلان فقط.',specs:[['النوع','كاميرا رقمية'],['الحالة','مستعمل']]},
 {id:'107',title:'كرسي مكتب مريح قابل للتعديل',price:680,city:'الرياض',category:'منزل وأثاث',condition:'جديد',time:'قبل 8 ساعات',image:'/images/chair.jpg',images:['/images/chair.jpg'],seller:'دار الأثاث',verified:true,featured:true,description:'كرسي للعمل المكتبي بخيارات تعديل للارتفاع والظهر. إعلان تجريبي لكتالوج المتجر.',specs:[['الفئة','أثاث مكتبي'],['الحالة','جديد'],['اللون','محايد']]},
 {id:'108',title:'دراجة للمدينة والرحلات اليومية',price:950,city:'جدة',category:'أخرى',condition:'مستعمل',time:'أمس',image:'/images/bike.jpg',images:['/images/bike.jpg'],seller:'فهد الحربي',verified:true,description:'دراجة مناسبة للاستخدام اليومي والرحلات القصيرة، بحالة جيدة. بيانات تجريبية.',specs:[['النوع','دراجة'],['الحالة','مستعمل'],['الموقع','جدة']]}
];
export const listings=marketListings(snapshot,demoListings);
export const wanted = isLive?[]:[
 {id:'w1',title:'مطلوب سيارة عائلية موديل حديث',city:'الرياض',budget:'حتى 180,000 ر.س',category:'سيارات',time:'قبل ساعة',detail:'أبحث عن سيارة واسعة للعائلة بحالة ممتازة. يفضّل ممشى قليل وفحص شامل.'},
 {id:'w2',title:'مطلوب فوركلفت حمولة 5 طن',city:'الدمام',budget:'الميزانية قابلة للتفاوض',category:'معدات وآليات',time:'قبل ساعتين',detail:'مطلوب رافعة شوكية للعمل داخل المستودع. يمكن مناقشة الحالة وساعات التشغيل.'},
 {id:'w3',title:'مطلوب أثاث مكتب لفريق صغير',city:'جدة',budget:'حتى 12,000 ر.س',category:'منزل وأثاث',time:'قبل 3 ساعات',detail:'أبحث عن مكاتب وكراسي لفريق من ستة أشخاص. يفضّل طقم متناسق.'}
];
export const stores = isLive?[]:[
 {name:'دار الأثاث',initial:'د',category:'منزل وأثاث',city:'الرياض',count:24,color:'#e8e0d3',image:'/images/sofa.jpg'},
 {name:'ركن التقنية',initial:'ر',category:'إلكترونيات',city:'الدمام',count:38,color:'#dfe7ed',image:'/images/laptop.jpg'},
 {name:'المسار للمعدات',initial:'م',category:'معدات وآليات',city:'الدمام',count:16,color:'#ece7d8',image:'/images/excavator.jpg'}
];
export const money = (amount:number) => new Intl.NumberFormat('en-US').format(amount);
