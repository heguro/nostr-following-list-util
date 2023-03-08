import { useContext, useEffect, useState } from 'preact/hooks';
import { Nip07Nostr, Nip07Relays } from '../../@types/nip07';
import { NostrEvent } from '../../@types/nostrTools';
import { LoginContext } from '../../app';
import {
  AcceptedBadge,
  BadgeAward,
  BadgeInfo,
  Connection,
  ContactList,
  kind3ToContactList,
  Profile,
  profileDefault,
} from '../../lib/kinds';
import * as NostrTools from '../../lib/nostrTools';
import {
  delay,
  jsonParseOrEmptyArray,
  jsonParseOrEmptyObject,
} from '../../lib/util';
import './BadgesMain.css';

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
  'wss://relay.nostr.band': { read: true, write: true },
  'wss://relay.nostr.wirednet.jp': { read: true, write: true },
  'wss://offchain.pub': { read: true, write: true },
  'wss://nostr.wine': { read: true, write: false },
  'wss://nostr.bitcoiner.social': { read: true, write: true },
  'wss://nostr.relayer.se': { read: true, write: true },
};

let connections: {
  [url: string]: Connection;
} = {};

let profileCreatedAt = 0;
// let currentBroadcastingId = '';
let kind3s: { eventFrom: string[]; event: NostrEvent }[] = [];
let kind8s: { eventFrom: string[]; event: NostrEvent }[] = [];
let latestKind30008: { eventFrom: string[]; event: NostrEvent } | null = null;
let kind30009IdList: string[] = [];
let kind30009PubkeyList: string[] = [];
const kind0ProfileFromPubkey = new Map<
  string,
  { eventFrom: string[]; profile: Profile } | null
>();
const kind2FromPubkey = new Map<
  string,
  { eventFrom: string[]; event: NostrEvent } | null
>();
const kind3ContactListFromPubkey = new Map<string, ContactList | null>();

const kind30009FromId = new Map<
  string,
  { eventFrom: string[]; event: NostrEvent } | null
>();

