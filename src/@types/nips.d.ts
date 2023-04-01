import { NostrEvent } from './nostrTools';

export interface Nip07Nostr {
  // must defined
  getPublicKey(): Promise<string>;
  signEvent(event: NostrEvent): Promise<NostrEvent>;

  // optional
  getRelays?(): Promise<Nip07Relays>;
  nip04?: {
    encrypt?(pubkey: string, plaintext: string): Promise<string>;
    decrypt?(pubkey: string, ciphertext: string): Promise<string>;
  };
}

export interface Nip07Relays {
  [url: string]: Nip07RelayState;
}

export type Nip07RelayState = { read: boolean; write: boolean };

export interface Nip11RelayInfo {
  name?: string;
  description?: string;
  pubkey?: string;
  contact?: string;
  supported_nips?: number[];
  software?: string;
  version?: string;

  // nostream oriented?
  supported_nip_extensions?: string[];

  // Server Limitations
  limitation?: Nip11RelayLimitations;

  // Event Retention
  retention?: Nip11RelayRetention[];

  // Content Limitations
  relay_countries?: string[];

  // Community Preferences
  language_tags?: string[];
  tags?: string[];
  posting_policy?: string;

  // Pay-To-Relay
  payments_url?: string;
  fees?: Nip11RelayFees;
}

export interface Nip11RelayLimitations {
  max_message_length?: number;
  max_subscriptions?: number;
  max_filters?: number;
  max_limit?: number;
  max_subid_length?: number;
  min_prefix?: number;
  max_event_tags?: number;
  max_content_length?: number;
  min_pow_difficulty?: number;
  auth_required?: boolean;
  payment_required?: boolean;
}

export interface Nip11RelayRetention {
  kinds?: number[] | [number, number][];
  time?: number;
  count?: number;
}

export interface Nip11RelayFees {
  admission?: Nip11RelayFee[];
  subscription?: Nip11RelayFee[];
  publication?: Nip11RelayFee[];
}
