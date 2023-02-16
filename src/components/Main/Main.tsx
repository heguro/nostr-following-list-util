import { useContext, useEffect, useState } from 'preact/hooks';
import { Nip07Nostr, Nip07Relays } from '../../@types/nip07';
import { NostrEvent } from '../../@types/nostrTools';
import { LoginContext } from '../../app';
import * as NostrTools from '../../lib/nostrTools';
import { jsonParseOrEmptyObject } from '../../lib/util';
import './Main.css';

declare global {
  var nostr: Nip07Nostr | undefined;
}

const relayDefaults: Nip07Relays = {
  'wss://relay.damus.io': { read: true, write: true },
  'wss://nos.lol': { read: true, write: true },
  'wss://relay.current.fyi': { read: true, write: true },
  'wss://brb.io': { read: true, write: true },
  'wss://eden.nostr.land': { read: true, write: true },
  'wss://nostr.fmt.wiz.biz': { read: true, write: true },
  'wss://relay.nostr.info': { read: true, write: true },
  'wss://nostr.zebedee.cloud': { read: true, write: true },
  'wss://nostr-pub.wellorder.net': { read: true, write: true },
  'wss://relay.snort.social': { read: true, write: true },
  'wss://nostr-pub.semisol.dev': { read: true, write: true },
  'wss://nostr.oxtr.dev': { read: true, write: true },
};

const profileDefault = {
  loaded: false,
  createdAt: 0,
  displayName: '',
  username: '',
  about: '',
  picture: '',
};

type Connection = {
  relay: NostrTools.Relay | null;
  sub: NostrTools.Sub | null;
};
let connections: {
  [url: string]: Connection;
} = {};

let profileCreatedAt = 0;
let kind3s: { eventFrom: string[]; event: NostrEvent }[] = [];

