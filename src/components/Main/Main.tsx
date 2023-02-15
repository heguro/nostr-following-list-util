import { useContext, useEffect, useState } from 'preact/hooks';
import { Nip07Nostr, Nip07Relays } from '../../@types/nip07';
import { LoginContext } from '../../app';
import * as NostrTools from '../../lib/nostrTools';
import './main.css';

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
  'wss://nostr.fediverse.jp': { read: true, write: true },
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

export const Main = () => {
  const [profile, setProfile] = useState(profileDefault);
  const [statusText, setStatusText] = useState('プロフィールを探しています…');

  const { setLogin, login } = useContext(LoginContext);
  const npub = NostrTools.nip19.npubEncode(login.npubHex);

  const addConnection = async (url: string) => {
    console.log('connecting to', url);
    const relay = NostrTools.relayInit(url);
    await relay.connect();
    const connection: Connection = { relay: null, sub: null };
    connections[url] = connection;
    const sub = relay.sub([
      {
        // edit this param to show various events in console!!!!!!!!
        authors: [login.npubHex],
        kinds: [0, 3, 10002],
        limit: 10,
        // since: ((Date.now() / 1000) | 0) - 10000,
      },
    ]);
    sub.on('event', (event: NostrTools.Event) => {
      if (event.kind === 0 && event.created_at > profile.createdAt) {
        const content = JSON.parse(event.content);
        setProfile({
          loaded: true,
          createdAt: event.created_at,
          displayName: content.display_name || '',
          username: content.username || content.name || '',
          about: content.about || '',
          picture: content.picture || '',
        });
      } else if (event.kind !== 0) {
        console.log(url, event);
      }
    });
    sub.on('eose', () => {
      console.log(`${url}: ok`);
      sub.unsub();
      connection.sub = null;
    });
    connection.relay = relay;
  };
  const initConnect = async () => {
    const relays = Object.keys({
      ...(login.relays || {}),
      ...relayDefaults,
    });
    connections = {};
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
          </div>
        </div>
      </div>
      <div class="connection-status">
        <span class="status-text">{statusText}</span>
      </div>
      <div class="followings-area">
        <p>yea</p>
      </div>
    </div>
  );
};
