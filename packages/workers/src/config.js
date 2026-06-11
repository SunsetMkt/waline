/**
 * Application configuration derived from Cloudflare Workers environment bindings.
 */
export function getConfig(env) {
  const isFalse = (v) => v && ['0', 'false'].includes(v.toLowerCase());

  const forbiddenWords = env.FORBIDDEN_WORDS
    ? env.FORBIDDEN_WORDS.split(/\s*,\s*/)
    : [];

  const secureDomains = env.SECURE_DOMAINS
    ? env.SECURE_DOMAINS.split(/\s*,\s*/)
    : null;

  return {
    jwtKey: env.JWT_TOKEN || '',
    forbiddenWords,
    secureDomains,
    disableUserAgent: env.DISABLE_USERAGENT && !isFalse(env.DISABLE_USERAGENT),
    disableRegion: env.DISABLE_REGION && !isFalse(env.DISABLE_REGION),
    audit: env.COMMENT_AUDIT && !isFalse(env.COMMENT_AUDIT),
    avatarProxy: isFalse(env.AVATAR_PROXY) ? '' : (env.AVATAR_PROXY || ''),
    siteName: env.SITE_NAME || 'Waline',
    siteUrl: env.SITE_URL || '',
    markdown: {
      plugin: {
        emoji: !isFalse(env.MARKDOWN_EMOJI),
        highlight: !isFalse(env.MARKDOWN_HIGHLIGHT),
      },
    },
  };
}
