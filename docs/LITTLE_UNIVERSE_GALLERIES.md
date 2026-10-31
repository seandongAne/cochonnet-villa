# Little Universe galleries

The Little Universe entrance is the courtyard telescope on `/villa-map/`.
It opens `/little-universe/`; the return link arrives beside the telescope.

## Movie Night

`movie-night.js` owns the room, poster placements and projection consoles.
`poster-hologram.js` builds the floating artwork, cyan rim, scan lines, slow
light sweep and emitter beam without browser globals or post-processing.
`MovieNight.jsx` owns texture loading and the accessible collection dialog.

Keep the eight selected films, their local artwork and aspect ratios intact.
Notting Hill stays central with the `Cabbage’s favorite` dedication. Hologram
animation stops under reduced motion and pauses while the viewer is open.
Projection geometry/materials own their disposal; the React texture loader
retains ownership of the artwork texture.

## One More Episode

`one-more-episode.js` owns the sage-panelled room, muted blue sofa and portrait
poster frames. `OneMoreEpisode.jsx` uses the shared poster loader and dialog.
The eight series retain their selections; promotional posters replace the
landscape title cards without claiming which season was watched.
`public/little-universe/one-more-episode/sources.json` records provenance.

## Sean's Hangar

`sean-exhibits.js` defines five original works: Luftwaffe Tornado, German
Eurofighter Typhoon, Azure Eagle, Beauty Hunter and 四脚小可爱. Each carries
`Created by Sean` in the room and detail view. Two entrance-wall shelves leave
the central entrance and existing side aisles accessible. The original nine
Hangar exhibits remain in place.

The five embedded runtime GLBs total 5,414,148 bytes, with meshopt compression
and WebP textures, without geometry simplification. Their source hashes and
attribution live in `public/little-universe/models/sources.json`. Rebuild one
derivative with:

```sh
node scripts/import-birthday-models.mjs <source-directory> <sean-model-id>
```

## Validation

Run `npm test`, `npm run build` and `git diff --check`. Inspect all three rooms
in the production preview: click artwork/models, switch selections, rotate a
model, and verify Escape returns to the room before exiting it. Check local
poster/image loading, shelf attribution and the cinema projection materials.
Node tests cover artwork provenance, model hashes/decoding, fitted bounds,
walkable aisles, poster aspect ratios and hologram motion/resource ownership.
