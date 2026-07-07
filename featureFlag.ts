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

if (typeof window !== 'undefined') {
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
    ...flags.map((f) => row(f, String(flagsConfig[f]))),
    divider('└', '┴', '┘'),
  ].join('\n');

  console.log('🚩 Feature Flags\n' + lines);
}