import flagsConfig from './featureFlag.json';

type FeatureFlagName = keyof typeof flagsConfig;
type FeatureFlags = Record<FeatureFlagName, boolean>;

type FlagControl = {
  set: (value: boolean) => void;
  reset: () => void;
};

declare global {
  interface Window {
    FF_OVERRIDE: { [K in FeatureFlagName]: FlagControl } & { resetAll: () => void };
  }
}

const getLocalOverrides = (): Partial<FeatureFlags> => {
  try {
    const raw = localStorage.getItem('FF_OVERRIDE');
    return raw ? (JSON.parse(raw) as Partial<FeatureFlags>) : {};
  } catch (error) {
    console.error('Error parsing feature flag overrides:', error);
    return {};
  }
};

const getFeatureFlags = (): FeatureFlags => {
  const overrides = getLocalOverrides();
  const finalFlags = { ...flagsConfig };

  (Object.keys(finalFlags) as FeatureFlagName[]).forEach((flag) => {
    if (typeof overrides[flag] === 'boolean') {
      finalFlags[flag] = overrides[flag]!;
    }
  });

  return finalFlags;
};

export const features = getFeatureFlags();

if (typeof window !== 'undefined') {
  // --- console table ---
  const flags = Object.keys(flagsConfig) as FeatureFlagName[];
  const colFlag = Math.max('Flag'.length, ...flags.map((f) => f.length));
  const colVal  = 'Value'.length;
  const divider = (l: string, m: string, r: string) =>
    l + '─'.repeat(colFlag + 2) + m + '─'.repeat(colVal + 2) + r;
  const row = (flag: string, val: string) =>
    `│ ${flag.padEnd(colFlag)} │ ${val.padEnd(colVal)} │`;
  const lines = [
    divider('┌', '┬', '┐'),
    row('Flag', 'Value'),
    divider('├', '┼', '┤'),
    ...flags.map((f) => row(f, String(features[f]))),
    divider('└', '┴', '┘'),
  ].join('\n');
  console.log('🚩 Feature Flags\n' + lines);

  // --- window.FF_OVERRIDE ---
  const saveAndReload = (overrides: Partial<FeatureFlags>) => {
    localStorage.setItem('FF_OVERRIDE', JSON.stringify(overrides));
    window.location.reload();
  };

  const flagControls = flags.reduce((acc, flag) => {
    acc[flag] = {
      set: (value: boolean) => {
        const overrides = getLocalOverrides();
        overrides[flag] = value;
        saveAndReload(overrides);
      },
      reset: () => {
        const overrides = getLocalOverrides();
        delete overrides[flag];
        saveAndReload(overrides);
      },
    };
    return acc;
  }, {} as { [K in FeatureFlagName]: FlagControl });

  window.FF_OVERRIDE = {
    ...flagControls,
    resetAll: () => {
      localStorage.removeItem('FF_OVERRIDE');
      window.location.reload();
    },
  };

  console.log('💡 FF_OVERRIDE доступен в консоли: FF_OVERRIDE.<flag>.set(true/false) | FF_OVERRIDE.<flag>.reset() | FF_OVERRIDE.resetAll()');
}
