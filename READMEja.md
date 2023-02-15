# nostr-following-list-restorer (WIP)

[English](README.md)

Nostrのフォローリストを復元しようとするやつ (WIP)

## 仕組み

1. 複数のリレーから過去のフォローイベント (kind:3 Contacts) を探して表示する
2. 選択したリストを用い、現在の時刻で新しいイベントを作成しリレーに流す

## 使用ツール

- Vite
- Preact
- nostr-tools

## TODO

- 英語サポート

## License

MIT License
