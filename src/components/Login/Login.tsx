import { useContext, useEffect, useState } from 'preact/hooks';
import { Nip07Nostr } from '../../@types/nip07';
import { LoginContext } from '../../app';
import * as NostrTools from '../../lib/nostrTools';
import './Login.css';

declare global {
  var nostr: Nip07Nostr | undefined;
}

export const Login = () => {
  const { setLogin } = useContext(LoginContext);
  const [loginKeyInput, setLoginKeyInput] = useState('');
  const [loginStatus, setLoginStatus] = useState<'' | 'loading' | 'success'>(
    '',
  );
  const [nip07Available, setNip07Available] = useState(false);

  useEffect(() => {
    let checkCount = 0;
    const checkNip07 = () => {
      // check for 5 seconds
      checkCount++;
      if (window.nostr) {
        setNip07Available(true);
      } else if (checkCount < 20) {
        setTimeout(checkNip07, 250);
      }
    };
    checkNip07();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div id="sign-in-area">
      <h2>ログイン</h2>
      <div>
        <button
          disabled={!!loginStatus || !nip07Available}
          onClick={() => {
            (async () => {
              if (window.nostr) {
                setLoginStatus('loading');
                const relays = await window.nostr.getRelays();
                const npubHex = await window.nostr.getPublicKey();
                //const npub = NostrTools.nip19.npubEncode(npubHex);
                setLogin({
                  type: 'nip07',
                  npubHex,
                  nsecHex: '',
                  relays,
                });
                setLoginStatus('success');
              }
            })().catch(e => {
              console.error(e);
              setLoginStatus('');
            });
          }}>
          NIP-07でログイン (推奨)
          {nip07Available ? '' : ' - 拡張機能がみつかりません'}
        </button>
      </div>
      <div>
        <form
          method="POST"
          onSubmit={evt => {
            evt.preventDefault();
            if (!loginKeyInput) return;
            try {
              setLoginStatus('loading');
              const { type, data } = NostrTools.nip19.decode(loginKeyInput);
              if (
                (type !== 'npub' && type !== 'nsec') ||
                typeof data !== 'string'
              )
                throw new Error('not npub/nsec');
              setLogin(
                type === 'npub'
                  ? {
                      type,
                      npubHex: data,
                      nsecHex: '',
                    }
                  : {
                      type,
                      npubHex: NostrTools.getPublicKey(data),
                      nsecHex: data,
                    },
              );
              setLoginKeyInput('');
              setLoginStatus('success');
            } catch (e) {
              console.error(new Error('not npub/nsec'));
              setLoginStatus('');
            }
          }}>
          <input
            disabled={!!loginStatus}
            onInput={evt => {
              if (evt.target instanceof HTMLInputElement) {
                setLoginKeyInput(evt.target.value);
              }
            }}
            placeholder="nsec / npub"
            type="password"
            value={loginKeyInput}
          />
          <button disabled={!!loginStatus} type="submit">
            {/^npub/.test(loginKeyInput)
              ? '公開鍵'
              : /^nsec/.test(loginKeyInput)
              ? '秘密鍵'
              : '秘密鍵/公開鍵'}
            でログイン
          </button>
        </form>
      </div>
    </div>
  );
};
