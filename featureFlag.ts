import flagsConfig from './featureFlag.json';

type FeatureFlagName = keyof typeof flagsConfig;
type FeatureFlags = Record<FeatureFlagName, boolean>;

type FlagControl = {
  on: () => void;
  off: () => void;
};

export const FF_OVERRIDE_KEY = 'FF_OVERRIDE' as const;

const STYLE_FLAG_ENABLED  = 'color:#4a8c6a;background:#f2fdf6;padding:1px 0';
const STYLE_FLAG_DISABLED = 'color:#c0706e;background:#fff4f4;padding:1px 0';

export const isRestrictedEnv: boolean = IS_PROD || IS_PREPROD;

const getLocalOverrides = (): Partial<FeatureFlags> => {
  if (isRestrictedEnv) return {};
  try {
    const raw = localStorage.getItem(FF_OVERRIDE_KEY);
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

export const logFeatureFlags = (flags: Record<string, boolean>): void => {
  const keys = Object.keys(flags);
  const colFlag = Math.max(...keys.map((f) => f.length));
  const colVal  = 'false'.length;
  const divider = (l: string, m: string, r: string) =>
    l + '─'.repeat(colFlag + 2) + m + '─'.repeat(colVal + 2) + r;
  const row = (flag: string, val: string) =>
    `│ ${flag.padEnd(colFlag)} │ ${val.padEnd(colVal)} │`;

  const parts: string[] = ['%c' + divider('┌', '┬', '┐') + '\n'];
  const styles: string[] = [''];
  keys.forEach((f) => {
    const val = flags[f];
    parts.push('%c' + row(f, String(val)) + '\n');
    styles.push(val ? STYLE_FLAG_ENABLED : STYLE_FLAG_DISABLED);
  });
  parts.push('%c' + divider('└', '┴', '┘'));
  styles.push('');

  console.log('🚩 Feature Flags\n' + parts.join(''), ...styles);
};

export const enableDevTools = (): void => {
  if (typeof window === 'undefined') return;

  const shortName = (flag: string): string => {
    const parts = flag.split('__');
    return parts[parts.length - 1];
  };

  const saveAndReload = (overrides: Partial<FeatureFlags>) => {
    localStorage.setItem(FF_OVERRIDE_KEY, JSON.stringify(overrides));
    window.location.reload();
  };

  const flagControls = (Object.keys(flagsConfig) as FeatureFlagName[]).reduce((acc: Record<string, FlagControl>, flag) => {
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

  window[FF_OVERRIDE_KEY] = flagControls;
};

if (typeof window !== 'undefined' && !isRestrictedEnv) {
  logFeatureFlags(features);
  enableDevTools();
}
