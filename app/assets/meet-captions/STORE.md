# Aveia: extensão do Meet nas lojas

A extensão em `extension/` é uma só para Chrome (MV3, `manifest.chrome.json`) e Firefox (MV2, `manifest.firefox.json`). Hoje ela é instalada à mão pelo Hive (`installCaptionBridge` escreve a pasta em `~/hive-meet-captions/chrome` e `~/hive-meet-captions/firefox`). Este arquivo guarda o que as lojas pedem para quando ela for publicada.

## O endereço do Aveia

O código da extensão não escreve o endereço do Aveia: onde ele entraria está o marcador `__AVEIA_ORIGIN__` (em `aveia-origin.js` e nos dois manifests). O endereço é configuração da implantação, na chave `HIVE_AVEIA_URL` do `hive.defaults`, e entra em dois momentos:

- **Instalação manual:** `installCaptionBridge` troca o marcador pelo endereço configurado ao escrever os arquivos. Sem endereço configurado, a extensão é instalada só com o destino Hive: o manifest sai sem a permissão, sem o script de conexão e sem `homepage_url`, o menu da chamada mostra só o Hive e o popup diz que o Aveia não está configurado.
- **Lojas:** `pack.mjs` (abaixo) faz a mesma troca ao gerar os pacotes.

No resto deste arquivo, "o endereço do Aveia configurado" é esse valor.

## Texto da listagem

**Nome:** Aveia

**Resumo (até 132 caracteres):** Grava reuniões do Google Meet pelas legendas, no Aveia e no Hive.

**Descrição:**

O Aveia grava suas reuniões do Google Meet sem bot na chamada e sem gravar áudio. A extensão lê as legendas que o próprio Meet mostra, com o nome de quem falou, e manda esse texto para onde você tem conta:

- **Aveia** (o endereço do Aveia configurado, sem o `https://`): a reunião vira uma nota com transcrição e resumo, que você abre e compartilha pelo navegador.
- **Hive**: se o app Hive estiver instalado neste computador, a reunião também é gravada nele, sem sair da máquina.

Como funciona:

1. Entre no Aveia e clique em conectar a extensão. Não há token para copiar.
2. Abra uma chamada do Meet. Um botão Gravar aparece ao lado dos botões da chamada.
3. Escolha onde gravar e clique em Gravar. Ao terminar, clique em Parar e gerar notas.

Quem tem os dois destinos grava nos dois. Quem tem só um, grava em um. Se a internet cair, as falas ficam guardadas no navegador e seguem para o Aveia quando ela voltar.

Avise quem está na chamada: ninguém além de você vê que a reunião está sendo gravada.

**Categoria:** Produtividade (Chrome), Produtividade/Ferramentas de trabalho (Firefox).

**Idioma:** Português (Brasil). A interface também responde em inglês quando o navegador não está em português.

**Ícones:** `extension/icons/icon-{16,32,48,128}.png`, gerados de `extension/icons/icon.svg` por `node app/assets/meet-captions/icon.mjs` (sem dependência; rode de novo se o SVG mudar).

## Justificativa de cada permissão

| Permissão | Onde | Para quê |
| --- | --- | --- |
| `storage` | as duas | Guardar o endereço do Aveia, o token de dispositivo, quais destinos estão marcados, o idioma preferido das legendas e a fila de falas que ainda não chegou ao Aveia. |
| `nativeMessaging` | as duas | Falar com o app Hive instalado no computador (host `dev.hive.captions`). Sem o app, a permissão não faz nada. |
| `https://meet.google.com/*` | as duas | Ler as legendas da chamada e desenhar o botão Gravar na página do Meet. |
| O endereço do Aveia configurado, com `/*` | as duas | Receber o token quando a pessoa clica em conectar no Aveia e enviar as falas para a API do Aveia. |
| `http://localhost/*`, `http://127.0.0.1/*` (opcional) | as duas | Só para quem desenvolve o Aveia: conectar a um Aveia rodando na própria máquina. É pedida na hora, pelo botão "Permitir localhost" do popup, e nunca na instalação. |
| `scripting` (opcional) | só Chrome | Pedida junto com localhost, para registrar o script de conexão nas páginas locais. No Firefox MV2 isso é feito por `contentScripts.register`, que não pede permissão. |

Não há `tabs`, `activeTab`, `webRequest`, `cookies` nem acesso a outros sites. Não há código remoto: todo o JavaScript vai dentro do pacote.

**Finalidade única (Chrome Web Store):** gravar reuniões do Google Meet a partir das legendas da chamada.

## O que é coletado

- **Coletado:** o texto das legendas da chamada e o nome de quem falou, mais o título da chamada no momento em que a gravação começa. Só enquanto a pessoa está gravando.
- **Para onde vai:** só para o Hive instalado no próprio computador (por native messaging, sem rede) e para o Aveia da própria empresa (o endereço do Aveia configurado, por HTTPS, autenticado com o token de dispositivo). Cada destino só recebe se estiver marcado.
- **Nunca coletado:** áudio, vídeo, tela, histórico de navegação, conteúdo de outros sites, senha.
- **Fora de gravação:** nada é enviado ao Aveia. O Hive local recebe um sinal de que há uma chamada aberta, sem texto, como já recebia.
- **No navegador:** o token de dispositivo fica em `storage.local` e nunca é escrito em log nem entregue à página do Meet. A fila de falas não enviadas fica em `storage.session` (memória; some ao fechar o navegador) com teto de 4000 falas.
- **Sem venda, sem anúncio, sem análise de uso, sem terceiros.**

