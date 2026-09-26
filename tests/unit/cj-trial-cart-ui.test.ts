import {beforeEach,describe,expect,it,vi} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const mock=vi.hoisted(()=>({access:vi.fn()}));
vi.mock('@/lib/access-control/guards',()=>({requireAccess:mock.access}));
import CartPage from '@/app/cj/cart/page';
import {AddToTrialCart,CartLink} from '@/components/cj/cart-controls';
import {TrialCart} from '@/components/cj/trial-cart';
beforeEach(()=>{vi.clearAllMocks();mock.access.mockResolvedValue({uid:9});});

describe('private CJ trial cart presentation',()=>{
  it('requires current products view before rendering, regardless of the public storefront flag',async()=>{
    const tree=await CartPage();expect(mock.access).toHaveBeenCalledExactlyOnceWith('products','view');expect(tree.props.accountId).toBe(9);
    const html=renderToStaticMarkup(tree);expect(html).toContain('سلة التجربة');expect(html).toContain('يعيد التحقق من الخيار والسعر والمخزون والشحن');
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
  it('states no charge or payment happens and shows no supplier name in the trial cart',()=>{
    const html=renderToStaticMarkup(createElement(TrialCart,{accountId:9}));
    expect(html).toContain('لا خصم ولا دفع');expect(html).toContain('أضِف خياراً متحقّقاً');
    expect(html).not.toContain('CJ');expect(html).not.toMatch(/name="ship(?:Name|Phone|City|Address1)"/);
  });
});
