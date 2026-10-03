import {notFound} from 'next/navigation';
import {requireAction} from '@/lib/roles';
import {isCategoryAdminView,type CategoryAdminQuery} from '@/lib/ad-categories/admin-navigation';
import {CategoryAdminWorkspace} from '../workspace';
export default async function CategoryAdminPage({params,searchParams}:{params:Promise<{view:string}>;searchParams:Promise<CategoryAdminQuery>}){
  await requireAction('categories','view');
  const {view}=await params;if(!isCategoryAdminView(view))notFound();
  return <CategoryAdminWorkspace view={view} query={await searchParams}/>;
}
