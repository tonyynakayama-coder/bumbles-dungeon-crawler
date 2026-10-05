# Game art

Entity and environment tiles in `dist/oga/` come from [Dungeon Crawl 32x32 tiles](https://opengameart.org/content/dungeon-crawl-32x32-tiles), maintained by Chris Hamons and submitted to OpenGameArt by MedicineStorm. The collection is [CC0](https://creativecommons.org/publicdomain/zero/1.0/). Credit is not required; the game links to the source as a courtesy.

The selected original 32×32 PNG tiles are used for the hero, red jelly, cave bat, iron imp, royal jelly, sun demon, ancient lich, healing potion, stairs, stone floors, and brick walls. `tools/generate-sprites.js` builds four animation rows (idle, walk, attack, hurt) from the entity tiles. The generated sheets are in `dist/sprites/`.
