import { useContext, useEffect, useRef, useState } from 'preact/hooks';
import { Fragment } from 'preact/jsx-runtime';
import { Nip07Nostr, Nip07Relays } from '../../@types/nip07';
import { NostrEvent } from '../../@types/nostrTools';
import { LoginContext, PrefsContext } from '../../app';
import { i18n, I18nKey, I18nParams, LangNames } from '../../lib/i18n';
import {
  Connection,
  ContactList,
  contactListToKind10002Event,
  contactListToKind3Event,
  kind3ToContactList,
  Profile,
  profileDefault,
  updateContactListRelays,
} from '../../lib/kinds';
import * as NostrTools from '../../lib/nostrTools';
import {
  delay,
  isValidNormalizedRelayUrl,
  jsonParseOrEmptyArray,
  msecToDateString,
  relayUrlNormalize,
  secToDateString,
  separateArrayByN,
  shuffle,
  uniqLast,
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

const relayUrlListToBulkAdd = {
  globalFamousFree: [
    // pick 5 from these
    'wss://relay.damus.io',
    'wss://nos.lol',
    'wss://relay.current.fyi',
    'wss://relay.snort.social',
    'wss://nostr-pub.semisol.dev',
    'wss://nostr-pub.wellorder.net',
    'wss://offchain.pub',
  ],
  japanese: [
    'wss://relay-jp.nostr.wirednet.jp',
    'wss://nostr.h3z.jp',
    'wss://nostr-relay.nokotaro.com',
    'wss://nostr.holybea.com',
    'wss://test.relay.nostrich.day',
    'wss://relay.nostr.or.jp',
    'wss://nostr.fediverse.jp',
    'wss://nostream.ocha.one',
    'wss://relayer.ocha.one',
    // disabled for some reason
    // 'wss://relay.nostr.wirednet.jp',
    // 'wss://nostrja-kari.heguro.com',
  ],
};

let connections: {
  [url: string]: Connection;
} = {};

let profileCreatedAt = 0;
let profileEventFrom: string[] = [];
// let currentBroadcastingId = '';
let kind3s: { eventFrom: string[]; event: NostrEvent }[] = [];

export const Main = () => {
  const [profile, setProfile] = useState<Profile>(profileDefault);
  const [contactLists, setContactLists] = useState<ContactList[]>([]);
  const [latestGotKind3Time, setLatestGotKind3Time] = useState(0);
  const [latestGotKind10002Time, setLatestGotKind10002Time] = useState(0);
  const [statusText, setStatusText] = useState('');
  const [publishMode, setPublishMode] = useState<'registered' | 'all'>(
    'registered',
  );
  const relaysDialogRef = useRef<HTMLDialogElement>(null);
  const relaysContainerRef = useRef<HTMLDivElement>(null);
  const [contactListToEditOld, setContactListToEditOld] =
    useState<ContactList | null>(null);
  const [contactListToEdit, setContactListToEdit] =
    useState<ContactList | null>(null);
  const [relaysInputText, setRelaysInputText] = useState('');
  const [showKind10002, setShowKind10002] = useState(false);
  const [relayAddInput, setRelayAddInput] = useState('');

  const { setLang, lang } = useContext(PrefsContext);
  const { setLogin, login } = useContext(LoginContext);
  const writable = login.type !== 'npub';
  const npub = NostrTools.nip19.npubEncode(login.npubHex);

  const t = (key: I18nKey, ...param: I18nParams) => i18n(lang, key, ...param);

  const kind3sUpdate = () => {
    kind3s.sort((a, b) => b.event.created_at - a.event.created_at);
    const newContactLists = kind3s.map(kind3ToContactList);
    setContactLists(newContactLists);
    setLatestGotKind3Time(
      kind3s.find(({ event }) => event.sig && event.kind === 3)?.event
        .created_at || 0,
    );
    setLatestGotKind10002Time(
      kind3s.find(({ event }) => event.sig && event.kind === 10002)?.event
        .created_at || 0,
    );
    const newRelaysNormarized = newContactLists.flatMap(
      contactList => contactList.relaysNormalized,
    );
    for (const relay of newRelaysNormarized) {
      if (!connections[relay]) addConnection(relay);
    }
  };

  const loadBackupFile = (text: string, name: string) => {
    const lines = text.split(/\r\n|\r|\n/).filter(s => s !== '');
    const headers = lines.filter(s => s.startsWith('#'));
    const contactHexes = lines
      .filter(s => !s.startsWith('#'))
      .map(s => s.replace(/\s*#.*$/g, ''))
      .map(s => {
        if (/^npub/.test(s)) {
          try {
            const { type, data } = NostrTools.nip19.decode(s);
            return type === 'npub' && typeof data === 'string' ? data : '';
          } catch (e) {
            console.warn(e);
            return '';
          }
        }
        return s;
      })
      .filter(s => s !== '');
    const relaysLine = headers.find(s => s.startsWith('# relays: '));
    const pubkeyLine = headers.find(s => s.startsWith('# pubkey: '));
    const pubkey = pubkeyLine ? pubkeyLine.replace('# pubkey: ', '') : '';
    const fromOtherUser = pubkey && pubkey !== npub;
    if (fromOtherUser) {
      if (!confirm(t('action.backup.otherUser'))) return;
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

  const broadcastToRelay = async (
    connection: Connection,
    event: NostrEvent,
  ) => {
    if (connection.status === 'disconnected')
      await addConnection(connection.url, true);
    if (!connection.relay) return;
    const { relay } = connection;

    const ok = () => {
      console.log('broadcasted to', relay.url);
      setStatusText(`${t('info.broadcast.ok')}: ${relay.url}`);
    };
    const seen = () => {
      console.log('seen by', relay.url);
    };
    const failed = (error: string) => {
      if (error === 'event not seen after 5 seconds') return;
      console.warn('failed to broadcast to', relay.url, error);
      if (error !== 'blocked: pubkey not admitted') {
        setStatusText(`${t('info.broadcast.fail')}: ${relay.url} (${error})`);
      }
    };
    const pub = relay.publish(event);
    pub.on('ok', ok);
    pub.on('seen', seen);
    pub.on('failed', failed);
    console.log('broadcasting to', relay.url);
  };

  const signAndPublish = async ({
    contactList,
    event,
  }: {
    contactList?: ContactList;
    event: NostrEvent;
  }) => {
    setStatusText(t('info.sign.ing'));
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
      setStatusText(t('info.sign.fail'));
      return;
    }
    if (!signedEvent) {
      setStatusText('');
      return;
    }
    if (contactList) {
      console.log('startedPublish', signedEvent);
      setStatusText(t('info.publish.start'));
      for (const [url, connection] of Object.entries(connections)) {
        if (
          publishMode === 'all' ||
          contactList.relaysNormalized.includes(url)
        ) {
          broadcastToRelay(connection, signedEvent);
        }
      }
    }
    return signedEvent;
  };

  const startPublishNewKind3 = async (contactList: ContactList) => {
    return signAndPublish({
      contactList,
      event: contactListToKind3Event(contactList),
    });
  };

  const startPublishNewKind10002 = async (contactList: ContactList) => {
    return signAndPublish({
      contactList,
      event: contactListToKind10002Event(contactList),
    });
  };

  const startBroadcast = (contactList: ContactList) => {
    const { event } = contactList;
    console.log('startedBroadcast', event);
    setStatusText(t('info.broadcast.start'));
    for (const [url, connection] of Object.entries(connections)) {
      if (publishMode === 'all' || contactList.relaysNormalized.includes(url)) {
        broadcastToRelay(connection, event);
      }
    }
  };

  const startFollowMyself = async ({
    contactList,
    unfollow,
  }: {
    contactList: ContactList;
    unfollow: boolean;
  }) => {
    const newContactHexes: string[] = contactList.contacts.filter(
      hex => hex !== login.npubHex,
    );
    if (!unfollow) newContactHexes.push(login.npubHex);
    const event: NostrEvent = {
      kind: 3,
      created_at: (Date.now() / 1000) | 0,
      tags: newContactHexes.map(hex => ['p', hex]),
      content: contactList.event.content,
      pubkey: login.npubHex,
    };
    signAndPublish({ contactList, event });
  };

  const startFindMore = async () => {
    setStatusText(t('info.findMore.start'));
    const res = await fetch('https://api.nostr.watch/v1/public', {
      mode: 'cors',
    });
    const publicUrlsOrig = shuffle(
      jsonParseOrEmptyArray(await res.text()) as string[],
    );
    const publicUrls = separateArrayByN(
      10,
      publicUrlsOrig.map(relayUrlNormalize),
    );
    urlsLoop: for (const [i, urls] of publicUrls.entries()) {
      setStatusText(
        `${t('info.findMore.start')} (${i * 10 + 1}/${publicUrlsOrig.length})`,
      );
      for (const url of urls) {
        if (!connections[url]) addConnection(url);
      }
      delayLoop: for (let i = 0; i < 8; i++) {
        await delay(1000);
        for (const url of urls) {
          if (
            connections[url].status === 'connecting' ||
            connections[url].status === 'connected'
          ) {
            continue delayLoop;
          }
          // all urls are either failed or disconnected or ok
          break delayLoop;
        }
      }
      if (profileCreatedAt !== 0 && kind3s.length !== 0) break urlsLoop;
      for (const url of urls) {
        if (!profileEventFrom.includes(url) && connections[url]?.relay) {
          connections[url].status = 'failed';
          connections[url].relay?.close();
          connections[url].relay = null;
        }
      }
    }
    setStatusText(
      profileCreatedAt === 0
        ? t('info.findMore.notFound')
        : t('info.findMore.end'),
    );
  };

  const recoverWith0Followee = async () => {
    const relayUrls = shuffle(relayUrlListToBulkAdd.globalFamousFree).slice(-5);
    const relaysObj: Nip07Relays = Object.fromEntries(
      relayUrls.map(url => [url, { read: true, write: true }]),
    );
    const sendRelayUrls = [...profileEventFrom, ...relayUrls];
    const now = (Date.now() / 1000) | 0;
    const kind3 = await signAndPublish({
      event: {
        kind: 3,
        created_at: now,
        pubkey: login.npubHex,
        content: JSON.stringify(relaysObj),
        tags: [['p', login.npubHex]],
      },
    });
    const kind10002 = await signAndPublish({
      event: {
        kind: 10002,
        created_at: now,
        pubkey: login.npubHex,
        content: '',
        tags: relayUrls.map(url => ['r', url]),
      },
    });
    if (!kind3 || !kind10002) return;
    // const contactList = kind3ToContactList({ event: kind3, eventFrom: ['<>'] });
    for (const url of sendRelayUrls) {
      (async () => {
        if (!connections[url]) {
          await addConnection(url);
        } else if (connections[url].status === 'disconnected') {
          await addConnection(url, true);
        }
        await broadcastToRelay(connections[url], profile.event);
        await broadcastToRelay(connections[url], kind3);
        await broadcastToRelay(connections[url], kind10002);
      })();
    }
    kind3s.push({ event: kind3, eventFrom: ['<>'] });
    kind3s.push({ event: kind10002, eventFrom: ['<>'] });
    kind3sUpdate();
  };

  const addConnection = async (url: string, retry?: boolean) => {
    url = relayUrlNormalize(url);
    if (!retry && connections[url]) return;
    const relay = NostrTools.relayInit(url);
    console.log('connecting to', url);
    const connection: Connection =
      retry && connections[url]
        ? connections[url]
        : {
            url,
            relay: null,
            status: 'connecting',
            selected: false,
          };
    relay.on('disconnect', () => {
      console.log(`${url}: disconnected`);
      if (connection.status !== 'failed') connection.status = 'disconnected';
      connection.relay = null;
    });
    connections[url] = connection;
    try {
      await relay.connect();
    } catch {
      console.warn(`${url}: failed to connect`);
      connection.status = 'failed';
      return;
    }
    console.log(url, ': connected');
    connection.relay = relay;
    if (connection.status === 'connecting') connection.status = 'connected';
    if (connection.status === 'connected' && !retry) {
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
            setStatusText(t('info.showingFollows'));
          }
          profileCreatedAt = event.created_at;
          profileEventFrom = [url];
          const content = JSON.parse(event.content);
          setProfile({
            loaded: true,
            id: event.id || '',
            createdAt: event.created_at,
            displayName: content.display_name || '',
            username: content.username || content.name || '',
            about: content.about || '',
            picture: content.picture || '',
            event,
          });
        } else if (event.created_at === profileCreatedAt) {
          profileEventFrom.push(url);
        }
      }
      let kind3sUpdated = false;
      const kind3Events: NostrEvent[] = [
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
      ];
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
      console.log(
        `${url}: ok. k0(profile)=${
          kind0available ? 'found' : 'no'
        }, k3(contacts)=${kind3available ? 'found' : 'no'}`,
      );
    }
    if (connection.status === 'connected') connection.status = 'ok';
  };
  const initConnect = async () => {
    setStatusText(t('info.findindProfiles'));
    const relays = Object.keys({
      ...(login.relays || {}),
      ...relayDefaults,
    });
    connections = {};
    kind3s = [];
    profileCreatedAt = 0;
    profileEventFrom = [];
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
            <span class="profile-loading">({t('text.loading')})</span>
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
            {t(
              'info.loggedInWith',
              {
                nip07: 'NIP-07',
                npub: t('text.publicKey'),
                nsec: t('text.privateKey'),
              }[login.type],
            )}{' '}
            <button
              onClick={() => {
                if (confirm(t('action.logout.confirm'))) {
                  for (const [url, connection] of Object.entries(connections)) {
                    const { relay } = connection;
                    if (relay) relay.close();
                    console.log(`${url}: closed`);
                  }
                  setLogin({ ...login, npubHex: '', nsecHex: '' });
                }
              }}>
              {t('text.logout')}
            </button>
            <button
              onClick={() => {
                for (const [url, connection] of Object.entries(connections)) {
                  const { relay } = connection;
                  if (relay) relay.close();
                  console.log(`${url}: closed`);
                }
                setProfile(profileDefault);
                setContactLists([]);
                initConnect();
              }}>
              {t('action.reload')}
            </button>
            {writable && (
              <button
                disabled={
                  !contactLists.some(c => c.event.kind === 3) ||
                  JSON.stringify(
                    contactLists.find(c => c.event.kind === 3)?.relaysObj,
                  ) ===
                    JSON.stringify(
                      contactLists.find(c => c.event.kind === 10002)?.relaysObj,
                    )
                }
                onClick={() => {
                  const contactList = contactLists.find(
                    c => c.event.kind === 3,
                  );
                  if (contactList) startPublishNewKind10002(contactList);
                }}>
                {t('action.send.kind10002.basedOnKind3')}
              </button>
            )}
          </div>
        </div>
      </div>
      <div class="connection-status">
        <span class="status-text">{statusText}</span>
        {!profile.loaded && (
          <button
            onClick={() => {
              startFindMore();
            }}>
            {t('action.findMore')} ({t('action.findMore.desc')})
          </button>
        )}
      </div>
      <div class="events-actions">
        <details class="settings">
          <summary>({t('setting.label')})</summary>
          <div>
            <div>
              <label for="publish-mode-select">
                {t('setting.publishMode.label')}:{' '}
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
                  <option value="registered">
                    {t('setting.publishMode.registered')}{' '}
                    {t('text.recommended')}
                  </option>
                  <option value="all">{t('setting.publishMode.all')}</option>
                </select>
              </label>
            </div>
            <div>
              <label>
                <input
                  type="checkbox"
                  checked={showKind10002}
                  onChange={() => {
                    setShowKind10002(!showKind10002);
                  }}
                />
                {t('setting.showKind10002.label')}
              </label>
            </div>
            <div>
              <form
                onSubmit={evt => {
                  evt.preventDefault();
                  const url = relayUrlNormalize(relayAddInput);
                  if (isValidNormalizedRelayUrl(url)) {
                    if (connections[url]?.status !== 'connected') {
                      addConnection(relayAddInput, true);
                    }
                    setRelayAddInput('');
                  }
                }}>
                <label for="relay-add-input">
                  {t('setting.addRelayManually.label')}:{' '}
                  <input
                    type="text"
                    id="relay-add-input"
                    placeholder="wss://relay.damus.io"
                    value={relayAddInput}
                    onInput={({ target }) => {
                      if (target instanceof HTMLInputElement) {
                        setRelayAddInput(target.value);
                      }
                    }}
                  />
                  <button type="submit">
                    {t('setting.addRelayManually.button')}
                  </button>
                </label>
              </form>
            </div>
            <div>
              <label for="lang-select">
                {t('setting.lang.label')}:{' '}
                <select
                  id="lang-select"
                  value={lang}
                  onChange={({ target }) => {
                    if (!(target instanceof HTMLSelectElement)) return;
                    const langValue = target.value;
                    if (langValue === 'default') return setLang('default');
                    for (const lang of LangNames.keys()) {
                      if (lang === langValue) return setLang(lang);
                    }
                  }}>
                  <option value="default">{t('text.default')}</option>
                  {Array.from(LangNames.entries()).map(([key, name]) => (
                    <option value={key} key={key}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
        </details>
        <button onClick={uploadLocalBackupFile}>
          {t('action.backup.load')}
        </button>
        <button onClick={addCombinedEventFromSelection}>
          {t('action.selected.combine')}
        </button>
        {writable && profile.loaded && !contactLists.length && (
          <button
            onClick={() => {
              const sendRelayCount = 5 + profileEventFrom.length;
              if (
                confirm(
                  t('action.send.overwrite.confirm', 0, 5, sendRelayCount),
                )
              ) {
                recoverWith0Followee();
              }
            }}>
            {t('action.followee0')}
          </button>
        )}
      </div>
      <div class="contact-events">
        {contactLists
          .filter(c => (showKind10002 ? true : c.event.kind === 3))
          .map((contactList, index) => (
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
              {contactList.type === 'contacts' ? (
                <div class="event-contact-count">
                  {t('followings.count')}: {contactList.contacts.length}
                </div>
              ) : (
                <div class="event-relays-info">
                  ({t('followings.kind10002')})
                </div>
              )}
              <div class="event-relays">
                <details>
                  <summary>
                    {t('followings.relays')}: {contactList.relays.length}
                  </summary>
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
                {writable && (
                  <>
                    {contactList.event.kind === 3 && (
                      <button
                        onClick={() => {
                          if (
                            confirm(
                              t(
                                'action.send.overwrite.confirm',
                                contactList.contacts.length,
                                contactList.relays.length,
                                (publishMode === 'registered' &&
                                  contactList.relays.length) ||
                                  Object.keys(connections).length,
                              ),
                            )
                          ) {
                            startPublishNewKind3(contactList);
                          }
                        }}>
                        {t('action.send.overwrite.button')}
                      </button>
                    )}
                    {((contactList.event.kind === 3 &&
                      contactList.createdAt === latestGotKind3Time) ||
                      (contactList.event.kind === 10002 &&
                        contactList.createdAt === latestGotKind10002Time)) && (
                      <button
                        onClick={() => {
                          if (
                            contactList.event.kind === 10002 ||
                            confirm(
                              t(
                                'action.send.broadcast.confirm',
                                contactList.contacts.length,
                                contactList.relays.length,
                                (publishMode === 'registered' &&
                                  contactList.relays.length) ||
                                  Object.keys(connections).length,
                              ),
                            )
                          ) {
                            startBroadcast(contactList);
                          }
                        }}>
                        {t('action.send.broadcast.button')}
                      </button>
                    )}
                    {contactList.event.kind === 3 &&
                      contactList.createdAt === latestGotKind3Time && (
                        <>
                          <button
                            onClick={() => {
                              const unfollow = contactList.contacts.includes(
                                login.npubHex,
                              );
                              const followCount =
                                contactList.contacts.length +
                                (unfollow ? -1 : 1);
                              if (
                                confirm(
                                  t(
                                    unfollow
                                      ? 'action.myself.unfollow.confirm'
                                      : 'action.myself.follow.confirm',
                                    followCount,
                                  ),
                                )
                              ) {
                                startFollowMyself({ contactList, unfollow });
                              }
                            }}>
                            {contactList.contacts.includes(login.npubHex)
                              ? t('action.myself.unfollow.button')
                              : t('action.myself.follow.button')}
                          </button>
                          <button
                            disabled={
                              !contactLists.some(c => c.event.kind === 3)
                            }
                            onClick={() => {
                              setContactListToEdit(contactList);
                              setContactListToEditOld(contactList);
                              setRelaysInputText('');
                              relaysDialogRef.current?.showModal();
                              document.documentElement.classList.add(
                                'pull-to-refresh-disabled',
                              );
                            }}>
                            {t('action.relays.show')}
                          </button>
                        </>
                      )}
                  </>
                )}
                <button
                  onClick={() => {
                    downloadBackupFile(contactList);
                  }}>
                  {t('action.backup.download')}
                </button>
              </div>
              <hr />
            </div>
          ))}
      </div>
      <dialog
        class="dialog-relays"
        ref={relaysDialogRef}
        onClick={evt => {
          if (relaysDialogRef.current === evt.target) {
            relaysDialogRef.current?.close();
            document.documentElement.classList.remove(
              'pull-to-refresh-disabled',
            );
            console.log('closed');
          }
        }}>
        <div class="relays-container" ref={relaysContainerRef}>
          {contactListToEdit && contactListToEditOld && (
            <div class="relays-app">
              <div class="dialog-header">
                <button
                  onClick={() => {
                    relaysDialogRef.current?.close();
                    setContactListToEdit(null);
                    setContactListToEditOld(null);
                  }}>
                  {t('text.close')}
                </button>
                <button
                  disabled={
                    contactListToEdit.relays.length === 0 ||
                    JSON.stringify(contactListToEdit.relaysObj) ===
                      JSON.stringify(contactListToEditOld.relaysObj)
                  }
                  onClick={async () => {
                    // send
                    const contactList = contactListToEdit;
                    const now = Math.floor(Date.now() / 1000);
                    if (
                      confirm(
                        t(
                          'action.send.overwrite.confirm',
                          contactList.contacts.length,
                          contactList.relays.length,
                          (publishMode === 'registered' &&
                            contactList.relays.length) ||
                            Object.keys(connections).length,
                        ),
                      )
                    ) {
                      const kind3 = await startPublishNewKind3(contactList);
                      const kind10002 = await startPublishNewKind10002(
                        contactList,
                      );
                      if (kind3)
                        kind3s.push({
                          eventFrom: [`<sent: ${secToDateString(now)}>`],
                          event: kind3,
                        });
                      if (kind10002)
                        kind3s.push({
                          eventFrom: [`<sent: ${secToDateString(now)}>`],
                          event: kind10002,
                        });
                      kind3sUpdate();
                      setContactListToEditOld(contactList);
                    }
                  }}>
                  {`${t('relays.send')} (${
                    contactListToEdit.relays.length
                  } Relays)`}
                </button>
                <button
                  disabled={
                    contactListToEdit.relays.length === 0 ||
                    JSON.stringify(contactListToEdit.relaysObj) ===
                      JSON.stringify(contactListToEditOld.relaysObj)
                  }
                  onClick={() => {
                    setContactListToEdit(contactListToEditOld);
                  }}>
                  {t('relays.reset')}
                </button>
              </div>
              <div class="relays-input">
                <details>
                  <summary>{t('relays.add.show')}</summary>
                  <div class="relays-input-buttons">
                    <button
                      onClick={() => {
                        const newUrls = shuffle(
                          relayUrlListToBulkAdd.globalFamousFree,
                        ).slice(-5);
                        const urls = uniqLast([
                          ...newUrls,
                          ...relaysInputText.split('\n').filter(url => url),
                        ]);
                        setRelaysInputText(urls.join('\n'));
                      }}>
                      + {t('relays.add.famous')}
                    </button>
                    {t('___lang') === 'ja' && (
                      <button
                        onClick={() => {
                          const newUrls = relayUrlListToBulkAdd.japanese;
                          const urls = uniqLast([
                            ...newUrls,
                            ...relaysInputText.split('\n').filter(url => url),
                          ]);
                          setRelaysInputText(urls.join('\n'));
                        }}>
                        + {t('relays.add.japanese')}
                      </button>
                    )}
                    <button
                      onClick={() => {
                        setRelaysInputText('');
                      }}>
                      ×
                    </button>
                  </div>
                  <textarea
                    placeholder={`${t('relays.input.message')}\n\n${t(
                      'text.example',
                    )}:\nwss://relay.damus.io\nwss://relay.snort.social\n...`}
                    value={relaysInputText}
                    onInput={evt => {
                      if (evt.target instanceof HTMLTextAreaElement) {
                        setRelaysInputText(evt.target.value);
                      }
                    }}
                  />
                  <div class="relays-input-buttons">
                    <button
                      onClick={() => {
                        const newRelaysObj: Nip07Relays = {
                          ...contactListToEdit.relaysObj,
                        };
                        const urls = relaysInputText
                          .split('\n')
                          .map(relayUrlNormalize)
                          .filter(url => isValidNormalizedRelayUrl(url))
                          .map(relayUrlNormalize);
                        for (const url of urls) {
                          if (
                            !contactListToEdit.relaysNormalized.includes(url)
                          ) {
                            newRelaysObj[url] = {
                              read: true,
                              write: true,
                            };
                          }
                        }
                        setContactListToEdit(
                          updateContactListRelays(
                            contactListToEdit,
                            newRelaysObj,
                          ),
                        );
                        setRelaysInputText('');
                      }}>
                      {t('relays.add.toList')}
                    </button>
                  </div>
                </details>
              </div>
              <div class="relays-input-buttons">
                <button
                  onClick={() => {
                    const newRelaysObj: Nip07Relays = {};
                    for (const [url, info] of Object.entries(
                      contactListToEdit.relaysObj,
                    )) {
                      const duppedInfo: typeof info | undefined =
                        newRelaysObj[relayUrlNormalize(url)];
                      newRelaysObj[relayUrlNormalize(url)] = {
                        read: !!duppedInfo?.read || info.read,
                        write: !!duppedInfo?.write || info.write,
                      };
                    }
                    setContactListToEdit(
                      updateContactListRelays(contactListToEdit, newRelaysObj),
                    );
                  }}>
                  {t('relays.normalize')}
                </button>
              </div>
              <div class="relays-list">
                <div class="relays-list-header relays-list-relay-url">
                  {t('relays.relay.url')}
                </div>
                <div class="relays-list-header relays-list-read">
                  {t('relays.relay.r')}
                </div>
                <div class="relays-list-header relays-list-write">
                  {t('relays.relay.w')}
                </div>
                <div class="relays-list-header relays-list-delete">
                  {t('relays.relay.action')}
                </div>
                {Object.entries(contactListToEdit.relaysObj).map(
                  ([url, info]) => (
                    <Fragment key={url}>
                      <div class="relays-list-relay-url">
                        <code>{url}</code>
                      </div>
                      <div class="relays-list-read">
                        <label>
                          <input
                            type="checkbox"
                            checked={info.read}
                            title="read"
                            onChange={evt => {
                              if (evt.target instanceof HTMLInputElement) {
                                setContactListToEdit({
                                  ...contactListToEdit,
                                  relaysObj: {
                                    ...contactListToEdit.relaysObj,
                                    [url]: {
                                      ...info,
                                      read: evt.target.checked,
                                    },
                                  },
                                });
                              }
                            }}
                          />
                        </label>
                      </div>
                      <div class="relays-list-write">
                        <label>
                          <input
                            type="checkbox"
                            checked={info.write}
                            title="write"
                            onChange={evt => {
                              if (evt.target instanceof HTMLInputElement) {
                                setContactListToEdit({
                                  ...contactListToEdit,
                                  relaysObj: {
                                    ...contactListToEdit.relaysObj,
                                    [url]: {
                                      ...info,
                                      write: evt.target.checked,
                                    },
                                  },
                                });
                              }
                            }}
                          />
                        </label>
                      </div>
                      <div class="relays-list-delete">
                        <button
                          onClick={() => {
                            const newRelaysObj = {
                              ...contactListToEdit.relaysObj,
                            };
                            delete newRelaysObj[url];
                            setContactListToEdit(
                              updateContactListRelays(
                                contactListToEdit,
                                newRelaysObj,
                              ),
                            );
                          }}>
                          {t('relays.relay.delete')}
                        </button>
                      </div>
                    </Fragment>
                  ),
                )}
              </div>
            </div>
          )}
        </div>
      </dialog>
    </div>
  );
};
