import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { AUDIT_UX_FLAGS, AUDIT_UX_TEXTS } from '@/lib/ux-settings';
import { customerServiceContactPolicy, sellerContactPolicy } from '@/lib/contact-policy';

describe('public contact policy', () => {
  it('enforces seller WhatsApp and phone permissions independently on the server', () => {
    expect(sellerContactPolicy({
      isOwner: false,
      whatsappEnabled: false,
      phoneEnabled: true,
      whatsapp: '0500785596',
      phone: '0500785596',
      message: 'استفسار عن الإعلان',
    })).toEqual({ whatsappHref: null, phoneHref: 'tel:0500785596' });

    expect(sellerContactPolicy({
      isOwner: false,
      whatsappEnabled: true,
      phoneEnabled: false,
      whatsapp: '0500785596',
      phone: '0500785596',
      message: 'استفسار عن الإعلان',
    })).toEqual({
      whatsappHref: 'https://wa.me/966500785596?text=%D8%A7%D8%B3%D8%AA%D9%81%D8%B3%D8%A7%D8%B1%20%D8%B9%D9%86%20%D8%A7%D9%84%D8%A5%D8%B9%D9%84%D8%A7%D9%86',
      phoneHref: null,
    });
  });

  it('never exposes seller contact controls to the owner or for empty numbers', () => {
    expect(sellerContactPolicy({
      isOwner: true,
      whatsappEnabled: true,
      phoneEnabled: true,
      whatsapp: '0500785596',
      phone: '0500785596',
    })).toEqual({ whatsappHref: null, phoneHref: null });
    expect(sellerContactPolicy({
      isOwner: false,
      whatsappEnabled: true,
      phoneEnabled: true,
      whatsapp: null,
      phone: '---',
    })).toEqual({ whatsappHref: null, phoneHref: null });
  });

  it('keeps Trbhh customer service contacts independent from seller contacts', () => {
    expect(customerServiceContactPolicy({
      whatsappEnabled: true,
      phoneEnabled: true,
      whatsapp: '0555555555',
      phone: '0112345678',
      message: 'خدمة عملاء تربح',
    })).toEqual({
      whatsappHref: 'https://wa.me/966555555555?text=%D8%AE%D8%AF%D9%85%D8%A9%20%D8%B9%D9%85%D9%84%D8%A7%D8%A1%20%D8%AA%D8%B1%D8%A8%D8%AD',
      phoneHref: 'tel:0112345678',
    });
  });

  it('exposes every contact switch and customer-service number in admin settings', () => {
    expect(AUDIT_UX_FLAGS.map(([key]) => key)).toEqual(expect.arrayContaining([
      'seller_whatsapp_on',
      'seller_phone_on',
      'customer_service_whatsapp_on',
      'customer_service_phone_on',
    ]));
    expect(AUDIT_UX_TEXTS.map(([key]) => key)).toEqual(expect.arrayContaining([
      'customer_service_whatsapp_number',
      'customer_service_phone_number',
    ]));
  });

  it('routes ads, stores and Trbhh support through the shared server policy', () => {
    const adPage = readFileSync('src/app/ads/[id]/page.tsx', 'utf8');
    const storePage = readFileSync('src/app/companies/[id]/page.tsx', 'utf8');
    const storeProductPage = readFileSync('src/app/companies/[id]/p/[adId]/page.tsx', 'utf8');
    const homePage = readFileSync('src/app/page.tsx', 'utf8');
    const layout = readFileSync('src/app/layout.tsx', 'utf8');
    const mobileNav = readFileSync('src/components/mobile-nav.tsx', 'utf8');
    expect(adPage).toContain('sellerContactPolicy(');
    expect(storePage).toContain('sellerContactPolicy(');
    expect(storeProductPage).toContain('sellerContactPolicy(');
    expect(homePage).toContain('customerServiceContactPolicy(');
    expect(homePage).not.toContain("SITE.phone.replace(/\\D/g, '').replace(/^00/, '')");
    expect(layout).toContain('customerServiceContactPolicy(');
    expect(layout).toContain('supportWhatsappHref={supportContact.whatsappHref}');
    expect(mobileNav).toContain('supportWhatsappHref');
    expect(mobileNav).toContain('supportPhoneHref');
    expect(mobileNav).not.toContain('SITE.phone');
  });
});
