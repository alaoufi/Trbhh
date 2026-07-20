'use client';
import { useState } from 'react';
import { RefreshCw, Pin, EyeOff, BarChart3, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface AdActionsProps {
  adId: number;
  canEdit: boolean;
  canDelete: boolean;
  isHidden: boolean;
  isPinned: boolean;
  onRefresh: () => void;
  onPin: () => void;
  onHide: () => void;
  onStats: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

export function AdActions({
  adId,
  canEdit,
  canDelete,
  isHidden,
  isPinned,
  onRefresh,
  onPin,
  onHide,
  onStats,
  onEdit,
  onDelete,
}: AdActionsProps) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {/* تجديد — لا يتأثر بالمدة */}
        <Button
          variant="outline"
          size="sm"
          onClick={onRefresh}
          className="gap-1.5 text-xs"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          تجديد
        </Button>

        {/* تثبيت — مدفوع */}
        <Button
          variant={isPinned ? 'default' : 'outline'}
          size="sm"
          onClick={onPin}
          className="gap-1.5 text-xs"
        >
          <Pin className={`h-3.5 w-3.5 ${isPinned ? 'fill-current' : ''}`} />
          {isPinned ? 'مثبت' : 'تثبيت'}
        </Button>

        {/* إخفاء/إظهار — لا يتأثر بالمدة */}
        <Button
          variant="outline"
          size="sm"
          onClick={onHide}
          className="gap-1.5 text-xs"
        >
          <EyeOff className="h-3.5 w-3.5" />
          {isHidden ? 'إظهار' : 'إخفاء'}
        </Button>

        {/* إحصائيات — عرض فقط */}
        <Button
          variant="outline"
          size="sm"
          onClick={onStats}
          className="gap-1.5 text-xs"
        >
          <BarChart3 className="h-3.5 w-3.5" />
          إحصائيات
        </Button>

        {/* تعديل — يخضع لمدة السماح */}
        {canEdit && (
          <Button
            variant="outline"
            size="sm"
            onClick={onEdit}
            className="gap-1.5 text-xs"
          >
            <Pencil className="h-3.5 w-3.5" />
            تعديل
          </Button>
        )}

        {/* حذف — يخضع لمدة السماح */}
        {canDelete && (
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setShowDeleteConfirm(true)}
            className="gap-1.5 text-xs"
          >
            <Trash2 className="h-3.5 w-3.5" />
            حذف
          </Button>
        )}
      </div>

      {/* تأكيد الحذف */}
      {showDeleteConfirm && (
        <div className="rounded-lg border-2 border-red-300 bg-red-50 p-3">
          <p className="text-sm font-bold text-red-800">
            ⚠️ هل أنت متأكد من حذف هذا الإعلان؟ لا يمكن التراجع.
          </p>
          <div className="mt-2 flex gap-2">
            <Button
              variant="destructive"
              size="sm"
              onClick={onDelete}
              className="text-xs"
            >
              نعم، احذف
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowDeleteConfirm(false)}
              className="text-xs"
            >
              إلغاء
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
