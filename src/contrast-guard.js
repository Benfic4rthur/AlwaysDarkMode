import { contrastRatio, luminance } from './settings.js';

export function improveContrast(foreground, background, minimum = 4.5) {
  if (contrastRatio(foreground, background) >= minimum) return null;
  const light = [239, 235, 247], dark = [17, 18, 24];
  const target = contrastRatio(light, background) >= contrastRatio(dark, background) ? light : dark;
  let low = 0, high = 1;
  for (let i = 0; i < 12; i++) {
    const amount = (low + high) / 2;
    const mixed = foreground.map((value, channel) => Math.round(value + (target[channel] - value) * amount));
    if (contrastRatio(mixed, background) >= minimum) high = amount;
    else low = amount;
  }
  const result = foreground.map((value, channel) => Math.round(value + (target[channel] - value) * high));
  return contrastRatio(result, background) >= minimum ? result : target;
}

const SELECTOR = 'button,[role="button"],[role="status"],[role="alert"],label,summary,legend,[class*="badge"],[class*="chip"],[class*="pill"]';
const PROPERTY = '--adm-readable-foreground';
function parse(value) {
  if (!/^rgba?\(/.test(value)) return null;
  const values = value.match(/[\d.]+/g)?.map(Number);
  return values?.length >= 3 ? [...values.slice(0, 3), values[3] ?? 1] : null;
}
function backdrop(element) {
  let result = [0, 0, 0], opacity = 0;
  for (let node = element; node && opacity < 0.99; node = node.parentElement) {
    const style = getComputedStyle(node);
    if (Number(style.opacity) < 0.6 || style.backgroundImage !== 'none') return null;
    const color = parse(style.backgroundColor);
    if (!color) continue;
    const alpha = color[3] * (1 - opacity);
    for (let c = 0; c < 3; c++) result[c] += color[c] * alpha;
    opacity += alpha;
  }
  return opacity >= 0.99 ? result.map(Math.round) : null;
}

export class ContrastGuard {
  constructor(setStyle) {
    this.setStyle = setStyle;
    this.pending = new Set();
    this.fixed = new Map();
    this.active = false;
    this.revision = 0;
  }
  async start() {
    if (this.active) { this.scan(document); return; }
    this.active = true;
    const revision = ++this.revision;
    try { await this.setStyle(true); }
    catch { this.active = false; return; }
    if (!this.active || revision !== this.revision) return;
    this.intersections = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        this.intersections.unobserve(entry.target);
        this.pending.add(entry.target);
      }
      this.schedule();
    });
    this.observer = new MutationObserver(records => {
      for (const record of records) {
        if (record.type === 'attributes') {
          if (record.target.matches(SELECTOR) || record.target.hasAttribute('data-adm-contrast')) this.watch(record.target);
          continue;
        }
        for (const node of record.addedNodes) {
          if (node.nodeType !== Node.ELEMENT_NODE || node.matches('style,script,svg')) continue;
          this.scan(node);
        }
      }
      for (const [element] of this.fixed) if (!element.isConnected) this.restore(element);
    });
    this.observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style'] });
    this.scan(document);
  }
  scan(root) {
    if (!this.active || !this.intersections) return;
    if (root instanceof Element && root.matches(SELECTOR)) this.watch(root);
    for (const element of root.querySelectorAll(SELECTOR)) this.watch(element);
    this.schedule();
  }
  watch(element) {
    if (!element.textContent.trim() || element.closest('[disabled],[aria-disabled="true"],[contenteditable="true"]')) return;
    this.intersections.observe(element);
    for (const child of element.querySelectorAll('span,a,strong,b,small')) if (child.textContent.trim()) this.intersections.observe(child);
  }
  schedule() {
    if (!this.active || this.idle || !this.pending.size || document.hidden) return;
    const work = () => { this.idle = 0; this.drain(); };
    this.idle = 'requestIdleCallback' in window ? requestIdleCallback(work, { timeout: 400 }) : requestAnimationFrame(work);
  }
  drain() {
    for (let count = 0; count < 30 && this.pending.size && this.active; count++) {
      const element = this.pending.values().next().value;
      this.pending.delete(element);
      if (!element.isConnected) { this.restore(element); continue; }
      // Temporarily reveal the original author text color. The author CSS and
      // inline !important declarations are never replaced or serialized away.
      element.removeAttribute('data-adm-contrast');
      const style = getComputedStyle(element);
      if (style.visibility !== 'visible' || Number(style.opacity) < 0.6) { this.restore(element); continue; }
      const background = backdrop(element);
      const source = parse(style.webkitTextFillColor) || parse(style.color);
      if (!background || !source || source[3] < 0.8 || luminance(background) > 0.35) { this.restore(element); continue; }
      const foreground = source.slice(0, 3).map((channel, index) => Math.round(channel * source[3] + background[index] * (1 - source[3])));
      const size = parseFloat(style.fontSize);
      const large = size >= 24 || (size >= 18.66 && Number(style.fontWeight) >= 700);
      const corrected = improveContrast(foreground, background, large ? 3 : 4.5);
      if (!corrected) { this.restore(element); continue; }
      if (!this.fixed.has(element)) this.fixed.set(element, { value: element.style.getPropertyValue(PROPERTY), priority: element.style.getPropertyPriority(PROPERTY) });
      const value = `rgb(${corrected.join(', ')})`;
      if (element.style.getPropertyValue(PROPERTY) !== value) element.style.setProperty(PROPERTY, value);
      element.setAttribute('data-adm-contrast', 'true');
    }
    this.schedule();
  }
  restore(element) {
    element.removeAttribute('data-adm-contrast');
    const original = this.fixed.get(element);
    if (!original) return;
    if (original.value) element.style.setProperty(PROPERTY, original.value, original.priority);
    else element.style.removeProperty(PROPERTY);
    this.fixed.delete(element);
  }
  stop() {
    this.active = false;
    this.revision++;
    this.observer?.disconnect(); this.intersections?.disconnect();
    if (this.idle) {
      if ('cancelIdleCallback' in window) cancelIdleCallback(this.idle);
      else cancelAnimationFrame(this.idle);
    }
    this.idle = 0; this.pending.clear();
    for (const [element] of this.fixed) this.restore(element);
    void this.setStyle(false).catch(() => {});
  }
}
