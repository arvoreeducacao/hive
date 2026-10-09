import { defineConfig } from 'astro/config'
import starlight from '@astrojs/starlight'

export default defineConfig({
  site: 'https://hive-docs-nine.vercel.app',
  integrations: [
    starlight({
      title: 'Hive',
      description:
        'Run a fleet of coding agents and watch all of them at once. Every session is a seat: a tile on a wall, with a real terminal behind it.',
      tagline: 'Run a fleet of coding agents and watch all of them at once.',
      social: [
        {
          icon: 'github',
          label: 'GitHub',
          href: 'https://github.com/arvoreeducacao/hive',
        },
      ],
      editLink: {
        baseUrl:
          'https://github.com/arvoreeducacao/hive/edit/main/site/',
      },
      lastUpdated: true,
      customCss: ['./src/styles/hive.css'],
      logo: { src: './src/assets/hive-mark.svg' },
      favicon: '/favicon.svg',
      components: { ThemeSelect: './src/components/ThemeSelect.astro' },
      sidebar: [
        {
          label: 'Start here',
          items: [
            { label: 'What Hive is', slug: 'start/what-hive-is' },
            { label: 'Install', slug: 'start/install' },
            { label: 'Your first seat', slug: 'start/first-seat' },
          ],
        },
        {
          label: 'Concepts',
          items: [
            { label: 'Seats', slug: 'concepts/seats' },
            { label: 'The three pieces', slug: 'concepts/three-pieces' },
            { label: 'Identity', slug: 'concepts/identity' },
            { label: 'Teams and peers', slug: 'concepts/teams' },
            { label: 'Agents and models', slug: 'concepts/agents' },
          ],
        },
        {
          label: 'Guides',
          items: [
            { label: 'Your hub', slug: 'guides/your-hub' },
            { label: 'Run your own server', slug: 'guides/run-your-own' },
            { label: 'Connect your phone', slug: 'guides/phone' },
            { label: 'Invite someone', slug: 'guides/invite' },
            { label: 'Meetings and Aveia', slug: 'guides/meetings' },
            { label: 'Hosting for a team', slug: 'guides/hosting-for-a-team' },
          ],
        },
        {
          label: 'Reference',
          items: [
            { label: 'HTTP API', slug: 'reference/http-api' },
            { label: 'The stream', slug: 'reference/stream' },
            { label: 'Settings', slug: 'reference/settings' },
            { label: 'Repository layout', slug: 'reference/layout' },
          ],
        },
        {
          label: 'Contributing',
          items: [
            { label: 'Working on Hive', slug: 'contributing/development' },
            { label: 'Security', slug: 'contributing/security' },
          ],
        },
      ],
    }),
  ],
})
