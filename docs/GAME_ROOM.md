# Player Two

Added on 2026-10-31 at the author's request: a game cabin with Switch, PS5 and Xbox.

- Eighth destination in `/little-universe/`, with a controller roof sign, an opening door and an enclosed walkable interior.
- Three independently recognizable procedural consoles, named cabinet positions, a large television, a side sofa, two controllers and a coffee table. Console models are procedural; the selected game covers are local WebP assets.
- Xbox uses a black Series X-style silhouette as an artistic default, not a claim about the author's exact hardware. The game collection now includes the original 17 requested games.
- DOM buttons select the console, expose `aria-pressed`, and update the television and cabinet light. Selection lasts for the mounted page session. These are display controls, not playable games or console emulation.
- Standard WASD, arrow keys, drag look and touch movement controls apply. Escape leaves the cabin, then returns to the planet. The table, sofa and cabinet have collision; the right aisle reaches all consoles.
- Geometry and layout: `src/little-universe/game-room.js`. Browser signs: `GameRoom.jsx`. Entry and selection: `content.js`, `rooms.js`, `planet.js`, `LittleUniverse.jsx`, `UniverseScene.jsx`, `RoomInterior.jsx`.
- The sky-planet gateway picks up the destination automatically. Simple exterior cuboids and low-segment controller shapes retain the existing 85-draw / 115,000-triangle budget.

Validation: full Node suite, production build, desktop and 390 x 844 mobile browser entry, console selection and Escape exit checks; no horizontal overflow. Browser console had no errors (an existing THREE.Clock deprecation warning remains). The room-specific tests verify console separation, supported placement, table collision and a complete walk from the entrance to the console cabinet and back.


## Requested game collection

The first cabin implementation omitted the author's game list. The collection is now rendered, in the original request order, from `src/little-universe/games.js`:

1. Resident Evil 2
2. Resident Evil 4
3. Resident Evil Requiem (the ninth main entry)
4. ASTRO BOT
5. Assassin's Creed Odyssey
6. Assassin's Creed Unity (Paris)
7. Dead Cells
8. Balatro
9. The Legend of Zelda: Breath of the Wild
10. The Legend of Zelda: Tears of the Kingdom
11. Overcooked!
12. Don't Starve
13. Split Fiction (双影奇境; the request used 双赢奇境)
14. Baldur's Gate 3
15. War Thunder
16. Escape from Tarkov
17. Escape from Duckov

The two Zelda titles and Baldur's Gate 3 interpret the author's shorthand. Overcooked and Don't Starve retain their original titles rather than silently choosing sequels or bundles. All entries remain visible regardless of the selected console; console selection does not assert game compatibility.

Seventeen framed covers replace anonymous shelf spines: eight above the sofa, nine on the opposite wall. Each cover opens the game browser; the browser is also available through a visible `浏览 17 款游戏` button outside and inside the cabin. It supports direct selection, previous/next buttons, arrow keys, Escape, native modal focus handling, and paused room input. `展示在电视上` updates the selected TV artwork and returns to the cabin. This is a personal collection display, not game execution.

Promotional artwork comes from official Steam storefront metadata, PlayStation and Nintendo product pages. `public/little-universe/game-room/sources.json` records exact page/image URLs and image dimensions. Rights remain with the respective owners. Covers use `object-fit: contain` in the dialog and `fitPoster` on the walls/TV; the square ASTRO BOT cover and landscape artwork are not distorted. The 17 WebPs together stay below 2 MB.

Collection validation adds exact request-order coverage, title mapping, local assets/provenance, aspect ratios, frame spacing and sofa clearance to the existing room tests. Browser verification covers all 17 loaded thumbnails, game selection, TV switching, direct wall interaction, and desktop/mobile layouts.
