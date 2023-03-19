import { useContext, useEffect, useState } from 'preact/hooks';
import { Nip07Nostr } from '../../@types/nip07';
import { LoginContext, PrefsContext } from '../../app';
import { i18n, I18nKey, I18nParams } from '../../lib/i18n';
import * as NostrTools from '../../lib/nostrTools';
import './Login.css';

declare global {
  var nostr: Nip07Nostr | undefined;
}

export const Login = () => {
  const { lang } = useContext(PrefsContext);
  const { setLogin } = useContext(LoginContext);
  const [loginKeyInput, setLoginKeyInput] = useState('');
  const [loginStatus, setLoginStatus] = useState<'' | 'loading' | 'success'>(
    '',
  );
  const [loginMode, setLoginMode] = useState<'main' | 'badgesMain'>('main');
  const [nip07Available, setNip07Available] = useState(false);

  const t = (key: I18nKey, ...param: I18nParams) => i18n(lang, key, ...param);

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
      <h2>{t('text.login')}</h2>
      <div>
        <form
          onSubmit={event => event.preventDefault()}
          id="login-mode-selector">
          <span>Mode:</span>
          <label>
            <input
              type="radio"
              name="login-mode-input"
              value="main"
              onChange={() => setLoginMode('main')}
              checked={loginMode === 'main'}
            />
            <span>{t('login.mode.followees')}</span>
          </label>
          <label>
            <input
              type="radio"
              name="login-mode-input"
              value="main"
              onChange={() => setLoginMode('badgesMain')}
              checked={loginMode === 'badgesMain'}
            />
            <span>{t('login.mode.badges')}</span>
          </label>
        </form>
        <button
          type="button"
          disabled={!!loginStatus || !nip07Available}
          onClick={() => {
            (async () => {
              if (window.nostr) {
                setLoginStatus('loading');
                const relays = window.nostr.getRelays
                  ? await window.nostr.getRelays()
                  : {};
                const npubHex = await window.nostr.getPublicKey();
                setLogin({
                  type: 'nip07',
                  npubHex,
                  nsecHex: '',
                  relays,
                  mode: loginMode,
                });
                setLoginStatus('success');
              }
            })().catch(e => {
              console.error(e);
              setLoginStatus('');
            });
          }}>
          {t('action.loginWith', 'NIP-07')} {t('text.recommended')}
          {nip07Available ? '' : ` - ${t('info.nip07.unavailable')}`}
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
                      mode: loginMode,
                    }
                  : {
                      type,
                      npubHex: NostrTools.getPublicKey(data),
                      nsecHex: data,
                      mode: loginMode,
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
            {t(
              'action.loginWith',
              /^npub/.test(loginKeyInput)
                ? t('text.publicKey')
                : /^nsec/.test(loginKeyInput)
                ? t('text.privateKey')
                : `${t('text.privateKey')}/${t('text.publicKey')}`,
            )}
          </button>
        </form>
      </div>
    </div>
  );
};
