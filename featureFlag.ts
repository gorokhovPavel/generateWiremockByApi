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