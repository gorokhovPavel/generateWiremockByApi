import flagsConfig from './featureFlag.json';

type FeatureFlagName = keyof typeof flagsConfig;
type FeatureFlags = Record<FeatureFlagName, boolean>;

// Извлекает часть после последнего __ : "06_07__140622__ADD_NEW_API" → "ADD_NEW_API"
type ShortName<T extends string> = T extends `${string}__${infer R}` ? ShortName<R> : T;

type FlagControl = {
  on: () => void;
  off: () => void;
};

declare global {
  interface Window {
    FF_OVERRIDE: { [K in FeatureFlagName as ShortName<K>]: FlagControl };
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
  const colFlag = Math.max(...flags.map((f) => f.length));
  const colVal  = 'false'.length;
  const divider = (l: string, m: string, r: string) =>
    l + '─'.repeat(colFlag + 2) + m + '─'.repeat(colVal + 2) + r;
  const row = (flag: string, val: string) =>
    `│ ${flag.padEnd(colFlag)} │ ${val.padEnd(colVal)} │`;

  const ON  = 'color:#4a8c6a;background:#f2fdf6;padding:1px 0';
  const OFF = 'color:#c0706e;background:#fff4f4;padding:1px 0';

  const parts: string[] = ['%c' + divider('┌', '┬', '┐') + '\n'];
  const styles: string[] = [''];
  flags.forEach((f) => {
    const val = features[f];
    parts.push('%c' + row(f, String(val)) + '\n');
    styles.push(val ? ON : OFF);
  });
  parts.push('%c' + divider('└', '┴', '┘'));
  styles.push('');

  console.log('🚩 Feature Flags\n' + parts.join(''), ...styles);

  // --- window.FF_OVERRIDE ---
  const shortName = (flag: string): string => {
    const parts = flag.split('__');
    return parts[parts.length - 1];
  };

  const saveAndReload = (overrides: Partial<FeatureFlags>) => {
    localStorage.setItem('FF_OVERRIDE', JSON.stringify(overrides));
    window.location.reload();
  };

  const flagControls = flags.reduce((acc, flag) => {
    acc[shortName(flag)] = {
      on: () => {
        const overrides = getLocalOverrides();
        overrides[flag] = true;
        saveAndReload(overrides);
      },
      off: () => {
        const overrides = getLocalOverrides();
        overrides[flag] = false;
        saveAndReload(overrides);
      },
    };
    return acc;
  }, {} as Record<string, FlagControl>);

  window.FF_OVERRIDE = flagControls as Window['FF_OVERRIDE'];
}
