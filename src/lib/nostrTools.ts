// from nostr-tools/index.ts

export * from 'nostr-tools/event';
export * as fj from 'nostr-tools/fakejson';
export * from 'nostr-tools/filter';
export * from 'nostr-tools/keys';
export * as nip04 from 'nostr-tools/nip04';
export * as nip05 from 'nostr-tools/nip05';
// export * as nip06 from 'nostr-tools/nip06' // excluded to reduce bundle size
export * as nip19 from 'nostr-tools/nip19';
export * as nip26 from 'nostr-tools/nip26';
export * from 'nostr-tools/pool';
export * from 'nostr-tools/relay';
export * as utils from 'nostr-tools/utils';

// monkey patch secp256k1
import { hmac } from '@noble/hashes/hmac';
import { sha256 } from '@noble/hashes/sha256';
import * as secp256k1 from '@noble/secp256k1';
secp256k1.utils.hmacSha256Sync = (key, ...msgs) =>
  hmac(sha256, key, secp256k1.utils.concatBytes(...msgs));
secp256k1.utils.sha256Sync = (...msgs) =>
  sha256(secp256k1.utils.concatBytes(...msgs));
