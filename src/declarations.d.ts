interface Window {
  FF_OVERRIDE: Record<string, { on: () => void; off: () => void }>;
}
