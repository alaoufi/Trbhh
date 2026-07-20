'use client';
import { useState } from 'react';
import { Check, Truck, Shield, Tag } from 'lucide-react';

export function AdExtraFields({ 
  initial = {}
}: { 
  initial?: {
    negotiable?: boolean;
    condition?: 'new' | 'used' | 'refurbished';
    delivery?: boolean;
    warranty?: string;
    quantity?: number;
  }
}) {
  const [negotiable, setNegotiable] = useState(initial.negotiable ?? false);
  const [condition, setCondition] = useState(initial.condition ?? 'new');
  const [delivery, setDelivery] = useState(initial.delivery ?? false);
  const [warranty, setWarranty] = useState(initial.warranty ?? '');
  const [quantity, setQuantity] = useState(initial.quantity ?? 1);

  return (
    <div className="space-y-4">
      {/* السعر قابل للتفاوض */}
      <div className="flex items-center gap-3 rounded-lg border-2 border-primary/15 bg-primary/5 p-3">
        <Tag className="h-5 w-5 text-primary" />
        <label className="flex flex-1 items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            name="negotiable"
            checked={negotiable}
            onChange={(e) => setNegotiable(e.target.checked)}
            className="accent-primary"
          />
          السعر قابل للتفاوض
        </label>
      </div>

      {/* حالة المنتج */}
      <div className="space-y-2">
        <label className="text-sm font-bold text-foreground">حالة المنتج</label>
        <div className="grid grid-cols-3 gap-2">
          {[
            { value: 'new', label: 'جديد', icon: '✨' },
            { value: 'used', label: 'مستعمل', icon: '♻️' },
            { value: 'refurbished', label: 'مجدد', icon: '🔧' },
          ].map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setCondition(opt.value as typeof condition)}
              className={`rounded-lg border-2 px-3 py-2 text-sm font-bold transition ${
                condition === opt.value
                  ? 'border-primary bg-primary text-white'
                  : 'border-primary/25 bg-white text-foreground hover:border-primary/50'
              }`}
            >
              <span className="mr-1">{opt.icon}</span>
              {opt.label}
            </button>
          ))}
        </div>
        <input type="hidden" name="condition" value={condition} />
      </div>

      {/* الكمية */}
      <div>
        <label className="text-sm font-bold text-foreground">الكمية المتاحة</label>
        <input
          type="number"
          name="quantity"
          min="1"
          value={quantity}
          onChange={(e) => setQuantity(Number(e.target.value))}
          className="mt-1 h-11 w-full rounded-lg border-2 border-primary/25 bg-white px-3 text-sm font-medium outline-none focus:ring-2 focus:ring-primary/40"
        />
      </div>

      {/* التوصيل */}
      <div className="flex items-center gap-3 rounded-lg border-2 border-primary/15 bg-primary/5 p-3">
        <Truck className="h-5 w-5 text-primary" />
        <label className="flex flex-1 items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            name="delivery"
            checked={delivery}
            onChange={(e) => setDelivery(e.target.checked)}
            className="accent-primary"
          />
          التوصيل متاح
        </label>
      </div>

      {/* الضمان */}
      <div>
        <label className="flex items-center gap-2 text-sm font-bold text-foreground">
          <Shield className="h-4 w-4 text-primary" />
          مدة الضمان (اختياري)
        </label>
        <input
          type="text"
          name="warranty"
          value={warranty}
          onChange={(e) => setWarranty(e.target.value)}
          placeholder="مثال: سنة، 6 أشهر، بدون ضمان"
          className="mt-1 h-11 w-full rounded-lg border-2 border-primary/25 bg-white px-3 text-sm font-medium outline-none focus:ring-2 focus:ring-primary/40"
        />
      </div>
    </div>
  );
}
