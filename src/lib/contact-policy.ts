import { waLink } from '@/lib/classified-theme';

type ContactPolicyInput = {
  whatsappEnabled: boolean;
  phoneEnabled: boolean;
  whatsapp: string | null | undefined;
  phone: string | null | undefined;
  message?: string | null;
};

export type PublicContactPolicy = {
  whatsappHref: string | null;
  phoneHref: string | null;
};

function phoneLink(raw: string | null | undefined): string | null {
  const digits = (raw || '').replace(/\D/g, '');
  return digits.length >= 7 ? `tel:${digits}` : null;
}

export function customerServiceContactPolicy(input: ContactPolicyInput): PublicContactPolicy {
  return {
    whatsappHref: input.whatsappEnabled ? waLink(input.whatsapp, input.message) : null,
    phoneHref: input.phoneEnabled ? phoneLink(input.phone) : null,
  };
}

export function sellerContactPolicy(input: ContactPolicyInput & { isOwner: boolean }): PublicContactPolicy {
  if (input.isOwner) return { whatsappHref: null, phoneHref: null };
  return customerServiceContactPolicy(input);
}
