# The Hive documentation site

Astro + Starlight. This is the one part of the tree with a build step, which is
why it is fenced off here with its own dependencies.

```sh
npm install
npm run dev      # http://localhost:4321
npm run build    # static output in dist/
```

Pages are markdown under `src/content/docs/`. The sidebar is declared in
`astro.config.mjs` — a new page needs an entry there to appear in it.

## Deploying

Vercel, project `hive-docs`, public — no deployment
protection, so the pages are readable without a Vercel account. Live at
https://hive-docs-nine.vercel.app.

Everything else is in `vercel.json`: framework, build command, output directory.
The build is static, so there is no runtime and nothing to keep warm.

Deploys from this directory with `vercel deploy --prod`. If the project is later
connected to the repository instead, **Root Directory** has to be set to `site`.

When a real domain replaces the generated one, `site` in `astro.config.mjs` has
to change with it — that value is what the sitemap and canonical URLs are built
from.

## Where the content comes from

Most of it is written here. Two pages are ports and should not drift from their
originals without the original moving too:

| Page | Original |
| --- | --- |
| `guides/run-your-own.md` | `docs/run-your-own.md` |

`reference/http-api.md` and `reference/stream.md` **are** the declared source for
the protocol. The contract file they used to mirror is gone: one page, in one
language, is what a person reads before writing a client.
