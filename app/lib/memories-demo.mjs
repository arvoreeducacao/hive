const DAY = 86400000;

const SEEDS = [
  ["api", "gotchas", "automatica", "@rafa-a", 2, 23, 0.1, "Deploy da API só dispara por push na main",
    "O workflow de deploy não tem disparo manual; run em startup_failure não aceita re-run. Para subir de novo, um commit vazio na main.",
    "O workflow de deploy do api só roda em push na **main**. Não existe disparo manual.\n\nQuando um run termina em **startup_failure**, o botão de re-run não funciona. Para subir de novo, faça um commit vazio na main.\n\nPor quê: o workflow foi escrito sem `workflow_dispatch`, e o GitHub não reexecuta run que nem chegou a começar.",
    ["deploy", "github-actions"]],
  ["api", "gotchas", "automatica", "@gui-m", 5, 11, 1, "Pre-commit barra comentário em qualquer arquivo de src/",
    "O grep do hook roda no src/ inteiro, então comentário alheio trava o seu commit. Rode o lint no seu arquivo e use --no-verify.",
    "O hook de pre-commit procura comentário com `grep` no `src/` inteiro, não só nos arquivos do commit.\n\n- Um comentário esquecido por outra pessoa trava o seu commit.\n- Rode o lint no seu arquivo e, se ele passar, use `--no-verify`.",
    ["lint", "hooks"]],
  ["api", "domain", "manual", "@joao-b", 14, 8, 3, "Staging é atualizado por CronJob, não por deploy",
    "Tag None vem da paginação do ECR; o ExternalSecret fica defasado e se corrige com patch, nunca com apply.",
    "O staging do api não recebe deploy: um **CronJob** troca a imagem.\n\n1. A tag `None` vem da paginação do ECR.\n2. O ExternalSecret fica defasado e se corrige com `patch`, nunca com `apply`.",
    ["staging", "k8s"]],
  ["api", "domain", "manual", "@vitor-s", 21, 6, 2, "reader_id é perfil, não usuário",
    "Consultar users com reader_id devolve pessoas erradas sem dar erro; o perfil liga no usuário por profiles.user_id.",
    "`reader_id` aponta para **profiles**, não para **users**.\n\nConsultar `users` com um `reader_id` devolve outra pessoa, sem erro nenhum. O caminho certo é `profiles.user_id`.",
    ["mysql", "dados"]],
  ["api", "gotchas", "automatica", "@rafa-a", 31, 2, 9, "Prisma startsWith não escapa curinga",
    "Um caminho com % no fim vira todos os descendentes; filho direto com eq perde os netos.",
    "O `startsWith` do Prisma não escapa `%` nem `_`.\n\nUm caminho que termina em `%` casa com todos os descendentes. Trocar por `eq` resolve o filho direto, mas perde os netos.",
    ["prisma"]],
  ["api", "incidents", "automatica", "@gui-m", 48, 0, null, "Upload pela API para em 100 MB no Cloudflare",
    "O 413 vem antes do ALB; arquivo grande precisa de URL assinada direto no S3.",
    "Arquivo acima de **100 MB** recebe 413 do Cloudflare antes de chegar no ALB.\n\nPara arquivo grande, gere uma URL assinada e mande direto para o S3.",
    ["upload", "cloudflare"]],
  ["api", "conventions", "manual", "@ana-l", 40, 4, 12, "Chave da API externa mora no Secrets Manager",
    "A chave fica no segredo api-prod; compartilhe pelo cofre, nunca por mensagem.",
    "A chave da API externa fica no Secrets Manager, no segredo `api-prod`.\n\nCompartilhe pelo cofre, nunca colando em mensagem.",
    ["segredos"]],
  ["api", "gotchas", "automatica", "@vitor-s", 54, 0, null, "orderBy dentro de with do Drizzle não ordena",
    "O json_arrayagg sai sem ORDER BY; pegar o primeiro filho exige ordenar em memória.",
    "O `orderBy` dentro de `with` no Drizzle vira um `json_arrayagg` sem `ORDER BY`.\n\nQuem pega `[0]` dos filhos recebe um qualquer. Ordene em memória ou faça uma consulta separada.",
    ["drizzle"]],
  ["web-app", "gotchas", "automatica", "@gui-m", 3, 14, 0.4, "Lint do frontend é ultracite, não biome",
    "biome --write quebra o lint do CI; formate com ultracite.",
    "O CI roda **ultracite**. Formatar com `biome --write` direto muda o formato e quebra o lint.",
    ["lint"]],
  ["web-app", "gotchas", "automatica", "@rafa-a", 6, 9, 1, "'use server' só exporta função async",
    "Uma const exportada num arquivo 'use server' derruba a página em tempo de execução e passa por toda a bateria.",
    "Arquivo com `'use server'` só pode exportar **função async**.\n\nUma `const` exportada passa no typecheck e nos testes e derruba a página quando ela abre.",
    ["nextjs"]],
  ["web-app", "domain", "manual", "@ana-l", 18, 5, 4, "Classe Tailwind inventada não avisa",
    "Token fora do tema não emite nada e passa por toda a bateria; confira no navegador.",
    "Uma classe Tailwind com token que não existe no tema simplesmente não gera CSS.\n\nNenhum teste pega. Confira a tela no navegador.",
    ["tailwind"]],
  ["web-app", "incidents", "automatica", "@joao-b", 26, 3, 6, "Dev server não hidrata com o env de produção",
    "NEXT_PUBLIC_APP_ENV de produção manda os assets para o CDN; suba com ela vazia.",
    "Com `NEXT_PUBLIC_APP_ENV` de produção, o dev server pede os assets ao CDN e a página não hidrata.\n\nSuba com a variável vazia.",
    ["nextjs", "dev"]],
  ["web-app", "gotchas", "automatica", "@vitor-s", 50, 0, null, "curl 200 não prova que a página abre",
    "O erro de metadata vem no stream com data-dgst; olhe a tela de verdade.",
    "Um `200` do curl não quer dizer que a página abriu: o erro de metadata chega no stream, marcado com `data-dgst`.",
    ["nextjs"]],
  ["web-app", "conventions", "manual", "@rafa-a", 63, 2, 20, "Next dev bloqueia HMR de 127.0.0.1",
    "Use localhost; pelo IP a página não hidrata e parece bug do componente.",
    "O `next dev` recusa o HMR quando a página abre por `127.0.0.1`.\n\nAbra por `localhost`.",
    ["nextjs", "dev"]],
  ["dev-workspaces", "gotchas", "automatica", "@rafa-a", 1, 19, 0.2, "cwd reseta a cada comando no chat",
    "git e gh sem cd absoluto na mesma linha rodam no hub; já abriu PR no repo errado.",
    "Cada comando do chat começa no diretório do hub.\n\nRode `git` e `gh` com `cd` absoluto **na mesma linha**, ou o PR sai no repo errado.",
    ["shell"]],
  ["dev-workspaces", "gotchas", "automatica", "@joao-b", 4, 7, 2, "grep pula arquivo de linha longa",
    "O server.mjs some do grep por ter linhas enormes; busque com node.",
    "O `grep` trata arquivo com linha muito longa como binário e responde vazio.\n\nBusque com `node -e` lendo o arquivo.",
    ["busca"]],
  ["dev-workspaces", "domain", "manual", "@gui-m", 12, 5, 5, "delete pod tem 120s de carência",
    "Responde deleted na hora e o pod segue vivo por 2 minutos; espere o uid mudar.",
    "O `delete pod` responde na hora, mas o pod continua vivo e pronto por dois minutos.\n\nEspere o `uid` mudar antes de seguir.",
    ["k8s"]],
  ["dev-workspaces", "incidents", "automatica", "@ana-l", 22, 1, 15, "Typecheck derruba o pod por OOM",
    "Heap de 12 GB do tsc contra cgroup de 8 Gi derruba todos os assentos.",
    "O `tsc` pede 12 GB de heap e o container tem 8 Gi.\n\nQuando ele estoura, todos os assentos caem juntos.",
    ["memória"]],
  ["dev-workspaces", "gotchas", "automatica", "@vitor-s", 52, 0, null, "rollout restart é no-op nos pods do hive",
    "Responde sucesso e não reinicia nada; só delete pod recicla.",
    "O `rollout restart` responde sucesso e nada reinicia.\n\nSó `delete pod` recicla o pod.",
    ["k8s"]],
  ["dev-workspaces", "conventions", "manual", "@rafa-a", 35, 3, 8, "Suíte num worktree pede npm ci em app e server",
    "Sem node_modules nos dois lugares os testes falham por falta de ws.",
    "Num worktree novo, rode `npm ci` em `app/` **e** em `server/` antes da suíte.",
    ["testes"]],
  ["core", "domain", "manual", "@joao-b", 9, 6, 3, "Dois schemas de livro no core",
    "Campo novo entra em Catalog.Book e em BookCollection.Book, ou some calado no teste.",
    "Existem dois schemas de livro: `Catalog.Book` e `BookCollection.Book`.\n\nCampo novo entra **nos dois**.",
    ["ecto"]],
  ["core", "incidents", "automatica", "@gui-m", 16, 4, 2, "Deploy do core: o run mais lento vence",
    "Sem cancel-in-progress, o run que termina por último sobe a imagem velha.",
    "O workflow não cancela runs anteriores. O que termina por último vence, mesmo que seja a imagem velha.\n\nConfira `core` e `core-jobs` depois do deploy.",
    ["deploy"]],
  ["core", "conventions", "automatica", "@ana-l", 44, 1, 25, "Migração idempotente no core",
    "try/rescue na migração é decorativo; use Infra.EctoSupport.",
    "`try/rescue` dentro de migração não protege nada, e o MySQL não tem `create index if not exists`.\n\nUse `Infra.EctoSupport`.",
    ["migração"]],
  ["data-etl", "gotchas", "automatica", "@vitor-s", 8, 17, 0.3, "MCP do MySQL mostra a hora 3h adiantada",
    "DATETIME sai com Z mas 3h à frente do UTC; BRT é a hora mostrada menos 6h.",
    "O MCP do MySQL devolve `DATETIME` com `Z`, mas três horas à frente do UTC.\n\nPara BRT, subtraia seis horas da hora mostrada.",
    ["mysql", "fuso"]],
  ["data-etl", "domain", "manual", "@rafa-a", 28, 3, 7, "Horário do ETL gold é UTC, não BRT",
    "A última rodada do dia é 19h BRT; o 22:00 da config é UTC.",
    "Os horários do ETL gold estão em **UTC**. O `22:00` da config é 19h em Brasília.",
    ["clickhouse"]],
  ["data-etl", "gotchas", "automatica", "@joao-b", 57, 0, null, "Silver não aceita linha reinserida",
    "delete.sql com FINAL na bronze apaga o que o MySQL reinseriu.",
    "O `delete.sql` com `FINAL` na bronze apaga, a cada rodada, a linha que o MySQL reinseriu com o mesmo id.",
    ["clickhouse"]],
  ["hub", "conventions", "manual", "@gui-m", 11, 4, 2, "Credencial de MCP mora no .env do hub",
    "Trocar token não é delete pod: o gateway relê o arquivo e o /health diz o que falta.",
    "A credencial de cada MCP mora no `.env` do hub.\n\nO gateway relê o arquivo quando ele muda, e o `/health` lista o que falta.",
    ["mcp"]],
  ["hub", "domain", "automatica", "@ana-l", 38, 2, 10, "Canal de projeto não recebe artifact",
    "Anúncio de página vai só no #eng-artifacts.",
    "Página publicada se anuncia só no `#eng-artifacts`, nunca no canal do projeto.",
    ["slack"]],
  [null, "decisions", "manual", "@rafa-a", 2, 9, 0.5, "Toda tela nova é responsiva e WCAG AA",
    "Vale para qualquer produto; o review de design segura o PR que não passa.",
    "Toda tela nova é **responsiva** e passa no **WCAG AA**.\n\nO review de design segura o PR que não cumpre.",
    ["design"]],
  [null, "decisions", "manual", "@joao-b", 19, 5, 4, "Decisão sobre schema sempre volta para a pessoa",
    "Schema, permissão, dado de produção e deploy não seguem por prazo vencido.",
    "Quatro decisões nunca seguem sozinhas quando o prazo vence:\n\n1. schema\n2. permissão\n3. dado de produção\n4. deploy",
    ["processo"]],
  [null, "conventions", "automatica", "@vitor-s", 33, 2, 11, "Print de tela nunca leva dado de aluno",
    "Trate o print antes de publicar; repo privado não protege dado sensível.",
    "Repo privado não protege dado sensível. Nome de aluno, token e dump nunca entram em página publicada.",
    ["segurança"]],
  [null, "conventions", "manual", "@joao-b", 80, 12, 4, "Migração vai no repo migrations",
    "O priv/repo/migrations do core parou em junho; DDL nova é Knex no repo migrations.",
    "DDL nova se escreve em **Knex**, no repo `migrations`.\n\nO `priv/repo/migrations` do core parou em junho.",
    ["migração"]],
  ["hub", "decisions", "manual", "@vitor-s", 76, 7, 6, "Artifact se anuncia no #eng-artifacts",
    "ID C0BSJQCKCDN; canal de projeto não recebe anúncio de página.",
    "Todo artifact publicado se anuncia no `#eng-artifacts`, uma mensagem por página, com print dentro.",
    ["slack"]],
  [null, "gotchas", "automatica", "@ana-l", 56, 0, null, "Escopo do token do Slack decide o caminho do anúncio",
    "Sem files:write o anúncio cai no caminho que destrói a formatação.",
    "Sem o escopo `files:write`, o anúncio com imagem cai no caminho que perde a formatação da mensagem.",
    ["slack"]]
];

const ARCHIVED = [
  ["web-app", "gotchas", "automatica", "@gui-m", 64, 1, "Capa de vídeo precisa ser retrato",
    "O card é 2:3; quadro 16:9 corta o rosto de quem aparece.", "unused"],
  ["core", "conventions", "automatica", "@rafa-a", 66, 5, "Busca de podcast é por programa",
    "Procurar o nome do convidado não acha nada.", "unused"],
  ["api", "gotchas", "automatica", "@vitor-s", 70, 9, "ViaCEP não lista cidade por estado",
    "A lista de municípios vem da BrasilAPI.", "unused"],
  [null, "decisions", "manual", "@joao-b", 90, 14, "Mockup avulso em canvas próprio",
    "Substituída: tela agora se desenha no Screenbook.", "superseded"]
];

const UNANSWERED = [
  ["como rodar o data-etl local com o clickhouse de staging", 14, 26],
  ["onde fica o token do sentry para o mobile", 9, 74],
  ["por que o build do criar-printer demora", 7, 50],
  ["como liberar feature flag só para uma escola", 6, 3],
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
