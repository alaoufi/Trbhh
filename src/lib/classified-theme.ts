// Client-safe shared types + design themes for classified ads (no server-only).

export type Classified = {
  id: number;
  userId: number | null;
  title: string | null;
  text: string | null;
  image: string | null; // resolved media URL
  phone: string | null;
  whatsapp: string | null;
  link: string | null;
  theme: number;
  pos: 'top' | 'center' | 'bottom';
  align: 'right' | 'center';
  size: 'sm' | 'md' | 'lg';
  bold: boolean;
  createdAt: string | null;
};

/** Auto-design gradient themes. `text` = readable text color on this background. */
export const CLASSIFIED_THEMES: { from: string; to: string; text: 'light' | 'dark' }[] = [
  // vivid
  { from: '#3287da', to: '#1b4f8a', text: 'light' },
  { from: '#0ea5e9', to: '#1d4ed8', text: 'light' },
  { from: '#10b981', to: '#0ea5e9', text: 'light' },
  { from: '#7c3aed', to: '#2563eb', text: 'light' },
  { from: '#d4a017', to: '#8a6d0e', text: 'light' },
  { from: '#f59e0b', to: '#b91c1c', text: 'light' },
  { from: '#0f766e', to: '#065f46', text: 'light' },
  // soft / pastel
  { from: '#a1c4fd', to: '#c2e9fb', text: 'dark' },
  { from: '#d4fc79', to: '#96e6a1', text: 'dark' },
  { from: '#fbc2eb', to: '#a6c1ee', text: 'dark' },
  { from: '#ffecd2', to: '#fcb69f', text: 'dark' },
  { from: '#e0c3fc', to: '#8ec5fc', text: 'dark' },
  { from: '#f5f7fa', to: '#c3cfe2', text: 'dark' },
  { from: '#fddb92', to: '#d1fdff', text: 'dark' },
];

export const POS_CLASS: Record<string, string> = {
  top: 'justify-start',
  center: 'justify-center',
  bottom: 'justify-end',
};

export const SIZE_TITLE: Record<string, string> = { sm: 'text-sm', md: 'text-base', lg: 'text-xl' };
export const SIZE_BODY: Record<string, string> = { sm: 'text-[11px]', md: 'text-xs', lg: 'text-sm' };
