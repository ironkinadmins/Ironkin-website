// Bingo tile -> OSRS item ID lookup for the RuneLite plugin API.
// Board remains the source of truth: GET /bingos/:bingoId reads the current board,
// then this file translates each tile name into hardcoded OSRS item IDs.
// Item IDs were generated from RuneLite's ItemID constants.

const MANUAL_TILE_PATTERNS = [
  /\b13m\b/i,
  /\bxp\b/i,
  /\bexperience\b/i
];

const TILE_ITEM_IDS = {
  "zamorakian spear": [
    11824
  ],
  "crystal tool seed": [
    23953
  ],
  "big harpoonfish": [
    25559
  ],
  "berserker ring": [
    6737
  ],
  "broken dragon hook": [
    31961
  ],
  "skull of vet'ion": [
    27673
  ],
  "skull of vetion": [
    27673
  ],
  "aranea boots": [
    29806
  ],
  "treasonous ring": [
    12605
  ],
  "tome of earth": [
    30064
  ],
  "bryophyta's essence": [
    22372
  ],
  "bryophytas essence": [
    22372
  ],
  "claws of callisto": [
    27667
  ],
  "ring of the gods": [
    12601
  ],
  "abyssal bludgeon piece": [
    13274,
    13275,
    13276
  ],
  "blue moon spear": [
    28988
  ],
  "hueycoatl hide": [
    30085
  ],
  "tome of fire": [
    20714
  ],
  "tyrannical ring": [
    12603
  ],
  "dragon hunter wand": [
    30070
  ],
  "abyssal dagger": [
    13265
  ],
  "belle's folly": [
    31248
  ],
  "belles folly": [
    31248
  ],
  "zenyte shard": [
    19529
  ],
  "abyssal dye": [
    26807,
    26809,
    26811
  ],
  "jar of tears": [],
  "tome of water": [
    25574
  ],
  "dual macuahuitl": [
    28997
  ],
  "ancient relic": [
    22305
  ],
  "armadyl crossbow": [
    11785
  ],
  "armadyl hilt": [
    11810
  ],
  "drake's tooth": [
    22960
  ],
  "drakes tooth": [
    22960
  ],
  "fish barrel": [
    25582
  ],
  "kraken tentacle": [
    12004
  ],
  "seers ring": [
    6731
  ],
  "seers' ring": [
    6731
  ],
  "zamorak hilt": [
    11816
  ],
  "eternal crystal": [
    13227
  ],
  "elder venator fang": [
    33634
  ],
  "voidwaker hilt": [
    27681
  ],
  "serpentine visage": [
    12927
  ],
  "abyssal lantern": [
    26822
  ],
  "venator shard": [
    27614
  ],
  "archers ring": [
    6733
  ],
  "archer's ring": [
    6733
  ],
  "fangs of venenatis": [
    27670
  ],
  "magic fang": [
    12932
  ],
  "tanzanite fang": [
    12922
  ],
  "eclipse atlatl": [
    29000
  ],
  "eclipse atlati": [
    29000
  ],
  "fox whistle": [
    28626
  ],
  "warrior ring": [
    6735
  ],
  "gem bag": [
    12020
  ],
  "saradomin sword": [
    11838
  ],
  "jar of dirt": [
    12007
  ],
  "tormented synapse": [
    29580
  ],
  "black tourmaline core": [
    21730
  ],
  "holy sandals": [
    12598
  ],
  "bandos hilt": [
    11812
  ],
  "bottled storm": [
    31949
  ],
  "monkey tail": [
    19610
  ],
  "smouldering stone": [
    13233
  ],
  "gold locks": [
    25454
  ],
  "ice element staff crown": [
    30628
  ],
  "fire element staff crown": [
    30631
  ],
  "primordial crystal": [
    13231
  ],
  "voidwaker gem": [
    27687
  ],
  "ranger boots": [
    2577
  ],
  "blood shard": [
    24777
  ],
  "voidwaker blade": [
    27684
  ],
  "saradomin hilt": [
    11814
  ],
  "staff of the dead": [
    11791
  ],
  "drake's claw": [
    22957
  ],
  "drakes claw": [
    22957
  ],
  "dragon warhammer": [
    13576
  ],
  "pegasian crystal": [
    13229
  ],
  "pegesian crystal": [
    13229
  ],
  "abyssal needle": [
    26813
  ],
  "ring of endurance": [
    24736
  ],
  "uncut onyx": [
    6571
  ],
  "dragon harpoon": [
    21028
  ],
  "vorkath's head": [
    21907
  ],
  "vorkaths head": [
    21907
  ],
  "soulflame horn": [
    30759
  ],
  "burning claw": [
    29574
  ],
  "coal bag": [
    12019
  ],
  "golden tench": [
    22840
  ],
  "any armadyl armour piece": [
    11826,
    11828,
    11830
  ],
  "any bandos armour piece": [
    11832,
    11834,
    11836
  ],
  "any barrows item": [
    4708,
    4710,
    4712,
    4714,
    4716,
    4718,
    4720,
    4722,
    4724,
    4726,
    4728,
    4730,
    4732,
    4734,
    4736,
    4738,
    4745,
    4747,
    4749,
    4751,
    4753,
    4755,
    4757,
    4759
  ],
  "any blood moon piece": [
    29028,
    29022,
    29025
  ],
  "any blue moon piece": [
    29019,
    29013,
    29016
  ],
  "any eclipse moon piece": [
    29010,
    29004,
    29007
  ],
  "any cox unique": [
  21000, 
  21012, 
  21015, 
  21018,
  21021, 
  21024, 
  13652,
  21003,
  21043,
  20997, 
  20849,
  22386
],
  "any dt2 unique": [
    26241,
    26243,
    26245,
    28279,
    28281,
    28285,
    28283,
    28321,
    28325,
    28323,
    28319
  ],
  "any dt2 unique virtus/ring": [
    26241,
    26243,
    26245,
    28279,
    28281,
    28285,
    28283
  ],
  "any dt2 unique virtusring": [
    26241,
    26243,
    26245,
    28279,
    28281,
    28285,
    28283
  ],
  "any virtus/vestige/axe piece": [
    26241,
    26243,
    26245,
    28279,
    28281,
    28285,
    28283,
    28321,
    28325,
    28323,
    28319
  ],
  "any hydra unique": [
    22966,
    22983,
    22988,
    22973,
    22971,
    22969
  ],
  "any nex unique": [
  26235,
  26376, 
  26378, 
  26382, 
  26384, 
  26386  
  ],
  "any nm unique": [
    24419,
    24420,
    24421,
    24417,
    24517,
    24511,
    24514,
    24422,
  ],
  "any noxious haly piece": [
    29790,
    29792,
    29794
  ],
  "any noxious hally piece": [
    29790,
    29792,
    29794
  ],
  "any noxious halberd piece": [
    29790,
    29792,
    29794
  ],
  "any oathplate armour": [
    30750,
    30753,
    30756
  ],
  "any oathplate armor": [
    30750,
    30753,
    30756
  ],
  "any revenant weapon": [
    22550,
    22555,
    22545
  ],
  "any revenant weapon piece": [
    22550,
    22555,
    22545
  ],
  "any toa unique": [
  26219,
  25975,
  25985,
  27226,
  27229,
  27232,
  27275
  ],
  "any tob unique": [
    22477,
    22324,
    22323,
    22326,
    22327,
    22328,
    22325,
    25744,
    25742,
    25746
  ],
  "any visage": [
    11286,
    22006,
    21637
  ],
  "doom unique": [
    31113,
    31115,
    31088,
    31109,
    31106
  ],
  "god d hide shield": [
    23188,
    23191,
    23194,
    23200,
    23203,
    23197
  ],
  "god dhide shield": [
    23188,
    23191,
    23194,
    23200,
    23203,
    23197
  ]
};

