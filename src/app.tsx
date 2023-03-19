import { createContext } from 'preact';
import { useMemo, useState } from 'preact/hooks';
import { Nip07Nostr, Nip07Relays } from './@types/nip07';
import './app.css';
import { BadgesMain } from './components/BadgesMain/BadgesMain';
import { Login } from './components/Login/Login';
import { Main } from './components/Main/Main';
import { i18n, I18nKey, I18nParams, Language } from './lib/i18n';

declare global {
  var nostr: Nip07Nostr | undefined;
}

interface PrefsContextProps {
  lang: 'default' | Language;
  setLang: (lang: 'default' | Language) => void;
}

const langDefault = 'default';

export const PrefsContext = createContext<PrefsContextProps>({
  lang: langDefault,
  setLang: () => {},
});

type LoginType = 'nip07' | 'nsec' | 'npub';

interface LoginContextProps {
  login: LoginProps;
  setLogin: (login: LoginProps) => void;
}

interface LoginProps {
  type: LoginType;
  npubHex: string;
  nsecHex: string;
  relays?: Nip07Relays;
  mode: 'main' | 'badgesMain';
}

const loginDefault: LoginProps = {
  type: 'npub',
  npubHex: '',
  nsecHex: '',
  mode: 'main',
};

export const LoginContext = createContext<LoginContextProps>({
  login: loginDefault,
  setLogin: () => {}, // eslint-disable-line @typescript-eslint/no-empty-function
});

export const App = () => {
  const [login, setLogin] = useState<LoginProps>(loginDefault);
  const [lang, setLang] = useState<'default' | Language>(langDefault);

  const prefsContextValue = useMemo(() => ({ lang, setLang }), [lang]);
  const loginContextValue = useMemo(() => ({ login, setLogin }), [login]);

  const t = (key: I18nKey, ...param: I18nParams) => i18n(lang, key, ...param);

  return (
    <PrefsContext.Provider value={prefsContextValue}>
      <LoginContext.Provider value={loginContextValue}>
        <h1>NostrFlu</h1>
        {login.npubHex && login.mode === 'badgesMain' ? (
          <p>({t('info.mode.badges')})</p>
        ) : (
          <p>{t('desc.subtitle')}</p>
        )}
        {!login.npubHex && <Login />}
        {login.npubHex && login.mode === 'main' && <Main />}
        {login.npubHex && login.mode === 'badgesMain' && <BadgesMain />}
        <p>
          {t('footer.text.1')}
          <br />
          {t('footer.text.2')}
        </p>
        <p>{t('footer.text.3')}</p>
        <p>{t('footer.text.4')}</p>
        <p>
          {t('footer.additional.title')}:{' '}
          <a
            href="https://scrapbox-reader.vercel.app/nostr/NostrFlu%E3%81%AE%E4%BB%95%E6%A7%98"
            target={login.npubHex ? '_blank' : undefined}
            rel="noreferrer noopener">
            {t('footer.additional.link')}
          </a>{' '}
          (Scrapbox)
        </p>
        <p>
          GitHub:{' '}
          <a
            href="https://github.com/heguro/nostr-following-list-util"
            target={login.npubHex ? '_blank' : undefined}
            rel="noreferrer noopener">
            heguro/nostr-following-list-util
          </a>{' '}
          (MIT License)
        </p>
        <p>
          Author: heguro (
          <code>
            npub1jw4e8qh6vmyq0n2tkupv7wlfu5h59luk98dcfedf03anh5ek5jkq936u57
          </code>
          , NIP-05: heguro@heguro.com)
        </p>
      </LoginContext.Provider>
    </PrefsContext.Provider>
  );
};