export const BadgesMain = () => {
  const [profile, setProfile] = useState<Profile>(profileDefault);
  const [contactLists, setContactLists] = useState<ContactList[]>([]);
  const [latestGotKind3Time, setLatestGotKind3Time] = useState(0);
  const [statusText, setStatusText] = useState('');
  const [publishMode, setPublishMode] = useState<'registered' | 'all'>('all');
  const [acceptedBadges, setAcceptedBadges] = useState<AcceptedBadge[]>([]);
  const [awardedBadges, setAwardedBadges] = useState<BadgeAward[]>([]);

  const { setLogin, login } = useContext(LoginContext);
  const writable = login.type !== 'npub';
  const npub = NostrTools.nip19.npubEncode(login.npubHex);

  const splitKind30009Id = (kind30009Id: string) => {
    const [, kind30009Pubkey, kind30009D] = kind30009Id.split(':');
    return { kind30009Id, kind30009Pubkey, kind30009D };
  };

  const kind8ToBadgeAward = (params: {
    event: NostrEvent;
    eventFrom: string[];
  }) => {
    const { event, eventFrom } = params;
    const { tags } = event;
    const a = tags.find(tag => tag[0] === 'a')?.at(1);
    if (!a) return null;
    const { kind30009Id, kind30009Pubkey, kind30009D } = splitKind30009Id(a);
    const kind30009 = kind30009FromId.get(kind30009Id) ?? undefined;
    const badgeInfo = kind30009 ? kind30009ToBadgeInfo(kind30009) : undefined;
    return {
      id: event.id || '',
      createdAt: event.created_at,
      awardedBy: kind0ProfileFromPubkey.get(kind30009Pubkey)?.profile || null,
      contactList: kind3ContactListFromPubkey.get(kind30009Pubkey) || null,
      kind30009Id,
      kind30009Pubkey,
      kind30009D,
      badgeInfo,
      event,
      eventFrom,
      selected: false,
    } as BadgeAward;
  };

  const kind30008ToAcceptedBadges = (params: {
    event: NostrEvent;
    eventFrom: string[];
  }) => {
    const { event, eventFrom } = params;
    const { tags } = event;

    const d = tags.find(tag => tag[0] === 'd')?.at(1);
    if (!d) return [];
    const acceptedBadges: AcceptedBadge[] = [];
    let lastA = '';
    for (const [i, tag] of tags.entries()) {
      // d, a, e, a, e, ...
      if (tag[0] === 'a') {
        lastA = tag[1];
      } else if (tag[0] === 'e') {
        const { kind30009Id, kind30009Pubkey, kind30009D } =
          splitKind30009Id(lastA);
        acceptedBadges.push({
          kind30009Id,
          kind30009Pubkey,
          kind30009D,
          kind8Id: tag[1],
          kind8Relay: tag[2] || null,
          eventFrom,
        });
      }
    }
    return acceptedBadges;
  };

  const kind30009ToBadgeInfo = (params: {
    event: NostrEvent;
    eventFrom: string[];
  }) => {
    const { event, eventFrom } = params;
    const { tags } = event;
    const d = tags.find(tag => tag[0] === 'd')?.at(1) || '';
    const kind30009Id = `30009:${event.pubkey}:${d || ''}`;
    return {
      kind30009Id,
      id: event.id || '',
      createdAt: event.created_at,
      awardedBy: kind0ProfileFromPubkey.get(event.pubkey)?.profile || null,
      d,
      name: tags.find(tag => tag[0] === 'name')?.at(1) ?? null,
      description: tags.find(tag => tag[0] === 'description')?.at(1) ?? null,
      image: tags.find(tag => tag[0] === 'image')?.at(1) ?? null,
      thumb: tags.find(tag => tag[0] === 'thumb')?.at(1) ?? null,
      event,
      eventFrom,
    } as BadgeInfo;
  };

  const kind8sUpdate = () => {
    kind8s.sort((a, b) => b.event.created_at - a.event.created_at);
    const kind30008 = kind8s.find(({ event }) => event.kind === 30008);
    if (kind30008) {
      const kind30008Updated =
        !latestKind30008 || latestKind30008.event.id !== kind30008.event.id;
      latestKind30008 = kind30008;
      if (kind30008Updated || !acceptedBadges.length) {
        const newAcceptedBadges = kind30008ToAcceptedBadges(kind30008);
        setAcceptedBadges(newAcceptedBadges);
      }
    }
    const newAwardedBadges: typeof awardedBadges = kind8s
      .filter(e => e.event.kind === 8)
      .map(({ event, eventFrom }) => kind8ToBadgeAward({ event, eventFrom }))
      .filter(e => e !== null) as BadgeAward[];
    setAwardedBadges(newAwardedBadges);
    for (const badge of newAwardedBadges) {
      if (!kind30009IdList.includes(badge.kind30009Id)) {
        kind30009IdList.push(badge.kind30009Id);
      }
      if (!kind30009PubkeyList.includes(badge.kind30009Pubkey)) {
        kind30009PubkeyList.push(badge.kind30009Pubkey);
      }
    }
  };

  const kind3sUpdate = () => {
    kind3s.sort((a, b) => b.event.created_at - a.event.created_at);
    const newContactLists = kind3s.map(kind3ToContactList);
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
      setStatusText(`配信済: ${relay.url}`);
    };
    const seen = () => {
      console.log('seen by', relay.url);
    };
    const failed = (error: string) => {
      if (error === 'event not seen after 5 seconds') return;
      console.warn('failed to broadcast to', relay.url, error);
      if (error !== 'blocked: pubkey not admitted') {
        setStatusText(`配信失敗: ${relay.url} (${error})`);
      }
    };
    const pub = relay.publish(event);
    pub.on('ok', ok);
    pub.on('seen', seen);
    pub.on('failed', failed);
    console.log('broadcasting to', relay.url);
  };

  const signAndPublish = async ({ event }: { event: NostrEvent }) => {
    setStatusText('署名中…');
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
    const contactList = contactLists[0];
    for (const [url, connection] of Object.entries(connections)) {
      if (publishMode === 'all' || contactList.relaysObj[url]) {
        broadcastToRelay(connection, signedEvent);
      }
    }
    return signedEvent;
  };

  const addAndPublishNewAcceptedBadges = async (badges: BadgeAward[]) => {
    const kind30008Tags = latestKind30008?.event.tags || [
      ['d', 'profile_badges'],
    ];
    const beforeTagsLength = kind30008Tags.length;
    for (const badge of badges) {
      if (kind30008Tags.find(tag => tag[1] === badge.kind30009Id)) continue;
      kind30008Tags.push(
        ['a', badge.kind30009Id],
        [
          'e',
          badge.id || '',
          /* TODO: use (kind0 & kind3 & kind30009.eventFrom) data. */
          // badge.contactList?.relays,
        ],
      );
    }
    if (kind30008Tags.length === beforeTagsLength) return;
    const event: NostrEvent = {
      kind: 30008,
      pubkey: login.npubHex,
      created_at: (Date.now() / 1000) | 0,
      tags: kind30008Tags,
      content: '',
    };
    const signedEvent = await signAndPublish({ event });
    if (signedEvent) {
      kind8s.push({ eventFrom: [], event: signedEvent });
      kind8sUpdate();
    }
  };

  const removeAndPublishNewAcceptedBadges = async (badges: BadgeAward[]) => {
    const kind30008Tags = latestKind30008?.event.tags || [
      ['d', 'profile_badges'],
    ];
    const beforeTagsLength = kind30008Tags.length;
    for (let i = 0; i < kind30008Tags.length; i++) {
      if (kind30008Tags[i][0] !== 'a') continue;
      if (badges.find(badge => badge.kind30009Id === kind30008Tags[i][1])) {
        kind30008Tags.splice(i, 2);
        i--;
      }
    }
    if (kind30008Tags.length === beforeTagsLength) return;
    const event: NostrEvent = {
      kind: 30008,
      pubkey: login.npubHex,
      created_at: (Date.now() / 1000) | 0,
      tags: kind30008Tags,
      content: '',
    };
    const signedEvent = await signAndPublish({ event });
    if (signedEvent) {
      kind8s.push({ eventFrom: [], event: signedEvent });
      kind8sUpdate();
    }
  };

  const startBroadcast = (event: NostrEvent) => {
    console.log('startedBroadcast', event);
    setStatusText('ブロードキャスト開始…');
    const contactList = contactLists[0];
    for (const [url, connection] of Object.entries(connections)) {
      if (publishMode === 'all' || contactList.relaysObj[url]) {
        broadcastToRelay(connection, event);
      }
    }
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
            setStatusText('取得できたバッジリストを表示します…');
          }
          profileCreatedAt = event.created_at;
          const content = jsonParseOrEmptyArray(event.content);
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

      // badges
      let kind8sUpdated = false;
      const kind8Events = [
        ...(await relay.list([
          {
            // awarded to you
            '#p': [login.npubHex],
            kinds: [8],
            limit: 1000,
          },
        ])),
        ...(await relay.list([
          {
            // accepted by you list
            authors: [login.npubHex],
            kinds: [30008],
            '#d': ['profile_badges'],
            limit: 1,
          },
        ])),
      ] as NostrEvent[];
      for (const event of kind8Events) {
        const alreadyHadIndex = kind8s.findIndex(
          kind8 => kind8.event.id === event.id,
        );
        if (alreadyHadIndex !== -1) {
          const kind8 = kind8s[alreadyHadIndex];
          if (!kind8.eventFrom.includes(url)) {
            kind8.eventFrom.push(url);
            kind8sUpdated = true;
          }
        } else {
          kind8s.push({ eventFrom: [url], event });
          kind8sUpdated = true;
        }
      }
      if (kind8sUpdated) {
        kind8sUpdate();
      }

      await delay(1500); // temp
      let lastCheckedKind30009Ids = '';
      // let kind3009sCheckCount = 0;
      do {
        const keys = kind30009IdList;
        if (keys.length === 0) {
          await delay(1500);
          continue;
        }
        let kind30009Updated = false;
        console.log(`${url}: checking kind30009s`, {
          kind30009IdList,
          kind30009PubkeyList,
        });
        const kind30009Events = (await relay.list([
          {
            kinds: [30009],
            authors: keys
              .map(key => splitKind30009Id(key).kind30009Pubkey)
              .filter(d => d !== undefined),
            '#d': keys
              .map(key => splitKind30009Id(key).kind30009D)
              .filter(d => d !== undefined),
            limit: 1000,
          },
          {
            kinds: [0],
            authors: kind30009PubkeyList,
            limit: 1000,
          },
          {
            kinds: [3],
            authors: kind30009PubkeyList,
            limit: 1000,
          },
          {
            kinds: [10002],
            authors: kind30009PubkeyList,
            limit: 1000,
          },
        ])) as NostrEvent[];
        for (const event of kind30009Events) {
          if (event.kind === 0) {
            const content = jsonParseOrEmptyObject(event.content);
            const lastProfile = kind0ProfileFromPubkey.get(event.pubkey);
            if (
              !lastProfile ||
              event.created_at > lastProfile.profile.createdAt
            ) {
              kind0ProfileFromPubkey.set(event.pubkey, {
                eventFrom: [url],
                profile: {
                  loaded: true,
                  id: event.id || '',
                  createdAt: event.created_at,
                  displayName: content.display_name || '',
                  username: content.username || content.name || '',
                  about: content.about || '',
                  picture: content.picture || '',
                },
              });
              kind30009Updated = true;
            } else if (
              lastProfile.profile.id === event.id &&
              !lastProfile.eventFrom.includes(url)
            ) {
              lastProfile.eventFrom.push(url);
            }
            continue;
          } else if (event.kind === 2) {
            const last2 = kind2FromPubkey.get(event.pubkey);
            if (!last2 || event.created_at > last2.event.created_at) {
              kind2FromPubkey.set(event.pubkey, { eventFrom: [url], event });
              kind30009Updated = true;
            } else if (
              last2.event.id === event.id &&
              !last2.eventFrom.includes(url)
            ) {
              last2.eventFrom.push(url);
              kind30009Updated = true;
            }
            continue;
          } else if (event.kind === 3 || event.kind === 10002) {
            const lastContactList = kind3ContactListFromPubkey.get(
              event.pubkey,
            );
            if (
              !lastContactList ||
              event.created_at > lastContactList.createdAt
            ) {
              kind3ContactListFromPubkey.set(
                event.pubkey,
                kind3ToContactList({ event, eventFrom: [url] }),
              );
              kind30009Updated = true;
            } else if (
              lastContactList.id === event.id &&
              !lastContactList.eventFrom.includes(url)
            ) {
              lastContactList.eventFrom.push(url);
            }
            continue;
          }

          const id = `30009:${event.pubkey}:${
            event.tags.find(t => t[0] === 'd')?.[1] || ''
          }`;

          const last30009 = kind30009FromId.get(id);
          if (!last30009 || event.created_at > last30009.event.created_at) {
            kind30009FromId.set(id, { eventFrom: [url], event });
            kind30009Updated = true;
          } else if (
            last30009.event.id === event.id &&
            !last30009.eventFrom.includes(url)
          ) {
            last30009.eventFrom.push(url);
            kind30009Updated = true;
          }
        }
        if (kind30009Updated) {
          kind8sUpdate();
        }
        lastCheckedKind30009Ids = kind30009IdList.join('|');
        await delay(1500);
      } while (lastCheckedKind30009Ids !== kind30009IdList.join('|'));
    }
    connection.status = 'ok';
  };
  const initConnect = async (reload = false) => {
    setStatusText('プロフィールを探しています…');
    const relays = Object.keys({
      ...(login.relays || {}),
      ...relayDefaults,
    });
    connections = {};
    kind3s = [];
    kind8s = [];
    if (!reload) {
      kind30009IdList = [];
      kind30009PubkeyList = [];
    }
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
                    const { relay } = connection;
                    if (relay) relay.close();
                    console.log(`${url}: close`);
                  }
                  setLogin({ ...login, npubHex: '', nsecHex: '' });
                }
              }}>
              ログアウト
            </button>
            <button
              onClick={async () => {
                for (const [url, connection] of Object.entries(connections)) {
                  const { relay } = connection;
                  if (relay) relay.close();
                  console.log(`${url}: close`);
                }
                await delay(1000);
                setProfile(profileDefault);
                initConnect(true);
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
            <option value="registered">登録済リレー</option>
            <option value="all">できるだけ多くのリレー</option>
          </select>
        </div>
        <button
          onClick={() => {
            const selected = awardedBadges.filter(badge => badge.selected);
            if (
              !confirm(
                `＋ 選択した${selected.length}個のバッジをAcceptしますか？`,
              )
            )
              return;
            addAndPublishNewAcceptedBadges(selected);
          }}>
          ＋ 選択したバッジをAccept
        </button>
        <button
          onClick={() => {
            const selected = awardedBadges.filter(badge => badge.selected);
            if (
              !confirm(
                `× 選択した${selected.length}個のバッジをDeclineしますか？`,
              )
            )
              return;
            removeAndPublishNewAcceptedBadges(selected);
          }}>
          × 選択したバッジをDecline
        </button>
      </div>
      <hr />
      <div class="badges-tool">
        Awarded Badges: {awardedBadges.length} / Accepted Badges:{' '}
        {acceptedBadges.length}
        <div class="awarded-badges">
          {awardedBadges.map((badge, index) => {
            const { awardedBy, badgeInfo, contactList, event, selected } =
              badge;
            const badgeIcon = badgeInfo?.image || badgeInfo?.thumb;
            const accepted = acceptedBadges.some(
              b => b.kind30009D === badge.kind30009D,
            );
            return (
              <div class="awarded-badge" key={badge.id}>
                <div class="badge-icon">
                  {badgeIcon ? (
                    <img src={badgeIcon} alt="" />
                  ) : (
                    <div class="fallback-icon" />
                  )}
                </div>
                <div class="badge-names">
                  <label>
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => {
                        const newAwardedBadges = [...awardedBadges];
                        newAwardedBadges[index] = {
                          ...badge,
                          selected: !selected,
                        };
                        setAwardedBadges(newAwardedBadges);
                      }}
                    />
                    <span class="badge-name">
                      {badgeInfo?.name || badge.kind30009D || badge.kind30009Id}
                    </span>
                    {awardedBy && (
                      <span class="badge-username">
                        (by {awardedBy.displayName || ''} @{awardedBy.username})
                      </span>
                    )}
                  </label>
                </div>
                <div class="badge-info">
                  <div>{badgeInfo?.description}</div>
                  <div>
                    By: <code>{NostrTools.nip19.npubEncode(event.pubkey)}</code>
                  </div>
                  <div>
                    <button
                      disabled={!writable || accepted}
                      onClick={() => {
                        addAndPublishNewAcceptedBadges([badge]);
                      }}>
                      {accepted
                        ? '✓ Accepted'
                        : !writable
                        ? '(Not accepted)'
                        : '✓ Accept'}
                    </button>
                    {accepted && writable && (
                      <button
                        disabled={!accepted}
                        onClick={() => {
                          removeAndPublishNewAcceptedBadges([badge]);
                        }}>
                        × Decline
                      </button>
                    )}
                  </div>
                </div>
                <div class="badge-long-info">
                  <div>
                    <button
                      onClick={() => {
                        startBroadcast(event);
                      }}>
                      Broadcast awarded(8)
                    </button>
                    <button
                      disabled={!badgeInfo}
                      onClick={() => {
                        if (badgeInfo) {
                          startBroadcast(badgeInfo.event);
                        }
                      }}>
                      Broadcast badgeInfo(30009)
                    </button>
                  </div>
                  <div>
                    awarded(8):{' '}
                    {badge.eventFrom
                      .map(u => u.replace('wss://', ''))
                      .join(', ') || ''}
                  </div>
                  <div>
                    badgeInfo(30009):{' '}
                    {badgeInfo?.eventFrom
                      .map(u => u.replace('wss://', ''))
                      .join(', ') || ''}
                  </div>
                  <div>
                    profile(0):{' '}
                    {(awardedBy &&
                      kind0ProfileFromPubkey
                        .get(event.pubkey)
                        ?.eventFrom.map(u => u.replace('wss://', ''))
                        .join(', ')) ||
                      ''}
                  </div>
                  <div>
                    recommendRelay(2):{' '}
                    {kind2FromPubkey
                      .get(event.pubkey)
                      ?.eventFrom.map(u => u.replace('wss://', ''))
                      .join(', ') || ''}
                  </div>
                  <div>
                    contacts(3):{' '}
                    {contactList?.eventFrom
                      .map(u => u.replace('wss://', ''))
                      .join(', ') || ''}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        Created Badges: TODO
      </div>
    </div>
  );
};
