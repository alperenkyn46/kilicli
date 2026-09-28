# ADR-0013: Tek kullanıcı uygulaması, çok kullanıcılı domain

## Durum

Kabul edildi.

## Bağlam

İlk çalışan sürüm tek kullanıcı, tek makine ve local repository'dir. Şemayı "tek kullanıcı var" diye kilitlemek, sonraki auth ve çoklu makineyi migration ile kırmak demektir.

## Karar

Implementation local-first'tir. Auth, remote execution ve multi-device bu dilimde aktif değildir.

Domain'de şunlar ilk günden vardır:

- `users`
- `workspace_members`
- `execution_nodes` (`local` veya `remote`)

Hiçbir tabloda tek satırlık kullanıcı varsayımı yoktur. Workspace slug'ı global unique değildir; çakışma iki kullanıcı arasında mümkün kalsın diye benzersizlik zorlanmaz.

Daemon, makine kimliğini `~/.kilic/execution-node.json` içinde tutar ve bir `execution_nodes` satırı kaydeder.

## Sonuç

İlk süreç tek makinede çalışır. İkinci bir node, yeni bir satırdır; şema değişikliği değildir.
