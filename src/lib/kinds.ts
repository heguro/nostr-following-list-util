import { Nip07Relays } from '../@types/nip07';
import { NostrEvent } from '../@types/nostrTools';
import { jsonParseOrEmptyObject } from './util';

import * as NostrTools from './nostrTools';

export type Connection = {
  url: string;
  relay: NostrTools.Relay | null;
  status: 'connecting' | 'connected' | 'ok' | 'failed' | 'disconnected';
  broadcastStatus?: string;
  selected: boolean;
};

export const profileDefault = {
  loaded: false,
  id: '',
  createdAt: 0,
  displayName: '',
  username: '',
  about: '',
  picture: '',
};

export type Profile = typeof profileDefault;

export type ContactList = {
  id: string;
  type: 'contacts' | 'relays';
  createdAt: number;
  contacts: string[];
  relays: string[];
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
  return (
    event.kind === 10002
      ? {
          id: event.id || '',
          type: 'relays',
          createdAt: event.created_at,
          contacts: event.tags.filter(tag => tag[0] === 'p').map(tag => tag[1]),
          relays: Object.keys(jsonParseOrEmptyObject(event.content)),
          relaysObj: jsonParseOrEmptyObject(event.content),
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
          relaysObj: jsonParseOrEmptyObject(event.content),
          eventFrom,
          event,
          selected: false,
        }
  ) as ContactList;
};

export const contactListToKind3Event = (contactList: ContactList) => {
  return {
    ...contactList.event,
    created_at: (Date.now() / 1000) | 0,
    id: undefined,
    sig: undefined,
  } as NostrEvent;
};
