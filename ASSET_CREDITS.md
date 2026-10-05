# Game art

The dungeon floor and wall tiles use Buch's [Dungeon tileset](https://opengameart.org/content/dungeon-tileset), licensed [CC0](https://creativecommons.org/publicdomain/zero/1.0/). The game draws selected regions from the original `dist/environment/buch-dungeon.png` atlas.

Wall torches use Hyptosis's [Lots of free 2d tiles and sprites](https://opengameart.org/content/lots-of-free-2d-tiles-and-sprites-by-hyptosis), submitted by Zabin, licensed [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/). The game draws a torch region from `dist/environment/hyptosis-batch-1.png`. Credit: Hyptosis and Zabin. We do not use Zabin's bomb animation frames.

Wall crystals use [Kyrise's Free 16x16 RPG Icon Pack](https://opengameart.org/content/kyrises-free-16x16-rpg-icon-pack), licensed [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Credit: Kyrise, https://kyrise.itch.io/. `dist/environment/kyrise-crystal.png` is the original `crystal_01a.png` file from version 1.2 of the pack.

The collectible armor helmet in `dist/loot/helmet.png` is the original `helmet_01a.png` from the same Kyrise pack, under the same CC BY 4.0 license.

Animated enemy sheets in `dist/monsters/` come from the user-supplied `Monster pack with multiple color.rar`. Weapon and treasure-crate art in `dist/loot/` come from the user-supplied `Dungeon Crawler tileset pack v1.5.rar`. No readme or license text was included in either archive; no license claim is made here.

The hero, monsters, healing potion, and stairs in `dist/oga/` and their generated animated sheets in `dist/sprites/` come from [Dungeon Crawl 32x32 tiles](https://opengameart.org/content/dungeon-crawl-32x32-tiles), maintained by Chris Hamons and submitted to OpenGameArt by MedicineStorm, licensed [CC0](https://creativecommons.org/publicdomain/zero/1.0/). `tools/generate-sprites.js` builds idle, walk, attack, and hurt animation rows from those source tiles.

The asset selections are credited to players on `dist/credits.html`.
