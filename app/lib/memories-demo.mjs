const DAY = 86400000;

const SEEDS = [
  ["api", "gotchas", "automatica", "@bruno", 2, 23, 0.1, "Deploy da API só dispara por push na main",
    "O workflow de deploy não tem disparo manual; run em startup_failure não aceita re-run. Para subir de novo, um commit vazio na main.",
    "O workflow de deploy do api só roda em push na **main**. Não existe disparo manual.\n\nQuando um run termina em **startup_failure**, o botão de re-run não funciona. Para subir de novo, faça um commit vazio na main.\n\nPor quê: o workflow foi escrito sem `workflow_dispatch`, e o GitHub não reexecuta run que nem chegou a começar.",
    ["deploy", "github-actions"]],
  ["api", "gotchas", "automatica", "@carla", 5, 11, 1, "lint-staged não roda no arquivo renomeado",
    "Arquivo só renomeado entra no commit sem passar pelo lint; o CI pega depois. Rode o lint no arquivo antes de subir.",
    "O `lint-staged` olha só o conteúdo alterado. Um arquivo **apenas renomeado** entra no commit sem passar pelo lint.\n\n- O CI pega o erro depois, quando o PR já está aberto.\n- Rode o lint no arquivo antes de subir.",
    ["lint", "hooks"]],
  ["api", "domain", "manual", "@diego", 14, 8, 3, "Pedido cancelado continua com status pago",
    "O cancelamento grava em canceled_at e não muda o status; filtre pelos dois campos.",
    "Na Acme, cancelar um pedido **não** muda o `status`: o cancelamento só preenche `canceled_at`.\n\n1. Relatório que filtra só por `status = 'paid'` conta pedido cancelado.\n2. Filtre por `status` **e** por `canceled_at IS NULL`.",
    ["pedidos", "dados"]],
  ["api", "domain", "manual", "@eva", 21, 6, 2, "account_id é a empresa, não a pessoa",
    "Buscar users por account_id devolve o time inteiro sem dar erro; a pessoa vem de user_id.",
    "`account_id` aponta para a **empresa cliente**, não para a pessoa.\n\nBuscar `users` por `account_id` devolve o time inteiro, sem erro nenhum. Para uma pessoa, use `user_id`.",
    ["postgres", "dados"]],
  ["api", "gotchas", "automatica", "@bruno", 31, 2, 9, "Prisma startsWith não escapa curinga",
    "Um caminho com % no fim vira todos os descendentes; filho direto com eq perde os netos.",
    "O `startsWith` do Prisma não escapa `%` nem `_`.\n\nUm caminho que termina em `%` casa com todos os descendentes. Trocar por `eq` resolve o filho direto, mas perde os netos.",
    ["prisma"]],
  ["api", "incidents", "automatica", "@carla", 48, 0, null, "Upload grande estoura o limite do proxy",
    "O 413 vem do proxy antes de chegar na API; arquivo grande precisa de URL assinada direto no storage.",
    "Arquivo grande recebe **413** do proxy reverso antes de chegar na API.\n\nPara arquivo grande, gere uma URL assinada e mande direto para o storage de objetos.",
    ["upload", "proxy"]],
  ["api", "conventions", "manual", "@ana", 40, 4, 12, "Chave de API de terceiro mora no cofre",
    "Nunca no .env versionado nem em mensagem; a aplicação lê do cofre na subida.",
    "Chave de API de terceiro mora no **cofre de segredos** do time.\n\nNunca no `.env` versionado nem colada em mensagem. A aplicação lê do cofre quando sobe.",
    ["segredos"]],
  ["api", "gotchas", "automatica", "@eva", 54, 0, null, "orderBy dentro de with do Drizzle não ordena",
    "O json_arrayagg sai sem ORDER BY; pegar o primeiro filho exige ordenar em memória.",
    "O `orderBy` dentro de `with` no Drizzle vira um `json_arrayagg` sem `ORDER BY`.\n\nQuem pega `[0]` dos filhos recebe um qualquer. Ordene em memória ou faça uma consulta separada.",
    ["drizzle"]],
  ["web-app", "gotchas", "automatica", "@carla", 3, 14, 0.4, "Prettier e ESLint brigam pela mesma regra",
    "Formatar com o prettier direto desfaz o que o eslint --fix arrumou; rode só o script de lint do projeto.",
    "O CI roda o script `lint` do projeto. Formatar com `prettier --write` direto desfaz o que o `eslint --fix` arrumou e quebra o lint.",
    ["lint"]],
  ["web-app", "gotchas", "automatica", "@bruno", 6, 9, 1, "'use server' só exporta função async",
    "Uma const exportada num arquivo 'use server' derruba a página em tempo de execução e passa por toda a bateria.",
    "Arquivo com `'use server'` só pode exportar **função async**.\n\nUma `const` exportada passa no typecheck e nos testes e derruba a página quando ela abre.",
    ["nextjs"]],
  ["web-app", "domain", "manual", "@ana", 18, 5, 4, "Classe Tailwind inventada não avisa",
    "Token fora do tema não emite nada e passa por toda a bateria; confira no navegador.",
    "Uma classe Tailwind com token que não existe no tema simplesmente não gera CSS.\n\nNenhum teste pega. Confira a tela no navegador.",
    ["tailwind"]],
  ["web-app", "incidents", "automatica", "@diego", 26, 3, 6, "Dev server não hidrata com o assetPrefix de produção",
    "Com o assetPrefix apontando para o CDN, o dev server pede os assets lá fora; suba sem ele.",
    "Com o `assetPrefix` de produção ligado, o dev server pede os assets ao CDN e a página não hidrata.\n\nSuba o dev server sem a variável que liga o prefixo.",
    ["nextjs", "dev"]],
  ["web-app", "gotchas", "automatica", "@eva", 50, 0, null, "curl 200 não prova que a página abre",
    "O erro de metadata vem no stream com data-dgst; olhe a tela de verdade.",
    "Um `200` do curl não quer dizer que a página abriu: o erro de metadata chega no stream, marcado com `data-dgst`.",
    ["nextjs"]],
  ["web-app", "conventions", "manual", "@bruno", 63, 2, 20, "Next dev bloqueia HMR de 127.0.0.1",
    "Use localhost; pelo IP a página não hidrata e parece bug do componente.",
    "O `next dev` recusa o HMR quando a página abre por `127.0.0.1`.\n\nAbra por `localhost`.",
    ["nextjs", "dev"]],
  ["hive", "gotchas", "automatica", "@bruno", 1, 19, 0.2, "cwd reseta a cada comando no chat",
    "git e gh sem cd absoluto na mesma linha rodam na pasta raiz; já abriu PR no repo errado.",
    "Cada comando do chat começa na pasta raiz do workspace.\n\nRode `git` e `gh` com `cd` absoluto **na mesma linha**, ou o PR sai no repo errado.",
    ["shell"]],
  ["hive", "gotchas", "automatica", "@diego", 4, 7, 2, "grep pula arquivo de linha longa",
    "Bundle minificado some do grep por ter linhas enormes; busque com node.",
    "O `grep` trata arquivo com linha muito longa como binário e responde vazio.\n\nUse `grep -a` ou busque com `node -e` lendo o arquivo.",
    ["busca"]],
  ["hive", "domain", "manual", "@carla", 12, 5, 5, "delete pod tem período de carência",
    "Responde deleted na hora e o pod segue vivo até o fim da carência; espere o uid mudar.",
    "O `delete pod` responde na hora, mas o pod continua vivo até o fim do `terminationGracePeriodSeconds`.\n\nEspere o `uid` mudar antes de seguir.",
    ["k8s"]],
  ["hive", "incidents", "automatica", "@ana", 22, 1, 15, "Typecheck derruba o container por OOM",
    "O heap pedido pelo tsc passa do limite de memória do container e derruba todos os assentos.",
    "O `tsc` com `--max-old-space-size` alto pede mais memória do que o limite do container.\n\nQuando ele estoura, todos os assentos caem juntos.",
    ["memória"]],
  ["hive", "gotchas", "automatica", "@eva", 52, 0, null, "rollout restart não recicla pod sem dono",
    "Pod criado à mão não pertence a Deployment; o restart responde sucesso e não reinicia nada.",
    "O `rollout restart` só age em pods de um Deployment. Pod criado à mão fica igual, mesmo com a resposta de sucesso.\n\nPara ele, use `delete pod`.",
    ["k8s"]],
  ["hive", "conventions", "manual", "@bruno", 35, 3, 8, "Suíte num worktree pede npm ci em app e server",
    "Sem node_modules nos dois lugares os testes falham por falta de dependência.",
    "Num worktree novo, rode `npm ci` em `app/` **e** em `server/` antes da suíte.",
    ["testes"]],
  ["core", "domain", "manual", "@diego", 9, 6, 3, "Produto tem dois modelos no core",
    "Campo novo entra no modelo do catálogo e no do carrinho, ou some calado no teste.",
    "Existem dois modelos de produto: o do **catálogo** e o do **carrinho**.\n\nCampo novo entra **nos dois**.",
    ["modelos"]],
  ["core", "incidents", "automatica", "@carla", 16, 4, 2, "Deploy do core: o run mais lento vence",
    "Sem cancel-in-progress, o run que termina por último sobe a imagem velha.",
    "O workflow não cancela runs anteriores. O que termina por último vence, mesmo que seja a imagem velha.\n\nConfira a versão rodando depois do deploy e ligue `cancel-in-progress` no `concurrency`.",
    ["deploy"]],
  ["core", "conventions", "automatica", "@ana", 44, 1, 25, "Migração idempotente no core",
    "try/rescue na migração é decorativo; confira se o índice existe antes de criar.",
    "`try/rescue` dentro de migração não protege nada, e o MySQL não tem `create index if not exists`.\n\nConsulte o `information_schema` antes de criar o índice.",
    ["migração"]],
  ["data-etl", "gotchas", "automatica", "@eva", 8, 17, 0.3, "DATETIME não guarda fuso",
    "A coluna devolve a hora sem fuso e o driver supõe o fuso da máquina; grave e leia sempre em UTC.",
    "Uma coluna `DATETIME` não guarda fuso. O driver supõe o fuso da máquina que lê, e a hora muda de servidor para servidor.\n\nGrave e leia sempre em **UTC** e converta só na tela.",
    ["mysql", "fuso"]],
  ["data-etl", "domain", "manual", "@bruno", 28, 3, 7, "Horário do agendador do ETL é UTC",
    "O 22:00 da config roda às 19h em São Paulo; quem lê a config pensa no horário local.",
    "Os horários do agendador do ETL estão em **UTC**. O `22:00` da config é 19h em São Paulo.",
    ["agendador"]],
  ["data-etl", "gotchas", "automatica", "@diego", 57, 0, null, "ReplacingMergeTree só deduplica no merge",
    "Antes do merge a linha repetida aparece; consulta que precisa do valor final usa FINAL.",
    "O `ReplacingMergeTree` só remove a linha duplicada quando o merge roda em segundo plano.\n\nAté lá a consulta vê as duas. Quem precisa do valor final usa `FINAL`.",
    ["clickhouse"]],
  ["hub", "conventions", "manual", "@carla", 11, 4, 2, "Credencial de MCP mora no .env do hub",
    "Trocar token não pede restart: o gateway relê o arquivo e o /health diz o que falta.",
    "A credencial de cada MCP mora no `.env` do hub.\n\nO gateway relê o arquivo quando ele muda, e o `/health` lista o que falta.",
    ["mcp"]],
  ["hub", "domain", "automatica", "@ana", 38, 2, 10, "Canal de projeto não recebe anúncio de página",
    "Anúncio de página vai só no canal de revisão do time.",
    "Página publicada se anuncia só no `#revisao`, nunca no canal do projeto.",
    ["slack"]],
  [null, "decisions", "manual", "@bruno", 2, 9, 0.5, "Toda tela nova é responsiva e WCAG AA",
    "Vale para qualquer produto; o review de design segura o PR que não passa.",
    "Toda tela nova é **responsiva** e passa no **WCAG AA**.\n\nO review de design segura o PR que não cumpre.",
    ["design"]],
  [null, "decisions", "manual", "@diego", 19, 5, 4, "Decisão sobre schema sempre volta para a pessoa",
    "Schema, permissão, dado de produção e deploy não seguem por prazo vencido.",
    "Quatro decisões nunca seguem sozinhas quando o prazo vence:\n\n1. schema\n2. permissão\n3. dado de produção\n4. deploy",
    ["processo"]],
  [null, "conventions", "automatica", "@eva", 33, 2, 11, "Print de tela nunca leva dado de cliente",
    "Trate o print antes de publicar; repo privado não protege dado sensível.",
    "Repo privado não protege dado sensível. Nome de cliente, token e dump nunca entram em página publicada.",
    ["segurança"]],
  [null, "conventions", "manual", "@diego", 80, 12, 4, "Migração vai no repo de migrações",
    "As migrações dentro do core pararam; DDL nova entra no repo db-migrations.",
    "DDL nova se escreve no repo `db-migrations`.\n\nA pasta de migrações dentro do core está congelada.",
    ["migração"]],
  ["hub", "decisions", "manual", "@eva", 76, 7, 6, "Página publicada se anuncia no #revisao",
    "Uma mensagem por página, com print; canal de projeto não recebe anúncio.",
    "Toda página publicada se anuncia no `#revisao`, uma mensagem por página, com print dentro.",
    ["slack"]],
  [null, "gotchas", "automatica", "@ana", 56, 0, null, "Escopo do token do Slack decide o caminho do anúncio",
    "Sem files:write o anúncio cai no caminho que destrói a formatação.",
    "Sem o escopo `files:write`, o anúncio com imagem cai no caminho que perde a formatação da mensagem.",
    ["slack"]]
];

