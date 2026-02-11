/**
 * Blocked Users Configuration
 *
 * Add hex pubkeys of users you want to block site-wide.
 * All content from these users will be hidden across the application.
 */

export const BLOCKED_PUBKEYS: Set<string> = new Set([
  // 美图Bot
  '6d088b653a1bffe728b9b17e5c7afcfc18d85f70502feac83400524eb6a8d5e9',
  '7f0e64b52ef56bec2b588d460fc63125f567db2c014d1ecce806d8d5b4209e2e',
  'b05ddaa79926f85b23723a8938cfe432d84ec0d7a9b3137d979af6d0877da8a7',
  '9557955355f5f11d64dc1c2d7d136d5811904fdc592a950cb4091d05417ffba1',
  '78b512a29311693e5357c4cf2e8a3552ed58af3d8582da439df45ed524df9bfe',
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
  'boobs',
  'tits',
  'ass',
  'fuck',
  'cock',
  'cum',
  'milf',
  'onlyfans',
  'nudes',
  'naked',
  'erotic',
  'hardcore',
  'DeFi',
  'NewToken',
  'memecoin',
  'airdrop',
  'presale',
  'launchpad',
  'moonshot',
  'pumpdump',
  'rugpull',
  'guaranteed profit',
  'passive income',
];

export const BLOCKED_TAGS: string[] = ['nsfw', 'explicit', 'porn', 'xxx', 'content-warning'];

/**
 * Check if a pubkey is blocked
 */
export const isBlockedUser = (pubkey: string, extraBlocks?: Set<string>): boolean => {
  return BLOCKED_PUBKEYS.has(pubkey) || (extraBlocks?.has(pubkey) ?? false);
};

/**
 * Check if content contains any blocked keywords
 */
export const hasBlockedKeyword = (content: string): boolean => {
  if (!content) return false;
  const lowerContent = content.toLowerCase();
  return BLOCKED_KEYWORDS.some((kw) => lowerContent.includes(kw.toLowerCase()));
};
