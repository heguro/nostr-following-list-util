import { Nip07Relays } from '../@types/nips';
import { NostrEvent } from '../@types/nostrTools';
import { jsonParseOrEmptyObject, relayUrlNormalize } from './util';

import * as NostrTools from './nostrTools';

export type Connection = {
  url: string;
  relay: NostrTools.Relay | null;
  status: 'connecting' | 'connected' | 'ok' | 'failed' | 'disconnected';
  broadcastStatus?: string;
  selected: boolean;
};

const eventDefault = {
  created_at: 0,
  pubkey: '',
  kind: 0,
  content: '',
  tags: [],
} satisfies NostrEvent as NostrEvent;

export const profileDefault = {
  loaded: false,
  id: '',
  createdAt: 0,
  displayName: '',
  username: '',
  about: '',
  picture: '',
  event: eventDefault,
};

export type Profile = typeof profileDefault;

export type ContactList = {
  id: string;
  type: 'contacts' | 'relays';
  createdAt: number;
  contacts: string[];
  relays: string[];
  relaysNormalized: string[];
  relaysObj: Nip07Relays;
  eventFrom: string[];
  event: NostrEvent;
  selected: boolean;
};

export type BadgeAward = {
  // kind 8
  // currently ignore what pubkeys awarded to
  id: string;
  createdAt: number;
  awardedBy: Profile | null;
  contactList: ContactList | null;
  kind30009Id: string;
  kind30009Pubkey: string;
  kind30009D: string;
  badgeInfo?: BadgeInfo;
  event: NostrEvent;
  eventFrom: string[];
  selected: boolean;
};

export type AcceptedBadge = {
  // tags in kind 30008
  kind30009Id: string;
  kind30009Pubkey: string;
  kind30009D: string;
  kind8Id: string;
  kind8Relay: string | null;
  badgeInfo?: BadgeInfo;
  eventFrom: string[];
};

export type BadgeInfo = {
  // kind 30009
  kind30009Id: string;
  id: string;
  createdAt: number;
  awardedBy: Profile | null;
  d: string;
  name: string | null;
  description: string | null;
  image: string | null;
  thumb: string | null;
  event: NostrEvent;
  eventFrom: string[];
};

export const kind3ToContactList = (params: {
  event: NostrEvent;
  eventFrom: string[];
}) => {
  const { event, eventFrom } = params;
  return (event.kind === 10002
    ? {
        id: event.id || '',
        type: 'relays',
        createdAt: event.created_at,
        contacts: [],
        relays: event.tags.filter(tag => tag[0] === 'r').map(tag => tag[1]),
        relaysNormalized: event.tags
          .filter(tag => tag[0] === 'r')
          .map(tag => relayUrlNormalize(tag[1])),
        relaysObj: Object.fromEntries(
          event.tags
            .filter(tag => tag[0] === 'r')
            .map(tag => [
              tag[1],
              { read: tag[2] !== 'write', write: tag[2] !== 'read' },
            ]),
        ),
        eventFrom,
        event,
        selected: false,
      }
    : {
        id: event.id || '',
        type: 'contacts',
        createdAt: event.created_at,
        contacts: event.tags.filter(tag => tag[0] === 'p').map(tag => tag[1]),
        relays: Object.keys(jsonParseOrEmptyObject(event.content)),
        relaysNormalized: Object.keys(
          jsonParseOrEmptyObject(event.content),
        ).map(relayUrlNormalize),
        relaysObj: jsonParseOrEmptyObject(event.content),
        eventFrom,
        event,
        selected: false,
      }) satisfies ContactList as ContactList;
};

export const contactListToKind3Event = (contactList: ContactList) => {
  return {
    ...contactList.event,
    content: JSON.stringify(contactList.relaysObj),
    created_at: (Date.now() / 1000) | 0,
    id: undefined,
    sig: undefined,
  } satisfies NostrEvent as NostrEvent;
};

export const contactListToKind10002Event = (contactList: ContactList) => {
  return {
    kind: 10002,
    pubkey: contactList.event.pubkey,
    content: '',
    created_at: (Date.now() / 1000) | 0,
    id: undefined,
    sig: undefined,
    tags: Object.entries(contactList.relaysObj).map(([url, rw]) => [
      'r',
      url,
      ...(rw.read && rw.write ? [] : rw.read ? ['read'] : ['write']),
    ]),
  } satisfies NostrEvent as NostrEvent;
};

export const updateContactListRelays = (
  contactList: ContactList,
  relaysObj: Nip07Relays,
) => {
  return {
    ...contactList,
    relays: Object.keys(relaysObj),
    relaysNormalized: Object.keys(relaysObj).map(relayUrlNormalize),
    relaysObj,
  } satisfies ContactList as ContactList;
};

export const getNpubOrNullFromHex = (hex: string) => {
  try {
    return NostrTools.nip19.npubEncode(hex);
  } catch {
    return null;
  }
};