const ARCHIVED = [
  ["web-app", "gotchas", "automatica", "@carla", 64, 1, "Miniatura de vídeo precisa ser retrato",
    "O card é 2:3; quadro 16:9 corta o rosto de quem aparece.", "unused"],
  ["core", "conventions", "automatica", "@bruno", 66, 5, "Busca do catálogo é por título",
    "Procurar pelo nome do fornecedor não acha nada.", "unused"],
  ["api", "gotchas", "automatica", "@eva", 70, 9, "API de CEP não lista cidade por estado",
    "A lista de municípios vem de outra fonte pública.", "unused"],
  [null, "decisions", "manual", "@diego", 90, 14, "Mockup avulso em arquivo solto",
    "Substituída: tela agora se desenha no canvas compartilhado do produto.", "superseded"]
];

const UNANSWERED = [
  ["como rodar o data-etl local com o banco de staging", 14, 26],
  ["onde fica o token do rastreador de erros do mobile", 9, 74],
  ["por que o build do web-app demora", 7, 50],
  ["como liberar feature flag só para um cliente", 6, 3],
  ["qual fila processa a conversão de vídeo", 5, 122]
];

const isoWeek = (at) => {
  const day = new Date(at);
  const utc = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate()));
  const weekday = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - weekday);
  const yearStart = Date.UTC(utc.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((utc.getTime() - yearStart) / DAY + 1) / 7);
  return `${utc.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
};

export function demoMemories(now = Date.now()) {
  const active = SEEDS.map(([repo, category, origin, author, ago, used, lastAgo, title, snippet, content, tags], at) => ({
    id: `demo-${String(at + 1).padStart(3, "0")}`,
    title, category, repo, origin, author,
    date: new Date(now - ago * DAY).toISOString(),
    updated: new Date(now - Math.max(0, ago - 1) * DAY).toISOString(),
    status: "active", snippet, tags,
    retrieved_count: used,
    last_retrieved_at: lastAgo === null ? null : new Date(now - lastAgo * DAY).toISOString(),
    archived_reason: null,
    content: `# ${title}\n\n${content}`
  }));
  const archived = ARCHIVED.map(([repo, category, origin, author, ago, gone, title, snippet, reason], at) => ({
    id: `demo-a${String(at + 1).padStart(2, "0")}`,
    title, category, repo, origin, author,
    date: new Date(now - ago * DAY).toISOString(),
    updated: new Date(now - gone * DAY).toISOString(),
    status: "archived", snippet, tags: [],
    retrieved_count: 0, last_retrieved_at: null,
    archived_reason: reason,
    content: `# ${title}\n\n${snippet}`
  }));
  return [...active, ...archived];
}

