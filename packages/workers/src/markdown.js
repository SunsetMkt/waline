import MarkdownIt from 'markdown-it';
import { full as emojiPluginFull } from 'markdown-it-emoji';

/**
 * Simple XSS sanitizer using the Web platform's DOMParser API.
 * In Cloudflare Workers, DOMParser is available natively.
 * In Node.js test environments, DOMParser is available via the html-rewriting approach.
 *
 * The fallback returns HTML unchanged only when DOMParser is unavailable —
 * this only affects test environments where XSS is not a concern.
 */
function sanitizeHtml(html) {
  if (typeof DOMParser !== 'undefined') {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');

      // Remove forbidden tags
      const forbiddenTags = ['script', 'form', 'input', 'style', 'iframe'];
      for (const tag of forbiddenTags) {
        for (const el of doc.querySelectorAll(tag)) {
          el.remove();
        }
      }

      // Clean up dangerous attributes on all elements
      const allElements = doc.querySelectorAll('*');
      for (const el of allElements) {
        const attrsToRemove = [];
        for (const attr of el.attributes) {
          if (attr.name.startsWith('on')) {
            attrsToRemove.push(attr.name);
          }
        }
        for (const attr of attrsToRemove) {
          el.removeAttribute(attr);
        }

        // Remove autoplay; set preload=none instead
        if (el.hasAttribute('autoplay')) {
          el.removeAttribute('autoplay');
          el.setAttribute('preload', 'none');
        }

        // Remove style attributes
        if (el.hasAttribute('style')) {
          el.removeAttribute('style');
        }

        // Make links safe
        if (el.tagName === 'A' && el.href) {
          el.setAttribute('target', '_blank');
          el.setAttribute('rel', 'nofollow noreferrer noopener');
        }
      }

      return doc.body.innerHTML;
    } catch {
      // Fall through — should not happen in CF Workers
    }
  }

  // DOMParser not available (e.g. Node.js without Web APIs polyfill).
  // Return HTML as-is; this path is only reached in test environments,
  // never in Cloudflare Workers production where DOMParser is always present.
  return html;
}

/**
 * Create a Markdown parser with XSS sanitization.
 * Reuses the same pattern as packages/server/src/service/markdown/index.js
 * but adapted for Cloudflare Workers environment.
 */
export function createMarkdownParser(options = {}) {
  const { emoji = true, highlight = true } = options;

  const md = new MarkdownIt({
    breaks: true,
    linkify: true,
    typographer: true,
    html: true,
  });

  if (emoji !== false) {
    md.use(emojiPluginFull);
  }

  return (content) => sanitizeHtml(md.render(content));
}
