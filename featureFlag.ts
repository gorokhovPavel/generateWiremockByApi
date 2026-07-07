import flagsConfig from './featureFlag.json';

type FeatureFlagName = keyof typeof flagsConfig; 
type FeatureFlags = Record<FeatureFlagName, boolean>;

const getLocalOverrides = (): Partial<FeatureFlags> => {
    try {
        const override  = localStorage.getItem('FF_OVERRIDE');

        return override ? (JSON.parse(override) as Partial<FeatureFlags>) : {};
    } catch (error) {
        console.error('Error parsing feature flag overrides:', error);
        return {};
    }
}

const getFeatureFlags = (): FeatureFlags => {
    const overrides = getLocalOverrides();

    const finalFlags = {...flagsConfig};

    (Object.keys(finalFlags) as FeatureFlagName[]).forEach((flag) => {
        if(typeof overrides[flag] === 'boolean') {
            finalFlags[flag] = overrides[flag]!;
        }
    });

    return finalFlags;
}

export const features = getFeatureFlags();

(function logFeatureFlags() {
  const overrides = getLocalOverrides();

  console.log(
    '%c 🚩 Feature Flags ',
    'background:#6366f1;color:#fff;font-weight:bold;font-size:13px;padding:3px 10px;border-radius:4px;',
  );

  const table = (Object.keys(flagsConfig) as FeatureFlagName[]).reduce<
    Record<string, { default: boolean; override: string; active: boolean; source: string }>
  >((acc, flag) => {
    const hasOverride = flag in overrides;
    acc[flag] = {
      default:  flagsConfig[flag],
      override: hasOverride ? String(overrides[flag]) : '—',
      active:   features[flag],
      source:   hasOverride ? '⚙️ localStorage' : '📄 featureFlag.json',
    };
    return acc;
  }, {});

  console.table(table);
})();