export function demoStats(now = Date.now(), weeks = 12) {
  const all = demoMemories(now);
  const active = all.filter((one) => one.status === "active");
  const weekly = [];
  for (let back = weeks - 1; back >= 0; back--) {
    const week = isoWeek(now - back * 7 * DAY);
    const inWeek = all.filter((one) => isoWeek(Date.parse(one.date)) === week);
    weekly.push({
      week,
      automatica: inWeek.filter((one) => one.origin === "automatica").length,
      manual: inWeek.filter((one) => one.origin === "manual").length
    });
  }
  const repos = new Map();
  for (const one of active) repos.set(one.repo, (repos.get(one.repo) || 0) + 1);
  const daily = [];
  for (let back = 29; back >= 0; back--) {
    daily.push({ date: new Date(now - back * DAY).toISOString().slice(0, 10), searches: 260 + ((back * 37) % 90), bridge_created: (back * 7) % 4, bridge_discarded: (back * 5) % 6 });
  }
  return {
    totals: {
      active: active.length,
      archived: all.length - active.length,
      automatica: active.filter((one) => one.origin === "automatica").length,
      manual: active.filter((one) => one.origin === "manual").length
    },
    weekly,
    by_repo: [...repos].map(([repo, count]) => ({ repo, count })).sort((a, b) => b.count - a.count),
    top_retrieved: [...active].sort((a, b) => b.retrieved_count - a.retrieved_count).slice(0, 5)
      .map(({ id, title, repo, retrieved_count }) => ({ id, title, repo, retrieved_count })),
    archived_unused: all.filter((one) => one.archived_reason === "unused")
      .map(({ id, title, updated }) => ({ id, title, archived_at: updated })),
    judge: {
      searches: 8420, candidates_judged: 9120, cut_by_judge: 7387, duplicates_blocked: 31, bridge_created: 44, bridge_updated: 26, bridge_discarded: 111,
      health: { calls: 8420, fallbacks: 34, avg_ms: 480 }
    },
    spend: { month_usd: 6.4, cap_usd: 20, requests: 4310, input_tokens: 9120000, updated_at: new Date(now - 42 * 60000).toISOString() },
    unanswered: {
      total: 146,
      top: UNANSWERED.map(([topic, count, hoursAgo]) => ({ topic, count, last_at: new Date(now - hoursAgo * 3600000).toISOString() }))
    },
    daily
  };
}

export { isoWeek };
