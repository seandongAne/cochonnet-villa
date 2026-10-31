// Review artifacts stay outside public/ and src/pages/. They are available
// with `npm run dev`, but never injected into build or preview.
export default function localReviewPages() {
  return {
    name: 'local-review-pages',
    hooks: {
      'astro:config:setup': ({ command, injectRoute }) => {
        if (command !== 'dev') return;
        injectRoute({ pattern: '/little-universe/sprout-pig/', entrypoint: new URL('../src/review/sprout-pig.astro', import.meta.url) });
        injectRoute({ pattern: '/birthday-characters/sprout-pig-study-v1.glb', entrypoint: new URL('../src/review/sprout-pig.glb.js', import.meta.url) });
      },
    },
  };
}
