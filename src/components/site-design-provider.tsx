'use client';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { DEFAULT_SITE_DESIGN_CONFIG, resolveSiteDesign, type SiteDesignConfig } from '@/lib/site-design';
import { applyDesign } from '@/lib/site-design-preference';

type SiteDesignContext = {
  config: SiteDesignConfig;
  selected: string;
  selectDesign: (raw: string) => void;
};
const Context = createContext<SiteDesignContext>({
  config: DEFAULT_SITE_DESIGN_CONFIG,
  selected: '',
  selectDesign: () => {},
});

export function SiteDesignProvider({ config, selected = '', children }: {
  config: SiteDesignConfig;
  selected?: string;
  children?: ReactNode;
}) {
  const router = useRouter();
  const serverSelected = resolveSiteDesign(selected, config.enabled);
  const [current, setCurrent] = useState(serverSelected);

  // A refreshed server preference must synchronize all mounted selectors,
  // including when the feature flag itself has not changed.
  useEffect(() => { setCurrent(serverSelected); }, [serverSelected, config.enabled]);

  function selectDesign(raw: string) {
    setCurrent(applyDesign(raw, config.enabled));
    router.refresh();
  }

  return <Context.Provider value={{ config, selected: resolveSiteDesign(current, config.enabled), selectDesign }}>
    {children}
  </Context.Provider>;
}
export function useSiteDesign() { return useContext(Context); }
export function useSiteDesignConfig() { return useSiteDesign().config; }
