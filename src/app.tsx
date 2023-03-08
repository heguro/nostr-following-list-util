import { createContext } from 'preact';
import { useMemo, useState } from 'preact/hooks';
import { Nip07Nostr, Nip07Relays } from './@types/nip07';
import './app.css';
import { BadgesMain } from './components/BadgesMain/BadgesMain';
import { Login } from './components/Login/Login';
import { Main } from './components/Main/Main';

declare global {
  var nostr: Nip07Nostr | undefined;
}

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

  const loginContextValue = useMemo(() => ({ login, setLogin }), [login]);

  return (
    <LoginContext.Provider value={loginContextValue}>
      <h1>NostrFlu</h1>
      {login.npubHex && login.mode === 'badgesMain' ? (
        <p>(バッジモード)</p>
      ) : (
        <p>
          Nostr Following List Util:
          Nostrのフォローリストを集めたり再送信するやつ
        </p>
      )}
      {!login.npubHex && <Login />}
      {login.npubHex && login.mode === 'main' && <Main />}
      {login.npubHex && login.mode === 'badgesMain' && <BadgesMain />}
      <p>
        公開鍵でログインした場合、フォローリストの取得・確認のみ可能です。
        <br />
        秘密鍵またはNIP-07でログインした場合、フォローリストの取得・確認と再送信が可能です。
      </p>
      <p>
        入力された秘密鍵はどこにも送信されず、ブラウザーのメモリ内にのみ保持されます。
      </p>
      <p>
        リレーとの通信状況が常に変動するため、リロードで結果が増減することがあります。
      </p>
      <p>
        追加説明:{' '}
        <a
          href="https://scrapbox.io/nostr/NostrFlu%E3%81%AE%E7%B4%B0%E3%81%8B%E3%81%84%E4%BB%95%E6%A7%98%E3%81%AA%E3%81%A9"
          target={login.npubHex ? '_blank' : undefined}
          rel="noreferrer noopener">
          NostrFluの細かい仕様など
        </a>{' '}
        (Scrapbox: nostr)
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
  );
};
