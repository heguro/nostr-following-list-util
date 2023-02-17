import { NostrEvent } from './nostrTools';

interface Nip07Nostr {
  getPublicKey(): Promise<string>;
  signEvent(event: NostrEvent): Promise<NostrEvent>;
  getRelays?(): Promise<Nip07Relays>;
  nip04: {
    encrypt(pubkey: string, plaintext: string): Promise<string>;
    decrypt(pubkey: string, ciphertext: string): Promise<string>;
  };
}

interface Nip07Relays {
  [url: string]: { read: boolean; write: boolean };
}
