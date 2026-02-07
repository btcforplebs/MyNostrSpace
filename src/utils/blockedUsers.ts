/**
 * Blocked Users Configuration
 *
 * Add hex pubkeys of users you want to block site-wide.
 * All content from these users will be hidden across the application.
 */

export const BLOCKED_PUBKEYS: Set<string> = new Set([
  // 美图Bot
  '6d088b653a1bffe728b9b17e5c7afcfc18d85f70502feac83400524eb6a8d5e9',
]);

/**
 * Blocked Keywords
 *
 * Add strings that, if found in content, will hide the post.
 */
export const BLOCKED_KEYWORDS: string[] = [
  'xxx',
  'porn',
  'nsfw',
  'explicit',
  'sex',
  'hentai',
  'p0rn',
  'adult',
  'pornography',
  'pussy',
  'dick',
  'DeFi',
  'NewToken',
  'memecoin',
];

export const BLOCKED_TAGS: string[] = ['nsfw', 'explicit', 'porn', 'xxx', 'content-warning'];

/**
 * Check if a pubkey is blocked
 */
export const isBlockedUser = (pubkey: string): boolean => {
  return BLOCKED_PUBKEYS.has(pubkey);
};

/**
 * Check if content contains any blocked keywords
 */
export const hasBlockedKeyword = (content: string): boolean => {
  if (!content) return false;
  const lowerContent = content.toLowerCase();
  return BLOCKED_KEYWORDS.some(kw => lowerContent.includes(kw.toLowerCase()));
};
