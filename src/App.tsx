import { features } from '../featureFlag';
import flagsConfig from '../featureFlag.json';
import styles from './App.module.css';

type FlagName = keyof typeof flagsConfig;

function getOverrides(): Partial<Record<FlagName, boolean>> {
  try {
    const raw = localStorage.getItem('FF_OVERRIDE');
    return raw ? (JSON.parse(raw) as Partial<Record<FlagName, boolean>>) : {};
  } catch {
    return {};
  }
}

function toggleOverride(flag: FlagName, value: boolean) {
  const overrides = getOverrides();
  overrides[flag] = value;
  localStorage.setItem('FF_OVERRIDE', JSON.stringify(overrides));
  window.location.reload();
}

function clearOverride(flag: FlagName) {
  const overrides = getOverrides();
  delete overrides[flag];
  localStorage.setItem('FF_OVERRIDE', JSON.stringify(overrides));
  window.location.reload();
}

export default function App() {
  const overrides = getOverrides();
  const allFlags = Object.keys(flagsConfig) as FlagName[];

  return (
    <div className={styles.page}>
      <h1>Feature Flags</h1>

      <section className={styles.panel}>
        {allFlags.map((flag) => {
          const defaultVal = flagsConfig[flag];
          const isOverridden = flag in overrides;
          const currentVal = features[flag];

          return (
            <div key={flag} className={styles.flagRow}>
              <div className={styles.flagInfo}>
                <span className={styles.flagName}>{flag}</span>
                <span className={styles.flagMeta}>
                  default: <b>{String(defaultVal)}</b>
                  {isOverridden && (
                    <span className={styles.override}>
                      {' '}→ override: <b>{String(overrides[flag])}</b>
                    </span>
                  )}
                </span>
              </div>

              <div className={styles.flagControls}>
                <button
                  className={`${styles.btn} ${currentVal ? styles.btnActive : ''}`}
                  onClick={() => toggleOverride(flag, true)}
                >
                  ON
                </button>
                <button
                  className={`${styles.btn} ${!currentVal ? styles.btnActive : ''}`}
                  onClick={() => toggleOverride(flag, false)}
                >
                  OFF
                </button>
                {isOverridden && (
                  <button className={`${styles.btn} ${styles.btnReset}`} onClick={() => clearOverride(flag)}>
                    сбросить
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </section>

      <section className={styles.demo}>
        <h2>Демо</h2>
        {features['06_07__140622__ADD_NEW_API'] ? (
          <div className={`${styles.feature} ${styles.featureNew}`}>
            <span className={styles.featureBadge}>NEW</span>
            <strong>Новый API подключён</strong>
            <p>Этот блок виден только когда флаг <code>ADD_NEW_API</code> включён.</p>
          </div>
        ) : (
          <div className={`${styles.feature} ${styles.featureOld}`}>
            <span className={styles.featureBadge}>OLD</span>
            <strong>Старый API</strong>
            <p>Флаг выключен — показывается старый вариант.</p>
          </div>
        )}
      </section>
    </div>
  );
}
