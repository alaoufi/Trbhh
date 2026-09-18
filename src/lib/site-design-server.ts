import 'server-only';
import { cache } from 'react';
import { getSetting } from '@/lib/settings';
import { DEFAULT_SITE_DESIGN_CONFIG, type SiteDesignConfig } from './site-design';
/** Request memoization shares these three public values across layout and grids. */
export const getSiteDesignConfig = cache(async (): Promise<SiteDesignConfig> => {
    try {
        // Read the flag first so the existing settings cache is populated once.
        const enabled = await getSetting('v2_design_on', '0') === '1';
        const [label, description] = await Promise.all([
            getSetting('v2_design_label', DEFAULT_SITE_DESIGN_CONFIG.label),
            getSetting('v2_design_description', DEFAULT_SITE_DESIGN_CONFIG.description),
        ]);
        return { enabled, label, description };
    }
    catch {
        return { ...DEFAULT_SITE_DESIGN_CONFIG };
    }
});
