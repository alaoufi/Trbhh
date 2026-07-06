import { redirect } from 'next/navigation';

// Store management now lives in the independent, chrome-free store dashboard.
export default function CompanyRedirect() {
  redirect('/store');
}