export const Main = () => {
  const [profile, setProfile] = useState(profileDefault);
  const [contactLists, setContactLists] = useState<
    {
      id: string;
      type: 'contacts' | 'relays';
      createdAt: number;
      contacts: string[];
      relays: string[];
      eventFrom: string[];
      event: NostrEvent;
    }[]
  >([]);
  const [statusText, setStatusText] = useState('プロフィールを探しています…');

  const { setLogin, login } = useContext(LoginContext);
  const writable = login.type !== 'npub';
  const npub = NostrTools.nip19.npubEncode(login.npubHex);

  const kind3sUpdate = () => {
    kind3s.sort((a, b) => b.event.created_at - a.event.created_at);
    const newContactLists: typeof contactLists = kind3s.map(
      ({ event, eventFrom }) =>
        event.kind === 10002
          ? {
              id: event.id || '',
              type: 'relays',
              createdAt: event.created_at,
              contacts: event.tags
                .filter(tag => tag[0] === 'p')
                .map(tag => tag[1]),
              relays: Object.keys(jsonParseOrEmptyObject(event.content)),
              eventFrom,
              event,
            }
          : {
              id: event.id || '',
              type: 'contacts',
              createdAt: event.created_at,
              contacts: event.tags
                .filter(tag => tag[0] === 'p')
                .map(tag => tag[1]),
              relays: Object.keys(jsonParseOrEmptyObject(event.content)),
              eventFrom,
              event,
            },
    );
    setContactLists(newContactLists);
    const newRelays = newContactLists.flatMap(
      contactList => contactList.relays,
    );
    for (const relay of newRelays) {
      if (!connections[relay]) addConnection(relay);
    }
  };

  const broadcastToRelay = (relay: NostrTools.Relay, event: NostrEvent) => {
    const ok = () => {
      console.log('broadcasted to', relay.url);
    };
    const seen = () => {
      console.log('seen by', relay.url);
    };
    const failed = (...args: any) => {
      console.warn('failed to broadcast to', relay.url, args);
    };
    const pub = relay.publish(event);
    pub.on('ok', ok);
    pub.on('seen', seen);
    pub.on('failed', failed);
    console.log('broadcasting to', relay.url);
  };

  const startBroadcast = (event: NostrEvent) => {
    console.log('startedBroadcast', event);
    for (const [url, connection] of Object.entries(connections)) {
      if (connection.relay) {
        broadcastToRelay(connection.relay, event);
      }
    }
  };

  const addConnection = async (url: string) => {
    if (connections[url]) return;
    console.log('connecting to', url);
    const relay = NostrTools.relayInit(url);
    const connection: Connection = { relay: null, sub: null };
    connections[url] = connection;
    await relay.connect();
    connection.relay = relay;
    let kind0available = false;
    let kind3available = false;
    const kind0Event = await relay.get({
      authors: [login.npubHex],
      kinds: [0],
      limit: 1,
    });
    if (kind0Event) {
      const event = kind0Event;
      kind0available = true;
      if (event.created_at > profileCreatedAt) {
        if (profileCreatedAt === 0) {
          setStatusText('取得できたフォローリストを表示します…');
        }
        profileCreatedAt = event.created_at;
        const content = JSON.parse(event.content);
        setProfile({
          loaded: true,
          createdAt: event.created_at,
          displayName: content.display_name || '',
          username: content.username || content.name || '',
          about: content.about || '',
          picture: content.picture || '',
        });
      }
    }
    let kind3sUpdated = false;
    const kind3Events = [
      ...(await relay.list([
        {
          authors: [login.npubHex],
          kinds: [3],
          limit: 5,
        },
      ])),
      ...(await relay.list([
        {
          authors: [login.npubHex],
          kinds: [10002],
          limit: 5,
        },
      ])),
    ] as NostrEvent[];
    for (const event of kind3Events) {
      const alreadyHadIndex = kind3s.findIndex(
        kind3 =>
          kind3.event.id === event.id &&
          kind3.event.created_at === event.created_at,
      );
      if (alreadyHadIndex !== -1) {
        const kind3 = kind3s[alreadyHadIndex];
        if (!kind3.eventFrom.includes(url)) {
          kind3.eventFrom.push(url);
          kind3sUpdated = true;
        }
      } else {
        kind3s.push({ eventFrom: [url], event });
        kind3sUpdated = true;
      }
      console.log(url, ' kind3: ', event);
      if (event.kind === 3) kind3available = true;
    }
    if (kind3sUpdated) {
      kind3sUpdate();
    }
    /*
    const sub = relay.sub([
      {
        authors: [login.npubHex],
        kinds: [10002],
        limit: 10,
        // until: 1_676_300_000, //((Date.now() / 1000) | 0) - 10000,
      },
    ]);
    sub.on('event', (event: NostrTools.Event) => {
      console.log(url, event);
    });
    sub.on('eose', () => {
      console.log(`${url}: ok. k0=${kind0available}, k3=${kind3available}`);
      sub.unsub();
      connection.sub = null;
    }); */
    console.log(`${url}: ok. k0=${kind0available}, k3=${kind3available}`);
  };
  const initConnect = async () => {
    const relays = Object.keys({
      ...(login.relays || {}),
      ...relayDefaults,
    });
    connections = {};
    kind3s = [];
    profileCreatedAt = 0;
    relays.forEach(url => {
      addConnection(url);
    });
  };

  useEffect(() => {
    initConnect();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div id="main-area">
      <div class="your-account">
        <div class="your-icon">
          {!profile.picture ? (
            <div class="fallback-icon" />
          ) : (
            <img src={profile.picture} alt="" />
          )}
        </div>
        <div class="your-names">
          {!profile.loaded ? (
            <span class="profile-loading">(Loading)</span>
          ) : (
            <>
              <span class="your-display-name">
                {profile.displayName || profile.username}
              </span>
              <span class="your-username">@{profile.username}</span>
            </>
          )}
        </div>
        <div class="your-info">
          <div>
            <code class="npub">{npub}</code>
          </div>
          <div>
            Hex: <code class="npub-hex">{login.npubHex}</code>
          </div>
          <div>
            {{ nip07: 'NIP-07', npub: '公開鍵', nsec: '秘密鍵' }[login.type]}
            でログイン{' '}
            <button
              onClick={() => {
                if (confirm('ログアウトしますか？')) {
                  for (const [url, connection] of Object.entries(connections)) {
                    const { relay, sub } = connection;
                    if (sub) sub.unsub();
                    if (relay) relay.close();
                    console.log(`${url}: closed`);
                  }
                  setLogin({ ...login, npubHex: '', nsecHex: '' });
                }
              }}>
              ログアウト
            </button>
            <button
              onClick={() => {
                for (const [url, connection] of Object.entries(connections)) {
                  const { relay, sub } = connection;
                  if (sub) sub.unsub();
                  if (relay) relay.close();
                  console.log(`${url}: closed`);
                }
                setProfile(profileDefault);
                setContactLists([]);
                initConnect();
              }}>
              リロード
            </button>
          </div>
        </div>
      </div>
      <div class="connection-status">
        <span class="status-text">{statusText}</span>
      </div>
      <div class="contact-events">
        {contactLists.map((contactList, index) => (
          <div class="contact-event" key={contactList.id}>
            <div class="event-date">
              Event Creation Time:{' '}
              {new Date(contactList.createdAt * 1000).toLocaleString()}
            </div>
            {contactList.type === 'contacts' && (
              <div class="event-contact-count">
                Followings count: {contactList.contacts.length}
              </div>
            )}
            <div class="event-relays">
              <details>
                <summary>Connected relays: {contactList.relays.length}</summary>
                <div class="event-relays-list">
                  {contactList.relays
                    .map(url => url.replace('wss://', ''))
                    .join(', ')}
                </div>
              </details>
            </div>
            <div class="event-froms">
              From:{' '}
              {contactList.eventFrom
                .map(url => url.replace('wss://', ''))
                .join(', ')}
            </div>
            {writable && (
              <div class="event-actions">
                <button onClick={() => {}}>上書き送信 (TODO)</button>
                {index === 0 && (
                  <button
                    onClick={() => {
                      startBroadcast(contactList.event);
                    }}>
                    ブロードキャスト
                  </button>
                )}
              </div>
            )}
            <hr />
          </div>
        ))}
      </div>
    </div>
  );
};
