// Generic raster-logo detection. A 64px sample is enough to distinguish dark
// neutral lettering on transparency from an opaque photograph or a light logo.
export function needsImageContrast(pixels) {
  let transparent = 0, visible = 0, darkNeutral = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    const alpha = pixels[i + 3] / 255;
    if (alpha < 0.1) { transparent++; continue; }
    if (alpha < 0.6) continue; // Ignore antialiasing at the edge of lettering.
    visible++;
    const r = pixels[i] / 255, g = pixels[i + 1] / 255, b = pixels[i + 2] / 255;
    if (Math.max(r, g, b) - Math.min(r, g, b) < 0.14 && (r * 0.2126 + g * 0.7152 + b * 0.0722) < 0.55) darkNeutral++;
  }
  return visible >= 10 && transparent / (pixels.length / 4) > 0.08 && darkNeutral / visible > 0.25;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
const ID = 'adm-readable-image';

// The saturation mask passes colorful pixels through unchanged. Only neutral
// dark tones are lifted; a brand's orange/blue/red is not inverted with its text.
const FILTER = `<defs><filter id="${ID}" color-interpolation-filters="sRGB" x="0" y="0" width="100%" height="100%">
  <feColorMatrix in="SourceGraphic" type="saturate" values="0" result="gray"/>
  <feBlend in="SourceGraphic" in2="gray" mode="difference" result="difference"/>
  <feColorMatrix in="difference" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  4 4 4 0 0" result="colorMask"/>
  <feComponentTransfer in="SourceGraphic" result="lifted">
    <feFuncR type="table" tableValues=".88 .82 .77 .76 .79 .84 .91 1"/>
    <feFuncG type="table" tableValues=".88 .82 .77 .76 .79 .84 .91 1"/>
    <feFuncB type="table" tableValues=".88 .82 .77 .76 .79 .84 .91 1"/>
  </feComponentTransfer>
  <feComposite in="SourceGraphic" in2="colorMask" operator="in" result="color"/>
  <feComposite in="lifted" in2="colorMask" operator="out" result="neutral"/>
  <feComposite in="color" in2="neutral" operator="arithmetic" k2="1" k3="1"/>
</filter></defs>`;

function candidate(image) {
  if (!(image instanceof HTMLImageElement)) return false;
  const description = `${image.alt} ${image.id} ${image.className} ${image.currentSrc || image.src}`;
  if (/(?:avatar|profile|userpic|portrait|thumbnail|photo|foto|retrato)/i.test(description)) return false;
  if (/(?:logo|logotipo|brand|marca|icon|símbolo|symbol)/i.test(description)) return true;
  const link = image.closest('a');
  if (!link || !image.closest('header, [role="banner"], .navbar, [class*="branding"]')) return false;
  try { return new URL(link.href).origin === location.origin && new URL(link.href).pathname === '/'; }
  catch { return false; }
}

function darkBackdrop(image) {
  for (let node = image.parentElement; node; node = node.parentElement) {
    const color = getComputedStyle(node).backgroundColor.match(/[\d.]+/g)?.map(Number);
    if (!color || color.length < 3 || (color.length > 3 && color[3] < 0.8)) continue;
    return (color[0] * 0.2126 + color[1] * 0.7152 + color[2] * 0.0722) < 110;
  }
  return false;
}

export class ImageContrast {
  constructor(fetchImage) {
    this.fetchImage = fetchImage;
    this.cache = new Map();
    this.pending = new Set();
    this.marked = new Set();
    this.active = false;
    this.revision = 0;
    this.loaded = event => { if (candidate(event.target)) this.watch(event.target); };
  }

