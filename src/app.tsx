import { createContext } from 'preact';
import { useMemo, useState } from 'preact/hooks';
import { Nip07Nostr, Nip07Relays } from './@types/nip07';
import './app.css';
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
}

const loginDefault: LoginProps = {
  type: 'npub',
  npubHex: '',
  nsecHex: '',
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
      <p>
        Nostr Following List Util: Nostrのフォローリストを集めたり編集するやつ
      </p>
      {!login.npubHex && <Login />}
      {login.npubHex && <Main />}
      <p>
        公開鍵でログインした場合、フォローリストの取得・確認のみ可能です。
        <br />
        秘密鍵またはNIP-07でログインした場合、フォローリストの取得・確認と再送信が可能です。
      </p>
      <p>
        入力された秘密鍵はどこにも送信されず、ブラウザーのメモリ内にのみ保持されます。
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
