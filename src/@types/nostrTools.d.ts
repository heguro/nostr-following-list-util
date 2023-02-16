import type { Event as NostrToolsEvent } from 'nostr-tools/event';

export type NostrEvent = Omit<NostrToolsEvent, 'kind'> & {
  kind: number;
};
