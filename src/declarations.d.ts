type FlagDevControl = { get on(): void; get off(): void };

interface Window {
  FF_OVERRIDE: Record<string, FlagDevControl>;
}
