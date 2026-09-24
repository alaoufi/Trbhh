import {beforeEach,describe,expect,it,vi} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const mock=vi.hoisted(()=>({access:vi.fn()}));
vi.mock('@/lib/access-control/guards',()=>({requireAccess:mock.access}));
import CartPage from '@/app/cj/cart/page';
import {AddToTrialCart,CartLink} from '@/components/cj/cart-controls';
beforeEach(()=>{vi.clearAllMocks();mock.access.mockResolvedValue({uid:9});});

describe('private CJ trial cart presentation',()=>{
  it('requires current products view before rendering, regardless of the public storefront flag',async()=>{
    const tree=await CartPage();expect(mock.access).toHaveBeenCalledExactlyOnceWith('products','view');expect(tree.props.accountId).toBe(9);
    const html=renderToStaticMarkup(tree);expect(html).toContain('سلة التجربة');expect(html).toContain('الضريبة والشحن النهائي غير مؤكدين');
    expect(html).toContain('role="status"');expect(html).toContain('aria-live="polite"');
    expect(html).not.toMatch(/name="(?:address|phone|payment|requestKey)"|action="|href="\/(?:shop|account\/orders)/);
  });
  it('does not render a cart when the session/grant check rejects',async()=>{
    mock.access.mockRejectedValue(Error('redirect:/login'));await expect(CartPage()).rejects.toThrow('redirect:/login');
  });
  it('renders an accessible parent-product quantity control without any purchase action',()=>{
    const html=renderToStaticMarkup(createElement(AddToTrialCart,{productId:4,accountId:9}));
    expect(html).toContain('type="number"');expect(html).toContain('min="1"');expect(html).toContain('max="99"');
    expect(html).toContain('أضف لسلة التجربة');expect(html).toContain('disabled=""');expect(html).toContain('لا يمثل المخزون');
    expect(html).not.toContain('<form');expect(html).not.toMatch(/href="\/(?:shop|account\/orders)/);
    expect(renderToStaticMarkup(createElement(CartLink,{accountId:9}))).toContain('href="/cj/cart"');
  });
});
