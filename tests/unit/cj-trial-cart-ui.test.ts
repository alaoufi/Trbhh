import {beforeEach,describe,expect,it,vi} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const mock=vi.hoisted(()=>({access:vi.fn(),hasAccess:vi.fn()}));
vi.mock('@/lib/access-control/guards',()=>({requireAccess:mock.access,hasAccess:mock.hasAccess}));
vi.mock('@/lib/commerce/address-book',()=>({listMemberAddresses:async()=>[]}));
vi.mock('@/lib/commerce/settings',()=>({getCommerceConfig:async()=>({text:{paymentUnavailable:'CUSTOM checkout unavailable'}})}));
import CartPage from '@/app/cj/cart/page';
import {AddToTrialCart,CartLink} from '@/components/cj/cart-controls';
import {TrialCart} from '@/components/cj/trial-cart';
beforeEach(()=>{vi.clearAllMocks();mock.access.mockResolvedValue({uid:9});mock.hasAccess.mockResolvedValue(false);});

describe('private CJ trial cart presentation',()=>{
  it('offers the fiscal setup link only to an authorized tax viewer',async()=>{mock.hasAccess.mockResolvedValue(true);const allowed=renderToStaticMarkup(await CartPage({searchParams:Promise.resolve({order:'fiscal'})}));expect(allowed).toContain('/admin/finance?section=tax');expect(allowed).toContain('الرقم الضريبي لا يلزم عند التعطيل');mock.hasAccess.mockResolvedValue(false);const denied=renderToStaticMarkup(await CartPage({searchParams:Promise.resolve({order:'fiscal'})}));expect(denied).not.toContain('/admin/finance?section=tax');expect(denied).toContain('لم يبدأ الدفع');});
  it('explains checkout recheck and finance failures instead of silently returning to the cart',async()=>{for(const order of ['recheck','fiscal','pricing','warehouse']){const html=renderToStaticMarkup(await CartPage({searchParams:Promise.resolve({order})}));expect(html).toContain('role="alert"');}});
  it('shows checkout unavailable feedback when fulfillment readiness blocks the live path',async()=>{const tree=await CartPage({searchParams:Promise.resolve({order:'unavailable'})});const html=renderToStaticMarkup(tree);expect(html).toContain('CUSTOM checkout unavailable');expect(html).toContain('role="alert"');});
  it('requires current products view before rendering, regardless of the public storefront flag',async()=>{
    const tree=await CartPage();expect(mock.access).toHaveBeenCalledExactlyOnceWith('products','view');expect(tree.props.accountId).toBe(9);
    const html=renderToStaticMarkup(tree);expect(html).toContain('سلة الشراء');
    expect(html).toContain('role="status"');expect(html).toContain('aria-live="polite"');
    expect(html).not.toContain('CJ');
    expect(html).not.toMatch(/name="ship(?:Name|Phone|City|Address1)"|href="\/(?:shop|account\/orders)/);
  });
  it('does not render a cart when the session/grant check rejects',async()=>{
    mock.access.mockRejectedValue(Error('redirect:/login'));await expect(CartPage()).rejects.toThrow('redirect:/login');
  });
  it('renders an accessible parent-product quantity control without any purchase action',()=>{
    const html=renderToStaticMarkup(createElement(AddToTrialCart,{productId:4,accountId:9,variants:[]}));
    expect(html).toContain('type="number"');expect(html).toContain('min="1"');expect(html).toContain('max="99"');
    expect(html).toContain('أضف لسلة التجربة');expect(html).toContain('disabled=""');expect(html).toContain('لا يحجز المخزون');
    expect(html).not.toContain('<form');expect(html).not.toMatch(/href="\/(?:shop|account\/orders)/);
    expect(renderToStaticMarkup(createElement(CartLink,{accountId:9}))).toContain('href="/cj/cart"');
  });
  it('shows selectable variant information before the add action',()=>{
    const html=renderToStaticMarkup(createElement(AddToTrialCart,{productId:4,accountId:9,variants:[{vid:'blue-s',name:'أزرق صغير',optionKey:'اللون: أزرق، المقاس: S',sku:'SKU-BS',stock:2}]}));
    expect(html).toContain('اللون: أزرق، المقاس: S');expect(html).toContain('SKU-BS');expect(html).toContain('المتاح الموثق: 2');expect(html).toContain('اختر اللون أو المقاس');
  });
  it('describes the admin purchase flow and never leaks the supplier name in the cart',()=>{
    const html=renderToStaticMarkup(createElement(TrialCart,{accountId:9,ship:null}));
    expect(html).toContain('سلة الشراء');expect(html).toContain('جارٍ تحميل السلة');
    expect(html).not.toContain('CJ');expect(html).not.toMatch(/name="ship(?:Name|Phone|City|Address1)"/);
  });
});
