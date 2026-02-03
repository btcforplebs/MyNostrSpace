
import { nip19 } from 'nostr-tools';

const naddr = "naddr1qvzqqqrkvupzpn6956apxcad0mfp8grcuugdysg44eepex68h50t73zcathmfs49qqjr2vehvyenvdtr94nrzetr956rgctr94skvvfs95eryep3x3snwve389nxy0sfn5z";

try {
    const decoded = nip19.decode(naddr);
    console.log("Decoded:", decoded);
    console.log("Data:", decoded.data);
} catch (e) {
    console.error("Error decoding:", e);
}
