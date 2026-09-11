import type {Metadata} from 'next';
import type {ReactNode} from 'react';
import {AppShell} from '@/components/app-shell';
import './globals.css';
export const metadata:Metadata={title:{default:'تربح V2 — بيع. اشترِ. وتربح.',template:'%s | تربح V2'},description:'معاينة تصميم سوق تربح السعودي: بيع وشراء وتواصل مباشر بدون عمولة.',robots:{index:false,follow:false},icons:{icon:'/logo.jpg'}};
export default function RootLayout({children}:{children:ReactNode}){return <html lang="ar" dir="rtl"><body><AppShell>{children}</AppShell></body></html>}
