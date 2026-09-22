import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ChatRoom, type Msg } from '@/components/chat-room';

const initial: Msg[] = [
  { id: 1, fromMe: true, message: 'رسالتي', at: '2026-09-20T10:00:00Z', read: true },
  { id: 2, fromMe: false, message: 'رسالة الطرف الآخر', at: null, read: true },
];
const html = (permissions: {canSend?:boolean;canDelete?:boolean} = {}) => renderToStaticMarkup(createElement(ChatRoom, {peerId:9,initial,templates:['رد جاهز أول','رد جاهز ثان'],...permissions}));
describe('chat presentation permissions',()=>{
  it('preserves normal member composition and deletion defaults',()=>{
    const output=html();
    expect(output).toContain('aria-label="إرسال"');
    expect(output.match(/aria-label="حذف الرسالة"/g)).toHaveLength(1);
    expect(output).toContain('رد جاهز ثان');
  });
  it('shows messages without an input, templates, send action or delete action to a read-only administrator',()=>{
    const output=html({canSend:false,canDelete:false});
    expect(output).toContain('رسالتي');expect(output).toContain('رسالة الطرف الآخر');
    expect(output).not.toContain('<form');expect(output).not.toContain('<input');
    expect(output).not.toContain('aria-label="إرسال"');expect(output).not.toContain('aria-label="حذف الرسالة"');
    expect(output).not.toContain('رد جاهز ثان');expect(output).toContain('عرض المحادثة فقط');
  });
  it('keeps sending and deleting independently granted',()=>{
    const sender=html({canSend:true,canDelete:false});
    expect(sender).toContain('aria-label="إرسال"');expect(sender).not.toContain('aria-label="حذف الرسالة"');
    const reviewer=html({canSend:false,canDelete:true});
    expect(reviewer).not.toContain('aria-label="إرسال"');expect(reviewer.match(/aria-label="حذف الرسالة"/g)).toHaveLength(1);
  });
});
