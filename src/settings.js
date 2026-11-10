export const SITE_PREFIX = 'site:';
export const SCRIPT_PREFIX = 'adm-';
export const DEFAULTS = Object.freeze({
  enabled: false,
  preset: 'dark',
  brightness: 100,
  contrast: 100,
  warmth: 0,
  preserveNative: true,
});

export const PALETTES = Object.freeze({
  soft: { background: '#232530', text: '#e2e1e9' },
  dark: { background: '#181922', text: '#e6e4ed' },
  black: { background: '#090a0d', text: '#e6e6eb' },
});

const clamp = (value, min, max, fallback) =>
  typeof value === 'number' && Number.isFinite(value)
    ? Math.round(Math.min(max, Math.max(min, value))) : fallback;

export function sanitizeSettings(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) value = {};
  return {
    enabled: typeof value.enabled === 'boolean' ? value.enabled : DEFAULTS.enabled,
    preset: Object.hasOwn(PALETTES, value.preset) ? value.preset : DEFAULTS.preset,
    brightness: clamp(value.brightness, 80, 120, DEFAULTS.brightness),
    contrast: clamp(value.contrast, 80, 120, DEFAULTS.contrast),
    warmth: clamp(value.warmth, 0, 50, DEFAULTS.warmth),
    preserveNative: typeof value.preserveNative === 'boolean'
      ? value.preserveNative : DEFAULTS.preserveNative,
  };
}

export function siteFromURL(input) {
  try {
    const url = new URL(input);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    // Browser stores and internal pages do not permit extension injection.
    if (['chromewebstore.google.com', 'microsoftedge.microsoft.com'].includes(url.hostname)) return null;
    if (url.hostname === 'chrome.google.com' && url.pathname.startsWith('/webstore')) return null;
    return url.hostname;
  } catch { return null; }
}

export function validHostname(hostname) {
  return typeof hostname === 'string' && hostname.length <= 253 && !hostname.includes('*') &&
    siteFromURL(`https://${hostname}/`) === hostname;
}

export const siteKey = (hostname) => `${SITE_PREFIX}${hostname}`;
export const sitePattern = (hostname) => `*://${hostname}/*`;
export const scriptId = (hostname) => `${SCRIPT_PREFIX}${Array.from(hostname, c =>
  c.charCodeAt(0).toString(16).padStart(2, '0')).join('')}`;

export function engineTheme(settings) {
  const options = sanitizeSettings(settings);
  const palette = PALETTES[options.preset];
  return {
    mode: 1,
    brightness: options.brightness,
    contrast: options.contrast,
    sepia: options.warmth,
    grayscale: 0,
    darkSchemeBackgroundColor: palette.background,
    darkSchemeTextColor: palette.text,
    scrollbarColor: 'auto',
    selectionColor: 'auto',
    styleSystemControls: true,
    // The content controller already defers hidden tabs. Avoid the engine's
    // separate cached-visibility wait when a previously hidden tab is revealed.
    immediateModify: true,
  };
}

export function luminance(rgb) {
  const linear = rgb.slice(0, 3).map(v => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}

export const contrastRatio = (a, b) => {
  const l1 = luminance(a), l2 = luminance(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
};
