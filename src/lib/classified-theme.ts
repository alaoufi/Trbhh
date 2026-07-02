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
  createdAt: string | null;
};

/** Auto-design gradient themes (the "smart designer" picks one per ad). */
export const CLASSIFIED_THEMES = [
  { from: '#3287da', to: '#1b4f8a' },
  { from: '#d4a017', to: '#8a6d0e' },
  { from: '#3287da', to: '#d4a017' },
  { from: '#0ea5e9', to: '#1d4ed8' },
  { from: '#f59e0b', to: '#b91c1c' },
  { from: '#10b981', to: '#0ea5e9' },
  { from: '#7c3aed', to: '#2563eb' },
  { from: '#0f766e', to: '#065f46' },
];
