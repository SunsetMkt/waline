import { createHash } from 'node:crypto';

/**
 * Generate avatar URL for a user.
 * Reuses the same logic as packages/server/src/service/avatar.js but as a plain function.
 */
export function getAvatarUrl(user, { avatarProxy = '' } = {}) {
  const { mail, nick, avatar } = user;

  if (avatar) {
    return applyProxy(avatar, avatarProxy);
  }

  // Use Gravatar/Libravatar based on email
  const numExp = /^[0-9]+$/;
  const qqMailExp = /^[0-9]+@qq.com$/i;

  let avatarUrl;

  if (nick && numExp.test(nick)) {
    avatarUrl = `https://q1.qlogo.cn/g?b=qq&nk=${nick}&s=100`;
  } else if (mail && qqMailExp.test(mail)) {
    const qqNumber = mail.replace(/@qq\.com$/i, '');
    avatarUrl = `https://q1.qlogo.cn/g?b=qq&nk=${qqNumber}&s=100`;
  } else {
    const emailHash = mail
      ? createHash('md5').update(mail.trim().toLowerCase()).digest('hex')
      : '';
    avatarUrl = `https://seccdn.libravatar.org/avatar/${emailHash}`;
  }

  return applyProxy(avatarUrl, avatarProxy);
}

function applyProxy(url, proxy) {
  if (!proxy || !url) return url;
  if (url.includes(proxy)) return url;
  return `${proxy}?url=${encodeURIComponent(url)}`;
}