  start() {
    if (this.active) { this.schedule(); return; }
    this.active = true;
    this.revision++;
    this.intersections = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        this.intersections.unobserve(entry.target);
        this.pending.add(entry.target);
      }
      this.schedule();
    }, { rootMargin: '100px' });
    this.observer = new MutationObserver(records => {
      for (const record of records) {
        if (record.type === 'attributes') { if (candidate(record.target)) this.watch(record.target); continue; }
        for (const node of record.addedNodes) {
          if (node.nodeType !== Node.ELEMENT_NODE || node.matches('style,script,svg')) continue;
          this.scan(node);
        }
      }
      for (const image of this.marked) {
        if (!image.isConnected) {
          image.removeAttribute('data-adm-readable');
          this.marked.delete(image);
        }
      }
    });
    this.observer.observe(document.documentElement, {
      childList: true, subtree: true, attributes: true, attributeFilter: ['src', 'srcset'],
    });
    document.addEventListener('load', this.loaded, true);
    this.scan(document);
  }

  scan(root) {
    if (root instanceof HTMLImageElement && candidate(root)) this.watch(root);
    for (const image of root.querySelectorAll('img')) if (candidate(image)) this.watch(image);
  }

  watch(image) {
    // A replacement src must not keep a filter intended for a previous logo.
    if (this.marked.has(image)) { image.removeAttribute('data-adm-readable'); this.marked.delete(image); }
    this.intersections.observe(image);
  }

  schedule() {
    if (!this.active || this.idle || this.working || !this.pending.size || document.hidden) return;
    const work = () => { this.idle = 0; void this.drain(); };
    this.idle = 'requestIdleCallback' in window
      ? requestIdleCallback(work, { timeout: 500 }) : requestAnimationFrame(work);
  }

  async drain() {
    const revision = this.revision;
    this.working = true;
    try {
      // Bound each batch; there is no timer or repeated scan of the whole page.
      for (let count = 0; count < 4 && this.pending.size && this.active && revision === this.revision; count++) {
        const image = this.pending.values().next().value;
        this.pending.delete(image);
        if (!image.isConnected || !image.complete || !image.naturalWidth || !darkBackdrop(image)) continue;
        const filter = getComputedStyle(image).filter;
        if (filter !== 'none' && !image.hasAttribute('data-adm-readable')) continue;
        const source = image.currentSrc || image.src;
        let enhance = this.cache.get(source);
        if (enhance === undefined) {
          enhance = await this.analyze(image, source);
          if (source.length <= 4096) {
            if (this.cache.size >= 64) this.cache.delete(this.cache.keys().next().value);
            this.cache.set(source, enhance);
          }
        }
        if (!enhance || !this.active || revision !== this.revision || !image.isConnected || source !== (image.currentSrc || image.src)) continue;
        this.installFilter();
        image.setAttribute('data-adm-readable', 'true');
        this.marked.add(image);
      }
    } finally {
      this.working = false;
      this.schedule();
    }
  }

  async analyze(image, source) {
    const scale = Math.min(1, 64 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    let context = canvas.getContext('2d', { willReadFrequently: true });
    try {
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      return needsImageContrast(context.getImageData(0, 0, canvas.width, canvas.height).data);
    } catch {
      // A cross-origin image taints a canvas; read its public original through
      // the existing bounded CSS/image relay instead of changing its pixels.
      try {
        const response = await this.fetchImage(source);
        const bitmap = await createImageBitmap(await response.blob());
        canvas.width = canvas.width; // Reset the canvas's origin-clean flag.
        context = canvas.getContext('2d', { willReadFrequently: true });
        context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        bitmap.close();
        return needsImageContrast(context.getImageData(0, 0, canvas.width, canvas.height).data);
      } catch { return false; }
    }
  }

  installFilter() {
    if (this.svg?.isConnected) return;
    this.svg = document.createElementNS(SVG_NS, 'svg');
    this.svg.setAttribute('aria-hidden', 'true');
    this.svg.setAttribute('width', '0'); this.svg.setAttribute('height', '0');
    this.svg.style.cssText = 'position:absolute;pointer-events:none;overflow:hidden';
    this.svg.innerHTML = FILTER;
    this.style = document.createElement('style');
    this.style.textContent = `img[data-adm-readable="true"]{filter:url("#${ID}")!important}`;
    (document.body || document.documentElement).append(this.svg);
    (document.head || document.documentElement).append(this.style);
  }

  stop() {
    this.active = false;
    this.revision++;
    this.observer?.disconnect(); this.intersections?.disconnect();
    document.removeEventListener('load', this.loaded, true);
    if (this.idle) {
      if ('cancelIdleCallback' in window) cancelIdleCallback(this.idle);
      else cancelAnimationFrame(this.idle);
    }
    this.idle = 0;
    this.pending.clear();
    for (const image of this.marked) image.removeAttribute('data-adm-readable');
    this.marked.clear();
    this.svg?.remove(); this.style?.remove();
  }
}
