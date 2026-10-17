/** General reference only; never used to select or convert a purchasable variant. */
const women=[['6','36.5'],['6.5','37.5'],['7','38'],['7.5','38.5'],['8','39'],['8.5','40'],['9','40.5'],['9.5','41'],['10','42'],['10.5','42.5'],['11','43'],['11.5','44'],['12','44.5'],['12.5','45']];
const men=[['6','38.5'],['6.5','39'],['7','40'],['7.5','40.5'],['8','41'],['8.5','42'],['9','42.5'],['9.5','43'],['10','44'],['10.5','44.5'],['11','45'],['11.5','45.5'],['12','46'],['12.5','47'],['13','47.5']];
function Chart({title,headers,rows}:{title:string;headers:string[];rows:string[][]}){
 return <details className="min-w-0 rounded-lg border p-2"><summary className="cursor-pointer py-1 text-sm font-bold">{title}</summary><div className="mt-2 max-h-72 overflow-auto"><table className="w-full text-center text-sm"><thead><tr>{headers.map(h=><th key={h} scope="col" className="sticky top-0 bg-slate-100 p-2">{h}</th>)}</tr></thead><tbody>{rows.map((row,i)=><tr key={i} className="border-t">{row.map((v,j)=>j===0?<th key={j} scope="row" className="p-2 font-normal" dir="auto">{v}</th>:<td key={j} className="p-2" dir="auto">{v}</td>)}</tr>)}</tbody></table></div></details>;
}
export function SizeReferenceGuide(){
 return <details className="my-3 min-w-0 rounded-xl border border-primary/25 bg-white p-3" data-size-reference="general"><summary className="cursor-pointer text-sm font-bold text-primary">جدول معادلة المقاسات — أحذية وملابس (فتح / طي)</summary><div className="mt-3 space-y-3">
 <p className="text-xs leading-5 text-slate-600">مرجع إرشادي من جداول علامات تجارية، وليس جدول هذا المنتج. تختلف المقاسات حسب الشركة والفئة؛ جدول المنتج المعتمد أولى. لا يغيّر هذا الجدول الخيار المحدد في الطلب.</p>
 <div className="grid min-w-0 gap-2 sm:grid-cols-2"><Chart title="الأحذية النسائية — مرجع Nike" headers={['أمريكي نسائي US','أوروبي EU']} rows={women}/><Chart title="الأحذية الرجالية — مرجع Nike" headers={['أمريكي رجالي US','أوروبي EU']} rows={men}/></div>
 <p className="text-xs">مصدر الأحذية: <a className="underline" href="https://www.nike.com/size-fit/womens-footwear" target="_blank" rel="noreferrer">نسائي</a> · <a className="underline" href="https://www.nike.com/size-fit/mens-footwear" target="_blank" rel="noreferrer">رجالي</a>. لا تُطبّق هذه القيم على الأطفال.</p>
 <Chart title="الملابس النسائية — مثال مرجعي DOUBLE" headers={['الدولي','أوروبي EU','أمريكي US','بريطاني UK']} rows={[['XS','34','2','6'],['S','36','4','8'],['M','38','6','10'],['L','40','8','12']]}/>
 <p className="text-xs">مصدر الملابس: <a className="underline" href="https://double.fashion/pages/size-guide" target="_blank" rel="noreferrer">جدول DOUBLE</a>. هذا المثال نسائي فقط؛ الملابس الرجالية والأطفال تحتاج جدولها الخاص.</p>
 <Chart title="رموز الملابس الدولية" headers={['الرمز','المعنى']} rows={[['XXS','صغير جدًا جدًا'],['XS','صغير جدًا'],['S','صغير'],['M','متوسط'],['L','كبير'],['XL','كبير جدًا'],['XXL / 2XL','كبير جدًا جدًا'],['XXXL / 3XL','كبير جدًا جدًا جدًا']]}/>
 <p className="text-xs leading-5">للأحذية: قِس طول القدم من الكعب إلى أطول إصبع. للملابس: قِس الصدر والخصر والورك وقارن بجدول المنتج. لا توجد معادلة واحدة صالحة لكل الشركات أو لمقاسات الأطفال والخواتم وغيرها.</p>
 </div></details>;
}
