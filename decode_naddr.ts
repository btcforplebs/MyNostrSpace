import { nip19 } from 'nostr-tools';

const naddr =
  'naddr1qqjrywpcve3ngvfn94sngdmp956xvdp395unwvp595unxefcxuenxefsxsmnsqg4waehxw309aex2mrp0yhxgctdw4eju6t09upzpn6956apxcad0mfp8grcuugdysg44eepex68h50t73zcathmfs49qvzqqqrkvummwxxm';

try {
  const decoded = nip19.decode(naddr);
  console.log(JSON.stringify(decoded, null, 2));
} catch (e) {
  console.error('Failed to decode:', e);
}
