# nostr-following-list-util (NostrFlu)

[English](README.md)

Nostrのフォローリストを集めたり再送信するやつ

## 機能

- 複数のリレーから過去のフォローイベント (kind:3 Contacts) を探して表示する
- 見つかったフォローリストをテキストファイルに出力
- 選択したリストまたはテキストファイルを用い、現在の時刻で新しいイベントを作成しリレーに流す

## 使用ツール

- Vite
- Preact
- nostr-tools

## TODO

- リスト内のユーザーを表示
- 編集
- 送信先リレー選択
- 英語サポート

## License

MIT License
