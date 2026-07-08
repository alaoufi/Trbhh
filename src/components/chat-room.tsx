'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Send, Check, CheckCheck, Trash2 } from 'lucide-react';

export type Msg = { id: number; fromMe: boolean; message: string; at: string | null; read: boolean };

function fmtTime(at: string | null): string {
  if (!at) return '';
  try {
    return new Intl.DateTimeFormat('ar-SA-u-nu-latn', { hour: '2-digit', minute: '2-digit' }).format(new Date(at));
  } catch {
    return '';
  }
}

export function ChatRoom({ peerId, initial, deleteWindowMin = 0, templates = [] }: { peerId: number; initial: Msg[]; deleteWindowMin?: number; templates?: string[] }) {
  const canDelete = (m: Msg) => {
    if (!m.fromMe) return false;
    if (!deleteWindowMin) return true; // unlimited
    if (!m.at) return true;
    return (Date.now() - new Date(m.at).getTime()) / 60000 <= deleteWindowMin;
  };
  const [messages, setMessages] = useState<Msg[]>(initial);
  const [typing, setTyping] = useState(false);
  // نص جاهز مُعبّأ داخل مربّع الكتابة مباشرةً (لمحادثة جديدة) ليعدّله ويرسله
  const [text, setText] = useState(() => (initial.length === 0 ? (templates[0] || '') : ''));
  const lastIdRef = useRef<number>(initial.reduce((m, x) => Math.max(m, x.id), 0));
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const typingSentRef = useRef<number>(0);

  // نص جاهز → يملأ مربّع الكتابة ليعدّله المُرسِل قبل الإرسال
  const applyTemplate = (t: string) => {
    setText(t);
    inputRef.current?.focus();
  };

  useEffect(() => {
    const el = boxRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, typing]);

  const poll = useCallback(async () => {
    try {
      const r = await fetch(`/api/chat/${peerId}?after=${lastIdRef.current}`, { cache: 'no-store' });
      if (!r.ok) return;
      const d = await r.json();
      if (Array.isArray(d.messages) && d.messages.length) {
        setMessages((prev) => {
          const have = new Set(prev.map((m) => m.id));
          const add = (d.messages as Msg[]).filter((m) => !have.has(m.id));
          if (!add.length) return prev;
          lastIdRef.current = Math.max(lastIdRef.current, ...add.map((m) => m.id));
          return [...prev, ...add];
        });
      }
      if (typeof d.myReadMax === 'number' && d.myReadMax > 0) {
        setMessages((prev) => prev.map((m) => (m.fromMe && !m.read && m.id <= d.myReadMax ? { ...m, read: true } : m)));
      }
      // drop any message the other party deleted (id no longer in the live set)
      if (Array.isArray(d.ids)) {
        const live = new Set(d.ids as number[]);
        setMessages((prev) => prev.filter((m) => m.id < 0 || live.has(m.id)));
      }
      setTyping(!!d.typing);
    } catch {
      /* ignore transient poll errors */
    }
  }, [peerId]);

  useEffect(() => {
    poll();
    const t = setInterval(poll, 2500);
    return () => clearInterval(t);
  }, [poll]);

  const onType = (v: string) => {
    setText(v);
    const now = Date.now();
    if (now - typingSentRef.current > 2000) {
      typingSentRef.current = now;
      fetch(`/api/chat/${peerId}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind: 'typing' }),
      }).catch(() => {});
    }
  };

  const removeMsg = async (id: number) => {
    if (!confirm('حذف هذه الرسالة؟')) return;
    setMessages((prev) => prev.filter((m) => m.id !== id)); // optimistic
    if (id < 0) return; // never persisted (temp bubble)
    try {
      await fetch(`/api/chat/${peerId}`, {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ messageId: id }),
      });
    } catch {
      /* next poll reconciles if it failed */
    }
  };

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const msg = text.trim();
    if (!msg) return;
    setText('');
    const tempId = -Date.now();
    setMessages((prev) => [...prev, { id: tempId, fromMe: true, message: msg, at: new Date().toISOString(), read: false }]);
    try {
      const r = await fetch(`/api/chat/${peerId}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: msg }),
      });
      const d = await r.json();
      if (d?.id) {
        setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, id: d.id } : m)));
        lastIdRef.current = Math.max(lastIdRef.current, d.id);
      }
    } catch {
      /* keep optimistic bubble; next poll reconciles */
    }
    poll();
  };

  return (
    <>
      <div
        ref={boxRef}
        className="flex min-h-[45vh] max-h-[62vh] flex-col gap-1.5 overflow-y-auto rounded-xl p-3"
        style={{ background: '#e5ddd5' }}
      >
        {messages.length === 0 && !typing && <p className="m-auto text-sm text-gray-600">ابدأ المحادثة الآن</p>}
        {messages.map((m) => (
          <div
            key={m.id}
            className={`group max-w-[80%] rounded-2xl px-3 py-1.5 text-sm shadow-sm ${
              m.fromMe ? 'self-start rounded-tr-sm bg-[#dcf8c6] text-gray-900' : 'self-end rounded-tl-sm bg-white text-gray-900'
            }`}
          >
            <p className="whitespace-pre-wrap break-words leading-relaxed">{m.message}</p>
            <span className="mt-0.5 flex items-center justify-end gap-1 text-[10px] text-gray-500">
              {/* حذف الرسالة (لرسائلي فقط) — يحذف الرسالة وحدها لا المحادثة */}
              {canDelete(m) && (
                <button
                  type="button"
                  onClick={() => removeMsg(m.id)}
                  aria-label="حذف الرسالة"
                  title="حذف الرسالة"
                  className="ml-auto mr-0 flex items-center gap-0.5 rounded-md bg-red-600 px-1.5 py-0.5 text-[10px] font-bold text-white hover:bg-red-700"
                >
                  <Trash2 className="h-3 w-3" /> حذف
                </button>
              )}
              {fmtTime(m.at)}
              {m.fromMe && (m.read ? <CheckCheck className="h-3.5 w-3.5 text-sky-500" /> : <Check className="h-3.5 w-3.5" />)}
            </span>
          </div>
        ))}
        {typing && (
          <div className="self-end rounded-2xl rounded-tl-sm bg-white px-3 py-2 shadow-sm">
            <span className="flex items-center gap-1">
              <i className="typing-dot" />
              <i className="typing-dot" />
              <i className="typing-dot" />
            </span>
          </div>
        )}
      </div>

      {/* نصوص جاهزة إضافية — الضغط يستبدل نص مربّع الكتابة ليعدّله ويرسله */}
      {templates.length > 1 && (
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {templates.map((t, i) => (
            <button
              key={i}
              type="button"
              onClick={() => applyTemplate(t)}
              className={`shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-medium ${text.trim() === t ? 'border-primary bg-primary text-white' : 'border-primary/30 bg-primary/5 text-primary hover:bg-primary/10'}`}
            >
              {t.length > 42 ? t.slice(0, 42) + '…' : t}
            </button>
          ))}
        </div>
      )}

      <form onSubmit={send} className="mt-3 flex gap-2">
        <input
          ref={inputRef}
          value={text}
          onChange={(e) => onType(e.target.value)}
          autoComplete="off"
          placeholder="اكتب رسالة..."
          className="h-11 flex-1 rounded-lg border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
        <button type="submit" aria-label="إرسال" className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground">
          <Send className="h-4 w-4" />
        </button>
      </form>
    </>
  );
}