Respostas para o formulário de privacidade da Chrome Web Store: coleta "Comunicações pessoais" e "Conteúdo do site" (o texto da reunião); não coleta as demais categorias; as três declarações de uso limitado valem. No Firefox o mesmo está declarado em `browser_specific_settings.gecko.data_collection_permissions` (`personalCommunications`, `websiteContent`); confira a lista de categorias vigente no dia do envio.

É preciso uma política de privacidade pública com o texto acima antes de enviar a qualquer loja.

## Diferenças entre Chrome e Firefox

| | Chrome (MV3) | Firefox (MV2) |
| --- | --- | --- |
| Botão na barra | `action` | `browser_action` |
| Fundo | `background.service_worker`, que carrega `aveia-origin.js` e `destinations.js` por `importScripts` | `background.scripts` com os três arquivos, `persistent: true` |
| Sites | `host_permissions` | dentro de `permissions` |
| Localhost opcional | `optional_host_permissions` + `optional_permissions: ["scripting"]` | `optional_permissions` com as origens (MV2 não tem `optional_host_permissions`) |
| Identidade | campo `key` (ID `llbhndkljiicpopegdfeaihjklielcph` na instalação manual) | `browser_specific_settings.gecko.id` = `meet-captions@hive.dev` |
| Mínimo | Chrome 102 (por `storage.session`) | Firefox 115 (por `storage.session`) |

## Empacotar

Os dois pacotes saem da mesma pasta, por um script sem dependência (usa o `zip` do sistema). Rode da raiz do repositório:

```bash
node app/assets/meet-captions/pack.mjs --out /tmp/aveia-pacotes
```

O endereço do Aveia vem, nesta ordem, de `--aveia https://…`, da variável `HIVE_AVEIA_URL` ou do `hive.defaults` da implantação que está no repositório. Sem endereço o script para com erro: pacote de loja sem Aveia não existe. A troca do marcador é a mesma função que a instalação manual usa (`writeExtension`, em `app/lib/meeting-captions.mjs`).

Sai, na pasta de `--out`:

- `aveia-chrome-<versão>.zip`, para a Chrome Web Store;
- `aveia-firefox-<versão>.zip`, para o Firefox Add-ons;
- `firefox-<versão>/`, a mesma extensão do Firefox descompactada, para `web-ext` e para carregar em `about:debugging`.

Antes de enviar, confira que o endereço entrou e que não sobrou marcador:

```bash
unzip -p /tmp/aveia-pacotes/aveia-chrome-*.zip manifest.json
for z in /tmp/aveia-pacotes/*.zip; do unzip -p "$z" | grep -c __AVEIA; done
npx -y web-ext lint -s /tmp/aveia-pacotes/firefox-*/
```

### Chrome Web Store

O campo `key` sai do pacote porque a loja recusa manifest com `key` e dá um ID próprio ao item. Esse ID novo é diferente do da instalação manual, então **depois da primeira publicação** inclua `chrome-extension://<ID da loja>/` no `allowed_origins` que `installCaptionBridge` escreve (`app/lib/meeting-captions.mjs`); sem isso a versão da loja não fala com o Hive. O `manifest.chrome.json` do repositório continua com `key` para a instalação manual manter o ID fixo.

Envie o zip do Chrome no painel do desenvolvedor, com a listagem, as justificativas e as respostas de privacidade acima. Capturas de tela: 1280x800 da chamada com o menu aberto.

### Firefox Add-ons

O `manifest.json` fica na raiz do zip. O ID `meet-captions@hive.dev` é o mesmo que o Hive já autoriza no host nativo, então a versão assinada fala com o Hive sem mudança. Não há minificação; a única transformação é a troca do marcador pelo endereço, então se a revisão pedir a fonte, é este repositório mais o comando acima.

### A cada versão

Suba `version` nos dois manifests juntos, rode `node --test app/tests/meet-extension.test.mjs app/tests/meeting-captions.test.mjs` e gere os pacotes de novo.

## Contrato com o Aveia

- `GET {baseUrl}/api/ext/me` com `Authorization: Bearer <token>` responde `{email, name}` ou 401.
- `POST {baseUrl}/api/ext/captions` com `{captions, inCall, lines:[{key, speaker, text, seenAt}], sentAt, command, title, tab, id}` responde `{recording, meetingId, startedAt, now, url}`.
- Sem rede, 5xx, 408 ou 429: o lote fica na fila e é reenviado com espera crescente (4 s até 60 s). O servidor grava por `key`, então reenviar é seguro.
- 401: o token é descartado, o destino aparece como desconectado e nada mais é enviado até a pessoa conectar de novo. As falas ditas nesse meio tempo ficam na fila.
- Outros 4xx: o lote é descartado para a fila não travar.
- Conexão: a página `{baseUrl}/conectar-extensao` faz `window.postMessage({type:"aveia-extension-token", token, email, baseUrl}, location.origin)`. A extensão só aceita se a mensagem veio da própria janela, da origem do Aveia, e se `baseUrl` é essa mesma origem. Responde `{type:"aveia-extension-connected"}`. Ao carregar em uma página do Aveia a extensão também avisa `{type:"aveia-extension-ready"}`, para a página saber que pode mandar o token.
