import { useContext, useEffect, useState } from 'preact/hooks';
import { Nip07Nostr, Nip07Relays } from '../../@types/nip07';
import { NostrEvent } from '../../@types/nostrTools';
import { LoginContext } from '../../app';
import { t } from '../../lib/i18n';
import {
  Connection,
  ContactList,
  contactListToKind10002Event,
  contactListToKind3Event,
  kind3ToContactList,
  Profile,
  profileDefault,
} from '../../lib/kinds';
import * as NostrTools from '../../lib/nostrTools';
import { msecToDateString, secToDateString } from '../../lib/util';
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

let connections: {
  [url: string]: Connection;
} = {};

let profileCreatedAt = 0;
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

  const { setLogin, login } = useContext(LoginContext);
  const writable = login.type !== 'npub';
  const npub = NostrTools.nip19.npubEncode(login.npubHex);

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
    contactList: ContactList;
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
    console.log('startedPublish', signedEvent);
    setStatusText(t('info.publish.start'));
    for (const [url, connection] of Object.entries(connections)) {
      if (publishMode === 'all' || contactList.relaysObj[url]) {
        broadcastToRelay(connection, signedEvent);
      }
    }
  };

  const startPublishNewKind3 = async (contactList: ContactList) => {
    signAndPublish({
      contactList,
      event: contactListToKind3Event(contactList),
    });
  };

  const startPublishNewKind10002 = async (contactList: ContactList) => {
    signAndPublish({
      contactList,
      event: contactListToKind10002Event(contactList),
    });
  };

  const startBroadcast = (contactList: ContactList) => {
    const { event } = contactList;
    console.log('startedBroadcast', event);
    setStatusText(t('info.broadcast.start'));
    for (const [url, connection] of Object.entries(connections)) {
      if (publishMode === 'all' || contactList.relaysObj[url]) {
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

  const addConnection = async (url: string, retry?: boolean) => {
    if (!retry && (connections[url] || connections[url.replace(/\/$/, '')]))
      return;
    const relay = NostrTools.relayInit(url);
    url = url.replace(/\/$/, '');
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
    connection.status = 'connected';
    if (!retry) {
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
          const content = JSON.parse(event.content);
          setProfile({
            loaded: true,
            id: event.id || '',
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
      console.log(
        `${url}: ok. k0(profile)=${
          kind0available ? 'found' : 'no'
        }, k3(contacts)=${kind3available ? 'found' : 'no'}`,
      );
    }
    connection.status = 'ok';
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
                disabled={!contactLists.some(c => c.event.kind === 3)}
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
      </div>
      <div class="events-actions">
        <div>
          ({t('setting.label')}){' '}
          <label for="publish-mode-select">
            {t('setting.publishMode.label')}:{' '}
          </label>
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
              {t('setting.publishMode.registered')} {t('text.recommended')}
            </option>
            <option value="all">{t('setting.publishMode.all')}</option>
          </select>
        </div>
        <button onClick={uploadLocalBackupFile}>
          {t('action.backup.load')}
        </button>
        <button onClick={addCombinedEventFromSelection}>
          {t('action.selected.combine')}
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
            {contactList.type === 'contacts' ? (
              <div class="event-contact-count">
                Followings count: {contactList.contacts.length}
              </div>
            ) : (
              <div class="event-relays-info">
                (Kind 10002: Relays infomation event)
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
                  {(contactList.event.kind === 3 &&
                    contactList.createdAt === latestGotKind3Time) ||
                    (contactList.event.kind === 10002 &&
                      contactList.createdAt === latestGotKind10002Time && (
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
                      ))}
                  {contactList.event.kind === 3 && (
                    <button
                      onClick={() => {
                        const unfollow = contactList.contacts.includes(
                          login.npubHex,
                        );
                        const followCount =
                          contactList.contacts.length + (unfollow ? -1 : 1);
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
    </div>
  );
};