function normalizeName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[’]/g, "'")
    .replace(/[()]/g, " ")
    .replace(/[^a-z0-9'\/+\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function asPositiveInt(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export function uniqueIds(values) {
  return [...new Set(values.map(asPositiveInt).filter(Boolean))];
}

function extractDirectTileIds(tile) {
  const direct = [];
  if (tile.itemId || tile.itemID || tile.itemid) direct.push(tile.itemId || tile.itemID || tile.itemid);
  if (Array.isArray(tile.itemIds)) direct.push(...tile.itemIds);
  if (Array.isArray(tile.itemIDs)) direct.push(...tile.itemIDs);
  if (Array.isArray(tile.items)) {
    tile.items.forEach(item => {
      if (typeof item === "number" || typeof item === "string") direct.push(item);
      else direct.push(item?.id || item?.itemId || item?.itemid);
    });
  }
  return uniqueIds(direct);
}

export async function lookupTileItemIds(env, tile) {
  if (!tile) return [];

  const direct = extractDirectTileIds(tile);
  if (direct.length) return direct;

  const rawName = tile.name || tile.title || tile.label || "";
  const normalized = normalizeName(rawName);
  if (!normalized) return [];

  // Only true manual/non-drop tiles are skipped. Custom drop tiles are listed in TILE_ITEM_IDS.
  if (MANUAL_TILE_PATTERNS.some(pattern => pattern.test(rawName))) return [];

  return uniqueIds(TILE_ITEM_IDS[normalized] || []);
}

export function normalizeTileName(value) {
  return normalizeName(value);
}

export { TILE_ITEM_IDS };
