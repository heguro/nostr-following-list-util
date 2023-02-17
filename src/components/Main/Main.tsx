import { useContext, useEffect, useState } from 'preact/hooks';
import { Nip07Nostr, Nip07Relays } from '../../@types/nip07';
import { NostrEvent } from '../../@types/nostrTools';
import { LoginContext } from '../../app';
import * as NostrTools from '../../lib/nostrTools';
import {
  jsonParseOrEmptyObject,
  msecToDateString,
  secToDateString,
} from '../../lib/util';
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
  selected: boolean;
};
let connections: {
  [url: string]: Connection;
} = {};

type ContactList = {
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

let profileCreatedAt = 0;
let kind3s: { eventFrom: string[]; event: NostrEvent }[] = [];

export const Main = () => {
  const [profile, setProfile] = useState(profileDefault);
  const [contactLists, setContactLists] = useState<ContactList[]>([]);
  const [latestGotKind3Time, setLatestGotKind3Time] = useState(0);
  const [statusText, setStatusText] = useState('');
  const [publishMode, setPublishMode] = useState<'registered' | 'all'>(
    'registered',
  );

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
              relaysObj: jsonParseOrEmptyObject(event.content),
              eventFrom,
              event,
              selected: false,
            }
          : {
              id: event.id || '',
              type: 'contacts',
              createdAt: event.created_at,
              contacts: event.tags
                .filter(tag => tag[0] === 'p')
                .map(tag => tag[1]),
              relays: Object.keys(jsonParseOrEmptyObject(event.content)),
              relaysObj: jsonParseOrEmptyObject(event.content),
              eventFrom,
              event,
              selected: false,
            },
    );
    setContactLists(newContactLists);
    setLatestGotKind3Time(
      kind3s.find(({ event }) => event.sig && event.kind === 3)?.event
        .created_at || 0,
    );
    const newRelays = newContactLists.flatMap(
      contactList => contactList.relays,
    );
    for (const relay of newRelays) {
      if (!connections[relay] && !connections[relay.replace(/\/$/, '')])
        addConnection(relay);
    }
  };

  const loadBackupFile = (text: string, name: string) => {
    const lines = text.split(/\r\n|\r|\n/).filter(s => s !== '');
    const headers = lines.filter(s => s.startsWith('#'));
    const contactHexes = lines.filter(s => !s.startsWith('#'));
    const relaysLine = headers.find(s => s.startsWith('# relays: '));
    const pubkeyLine = headers.find(s => s.startsWith('# pubkey: '));
    const pubkey = pubkeyLine ? pubkeyLine.replace('# pubkey: ', '') : '';
    const fromOtherUser = pubkey && pubkey !== npub;
    if (fromOtherUser) {
      if (
        !confirm(
          '公開鍵が異なります。 別のユーザーのリストを読み込もうとしているようです。 よろしいですか？',
        )
      )
        return;
    }
    const relays: Nip07Relays = relaysLine
      ? JSON.parse(relaysLine.replace('# relays: ', ''))
      : {};
    const now = Date.now();
    kind3s.push({
      eventFrom: [
        `<${fromOtherUser ? 'backupFromDifferentUser' : 'backup'}: ${name}>`,
      ],
      event: {
        kind: 3,
        id: `backup-${now}`,
        created_at: (now / 1000) | 0,
        tags: contactHexes.map(hex => ['p', hex]),
        content: JSON.stringify(relays),
        pubkey: login.npubHex,
      },
    });
    kind3sUpdate();
  };
  const downloadBackupFile = (contactList: ContactList) => {
    const filename = `nostr-followings-${
      contactList.contacts.length
    }users_${secToDateString(contactList.createdAt)}.txt`;
    const file = new Blob(
      [
        [
          `# ${filename} @${profile.username}`,
          `# pubkey: ${npub}`,
          `# relays: ${JSON.stringify(contactList.relaysObj)}`,
          `# from: ${JSON.stringify(contactList.eventFrom)}`,
          ...contactList.contacts,
          '',
        ].join('\r\n'),
      ],
      { type: 'text/plain; charset=utf-8' },
    );
    const a = document.createElement('a');
    a.href = URL.createObjectURL(file);
    a.download = filename;
    a.click();
  };

  const uploadLocalBackupFile = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.txt';
    input.onchange = async () => {
      if (!input.files) return;
      const file = input.files[0];
      const reader = new FileReader();
      reader.onload = () => {
        if (!reader.result || typeof reader.result !== 'string') return;
        loadBackupFile(reader.result, file.name);
      };
      reader.readAsText(file);
    };
    input.click();
  };

  const addCombinedEventFromSelection = () => {
    const selectedContactLists = contactLists.filter(
      contactList => contactList.selected,
    );
    const newRelays: Nip07Relays = {};
    const newContactHexes: string[] = [];
    const now = Date.now();
    const eventFrom: string[] = [`<combined: ${msecToDateString(now)}>`];
    for (const contactList of selectedContactLists) {
      newContactHexes.push(
        ...contactList.contacts.filter(hex => !newContactHexes.includes(hex)),
      );
      // super worst performance!!
      for (const [url, relay] of Object.entries(contactList.relaysObj)) {
        if (!newRelays[url]) newRelays[url] = relay;
      }
      eventFrom.push(
        contactList.event.sig
          ? `<event: ${secToDateString(contactList.createdAt)}>`
          : contactList.eventFrom[0] || '<null>',
      );
    }
    const event: NostrEvent = {
      kind: 3,
      id: `combined-${now}`,
      created_at: (now / 1000) | 0,
      tags: newContactHexes.map(hex => ['p', hex]),
      content: JSON.stringify(newRelays),
      pubkey: login.npubHex,
    };
    kind3s.push({ eventFrom, event });
    kind3sUpdate();
  };

  const broadcastToRelay = (relay: NostrTools.Relay, event: NostrEvent) => {
    const ok = () => {
      console.log('broadcasted to', relay.url);
      setStatusText(`配信済: ${relay.url}`);
    };
    const seen = () => {
      console.log('seen by', relay.url);
    };
    const failed = (error: any) => {
      console.warn('failed to broadcast to', relay.url, error);
      if (
        error !== 'event not seen after 5 seconds' &&
        error !== 'blocked: pubkey not admitted'
      ) {
        setStatusText(`配信失敗: ${relay.url} (${error})`);
      }
    };
    const pub = relay.publish(event);
    pub.on('ok', ok);
    pub.on('seen', seen);
    pub.on('failed', failed);
    console.log('broadcasting to', relay.url);
  };

  const startPublishNewKind3 = async (contactList: ContactList) => {
    setStatusText('署名中…');
    const event: NostrEvent = {
      ...contactList.event,
      created_at: (Date.now() / 1000) | 0,
      id: undefined,
      sig: undefined,
    };
    event.id = NostrTools.getEventHash(event);
    let signedEvent: NostrEvent | undefined;
    try {
      signedEvent =
        login.type === 'nip07' && window.nostr
          ? await window.nostr.signEvent(event)
          : login.type === 'nsec' && login.nsecHex
          ? { ...event, sig: NostrTools.signEvent(event, login.nsecHex) }
          : undefined;
    } catch (e) {
      console.error(e);
      setStatusText(`署名失敗`);
      return;
    }
    if (!signedEvent) {
      setStatusText('');
      return;
    }
    console.log('startedPublish', signedEvent);
    setStatusText('送信開始…');
    for (const [url, connection] of Object.entries(connections)) {
      if (
        (publishMode === 'all' || contactList.relaysObj[url]) &&
        connection.relay
      ) {
        broadcastToRelay(connection.relay, signedEvent);
      }
    }
  };

  const startBroadcast = (contactList: ContactList) => {
    const { event } = contactList;
    console.log('startedBroadcast', event);
    setStatusText('ブロードキャスト開始…');
    for (const [url, connection] of Object.entries(connections)) {
      if (
        (publishMode === 'all' || contactList.relaysObj[url]) &&
        connection.relay
      ) {
        broadcastToRelay(connection.relay, event);
      }
    }
  };

  const addConnection = async (url: string) => {
    if (connections[url] || connections[url.replace(/\/$/, '')]) return;
    console.log('connecting to', url);
    const relay = NostrTools.relayInit(url);
    const connection: Connection = { relay: null, sub: null, selected: false };
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
    if (
      kind0Event &&
      kind0Event.sig &&
      NostrTools.validateEvent(kind0Event) &&
      NostrTools.verifySignature({ ...kind0Event, sig: kind0Event.sig })
    ) {
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
          limit: 20,
        },
      ])),
      ...(await relay.list([
        {
          authors: [login.npubHex],
          kinds: [10002],
          limit: 20,
        },
      ])),
    ] as NostrEvent[];
    for (const event of kind3Events) {
      if (
        !(
          event &&
          event.sig &&
          NostrTools.validateEvent(event) &&
          NostrTools.verifySignature({ ...event, sig: event.sig })
        )
      )
        continue;
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
    setStatusText('プロフィールを探しています…');
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
              リロード (再接続)
            </button>
          </div>
        </div>
      </div>
      <div class="connection-status">
        <span class="status-text">{statusText}</span>
      </div>
      <div class="events-actions">
        <div>
          (設定) <label for="publish-mode-select">送信先リレー: </label>
          <select
            id="publish-mode-select"
            value={publishMode}
            onChange={({ target }) => {
              if (
                target instanceof HTMLSelectElement &&
                (target.value === 'registered' || target.value === 'all')
              ) {
                setPublishMode(target.value);
              }
            }}>
            <option value="registered">登録済リレー (推奨)</option>
            <option value="all">できるだけ多くのリレー</option>
          </select>
        </div>
        <button onClick={uploadLocalBackupFile}>バックアップを読み込む</button>
        <button onClick={addCombinedEventFromSelection}>
          選択したリストを結合
        </button>
      </div>
      <div class="contact-events">
        {contactLists.map((contactList, index) => (
          <div class="contact-event" key={contactList.id}>
            <div class="event-date">
              <label>
                <input
                  type="checkbox"
                  checked={contactList.selected}
                  onChange={() => {
                    const newContactLists = [...contactLists];
                    newContactLists[index] = {
                      ...contactList,
                      selected: !contactList.selected,
                    };
                    setContactLists(newContactLists);
                  }}
                />
                Event Creation Time:{' '}
                {contactList.event.sig
                  ? new Date(contactList.createdAt * 1000).toLocaleString()
                  : '<new>'}
              </label>
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
            <div class="event-actions">
              {writable && contactList.event.kind === 3 && (
                <>
                  <button
                    onClick={() => {
                      // a
                      if (
                        confirm(
                          `フォロー数${
                            contactList.contacts.length
                          }、 リレー接続数${
                            contactList.relays.length
                          } のデータが ${
                            (publishMode === 'registered' &&
                              contactList.relays.length) ||
                            Object.keys(connections).length
                          } 件のリレーに反映(上書き)されます。 一度行った操作は元に戻せない可能性が非常に高く、事前のバックアップをおすすめします。 よろしいですか？`,
                        )
                      ) {
                        startPublishNewKind3(contactList);
                      }
                    }}>
                    上書き送信
                  </button>
                  {contactList.event.kind === 3 &&
                    contactList.createdAt === latestGotKind3Time && (
                      <button
                        onClick={() => {
                          if (
                            confirm(
                              `フォロー数${
                                contactList.contacts.length
                              }、 リレー接続数${
                                contactList.relays.length
                              } のデータが ${
                                (publishMode === 'registered' &&
                                  contactList.relays.length) ||
                                Object.keys(connections).length
                              } 件のリレーに反映(ブロードキャスト)されます。 一度行った操作は元に戻せない可能性が非常に高く、事前のバックアップをおすすめします。 よろしいですか？`,
                            )
                          ) {
                            startBroadcast(contactList);
                          }
                        }}>
                        ブロードキャスト(再配信)
                      </button>
                    )}
                </>
              )}
              <button
                onClick={() => {
                  downloadBackupFile(contactList);
                }}>
                バックアップ
              </button>
            </div>
            <hr />
          </div>
        ))}
      </div>
    </div>
  );
};
