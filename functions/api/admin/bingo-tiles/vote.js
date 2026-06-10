const STAFF_ROLE_IDS = [
  "1364734283356569620",
  "1365445491776815104"
];

const BINGO_TILE_VOTES_KEY = "bingo:tile-votes:v1";

const DEFAULT_BINGO_TILE_ITEMS = [
  {
    "id": "pvm-god-wars-dungeon-bandos-chestplate",
    "category": "pvm",
    "activity": "God Wars Dungeon",
    "name": "Bandos Chestplate"
  },
  {
    "id": "pvm-god-wars-dungeon-bandos-tassets",
    "category": "pvm",
    "activity": "God Wars Dungeon",
    "name": "Bandos Tassets"
  },
  {
    "id": "pvm-god-wars-dungeon-bandos-boots",
    "category": "pvm",
    "activity": "God Wars Dungeon",
    "name": "Bandos Boots"
  },
  {
    "id": "pvm-god-wars-dungeon-bandos-hilt",
    "category": "pvm",
    "activity": "God Wars Dungeon",
    "name": "Bandos Hilt"
  },
  {
    "id": "pvm-god-wars-dungeon-armadyl-helmet",
    "category": "pvm",
    "activity": "God Wars Dungeon",
    "name": "Armadyl Helmet"
  },
  {
    "id": "pvm-god-wars-dungeon-armadyl-chestplate",
    "category": "pvm",
    "activity": "God Wars Dungeon",
    "name": "Armadyl Chestplate"
  },
  {
    "id": "pvm-god-wars-dungeon-armadyl-chainskirt",
    "category": "pvm",
    "activity": "God Wars Dungeon",
    "name": "Armadyl Chainskirt"
  },
  {
    "id": "pvm-god-wars-dungeon-armadyl-hilt",
    "category": "pvm",
    "activity": "God Wars Dungeon",
    "name": "Armadyl Hilt"
  },
  {
    "id": "pvm-god-wars-dungeon-saradomin-sword",
    "category": "pvm",
    "activity": "God Wars Dungeon",
    "name": "Saradomin Sword"
  },
  {
    "id": "pvm-god-wars-dungeon-armadyl-crossbow",
    "category": "pvm",
    "activity": "God Wars Dungeon",
    "name": "Armadyl Crossbow"
  },
  {
    "id": "pvm-god-wars-dungeon-saradomin-hilt",
    "category": "pvm",
    "activity": "God Wars Dungeon",
    "name": "Saradomin Hilt"
  },
  {
    "id": "pvm-god-wars-dungeon-staff-of-the-dead",
    "category": "pvm",
    "activity": "God Wars Dungeon",
    "name": "Staff of the Dead"
  },
  {
    "id": "pvm-god-wars-dungeon-zamorakian-spear",
    "category": "pvm",
    "activity": "God Wars Dungeon",
    "name": "Zamorakian Spear"
  },
  {
    "id": "pvm-god-wars-dungeon-zamorak-hilt",
    "category": "pvm",
    "activity": "God Wars Dungeon",
    "name": "Zamorak Hilt"
  },
  {
    "id": "pvm-dagannoth-kings-berserker-ring",
    "category": "pvm",
    "activity": "Dagannoth Kings",
    "name": "Berserker Ring"
  },
  {
    "id": "pvm-dagannoth-kings-archer-s-ring",
    "category": "pvm",
    "activity": "Dagannoth Kings",
    "name": "Archer's Ring"
  },
  {
    "id": "pvm-dagannoth-kings-seers-ring",
    "category": "pvm",
    "activity": "Dagannoth Kings",
    "name": "Seers Ring"
  },
  {
    "id": "pvm-dagannoth-kings-warrior-ring",
    "category": "pvm",
    "activity": "Dagannoth Kings",
    "name": "Warrior Ring"
  },
  {
    "id": "pvm-dagannoth-kings-dragon-axe",
    "category": "pvm",
    "activity": "Dagannoth Kings",
    "name": "Dragon Axe"
  },
  {
    "id": "pvm-zulrah-tanzanite-fang",
    "category": "pvm",
    "activity": "Zulrah",
    "name": "Tanzanite Fang"
  },
  {
    "id": "pvm-zulrah-magic-fang",
    "category": "pvm",
    "activity": "Zulrah",
    "name": "Magic Fang"
  },
  {
    "id": "pvm-zulrah-serpentine-visage",
    "category": "pvm",
    "activity": "Zulrah",
    "name": "Serpentine Visage"
  },
  {
    "id": "pvm-zulrah-tanzanite-mutagen",
    "category": "pvm",
    "activity": "Zulrah",
    "name": "Tanzanite Mutagen"
  },
  {
    "id": "pvm-zulrah-magma-mutagen",
    "category": "pvm",
    "activity": "Zulrah",
    "name": "Magma Mutagen"
  },
  {
    "id": "pvm-zulrah-jar-of-swamp",
    "category": "pvm",
    "activity": "Zulrah",
    "name": "Jar of Swamp"
  },
  {
    "id": "pvm-zulrah-pet-snakeling",
    "category": "pvm",
    "activity": "Zulrah",
    "name": "Pet Snakeling"
  },
  {
    "id": "pvm-zulrah-uncut-onyx",
    "category": "pvm",
    "activity": "Zulrah",
    "name": "Uncut Onyx"
  },
  {
    "id": "pvm-vorkath-dragonbone-necklace",
    "category": "pvm",
    "activity": "Vorkath",
    "name": "Dragonbone Necklace"
  },
  {
    "id": "pvm-vorkath-skeletal-visage",
    "category": "pvm",
    "activity": "Vorkath",
    "name": "Skeletal Visage"
  },
  {
    "id": "pvm-vorkath-draconic-visage",
    "category": "pvm",
    "activity": "Vorkath",
    "name": "Draconic Visage"
  },
  {
    "id": "pvm-vorkath-vorki",
    "category": "pvm",
    "activity": "Vorkath",
    "name": "Vorki"
  },
  {
    "id": "pvm-vorkath-jar-of-decay",
    "category": "pvm",
    "activity": "Vorkath",
    "name": "Jar of Decay"
  },
  {
    "id": "pvm-alchemical-hydra-hydra-s-claw",
    "category": "pvm",
    "activity": "Alchemical Hydra",
    "name": "Hydra's Claw"
  },
  {
    "id": "pvm-alchemical-hydra-hydra-leather",
    "category": "pvm",
    "activity": "Alchemical Hydra",
    "name": "Hydra Leather"
  },
  {
    "id": "pvm-alchemical-hydra-hydra-tail",
    "category": "pvm",
    "activity": "Alchemical Hydra",
    "name": "Hydra Tail"
  },
  {
    "id": "pvm-alchemical-hydra-hydra-fang",
    "category": "pvm",
    "activity": "Alchemical Hydra",
    "name": "Hydra Fang"
  },
  {
    "id": "pvm-alchemical-hydra-eye-of-the-hydra",
    "category": "pvm",
    "activity": "Alchemical Hydra",
    "name": "Eye of the Hydra"
  },
  {
    "id": "pvm-alchemical-hydra-ikkle-hydra",
    "category": "pvm",
    "activity": "Alchemical Hydra",
    "name": "Ikkle Hydra"
  },
  {
    "id": "pvm-cerberus-primordial-crystal",
    "category": "pvm",
    "activity": "Cerberus",
    "name": "Primordial Crystal"
  },
  {
    "id": "pvm-cerberus-pegasian-crystal",
    "category": "pvm",
    "activity": "Cerberus",
    "name": "Pegasian Crystal"
  },
  {
    "id": "pvm-cerberus-eternal-crystal",
    "category": "pvm",
    "activity": "Cerberus",
    "name": "Eternal Crystal"
  },
  {
    "id": "pvm-cerberus-smouldering-stone",
    "category": "pvm",
    "activity": "Cerberus",
    "name": "Smouldering Stone"
  },
  {
    "id": "pvm-cerberus-hellpuppy",
    "category": "pvm",
    "activity": "Cerberus",
    "name": "Hellpuppy"
  },
  {
    "id": "pvm-kraken-kraken-tentacle",
    "category": "pvm",
    "activity": "Kraken",
    "name": "Kraken Tentacle"
  },
  {
    "id": "pvm-kraken-trident-of-the-seas",
    "category": "pvm",
    "activity": "Kraken",
    "name": "Trident of the Seas"
  },
  {
    "id": "pvm-kraken-jar-of-dirt",
    "category": "pvm",
    "activity": "Kraken",
    "name": "Jar of Dirt"
  },
  {
    "id": "pvm-kraken-pet-kraken",
    "category": "pvm",
    "activity": "Kraken",
    "name": "Pet Kraken"
  },
  {
    "id": "pvm-abyssal-sire-unsired",
    "category": "pvm",
    "activity": "Abyssal Sire",
    "name": "Unsired"
  },
  {
    "id": "pvm-abyssal-sire-abyssal-dagger",
    "category": "pvm",
    "activity": "Abyssal Sire",
    "name": "Abyssal Dagger"
  },
  {
    "id": "pvm-abyssal-sire-abyssal-bludgeon-pieces",
    "category": "pvm",
    "activity": "Abyssal Sire",
    "name": "Abyssal Bludgeon pieces"
  },
  {
    "id": "pvm-abyssal-sire-abyssal-orphan",
    "category": "pvm",
    "activity": "Abyssal Sire",
    "name": "Abyssal Orphan"
  },
  {
    "id": "pvm-wilderness-bosses-voidwaker-blade",
    "category": "pvm",
    "activity": "Wilderness Bosses",
    "name": "Voidwaker Blade"
  },
  {
    "id": "pvm-wilderness-bosses-voidwaker-gem",
    "category": "pvm",
    "activity": "Wilderness Bosses",
    "name": "Voidwaker Gem"
  },
  {
    "id": "pvm-wilderness-bosses-voidwaker-hilt",
    "category": "pvm",
    "activity": "Wilderness Bosses",
    "name": "Voidwaker Hilt"
  },
  {
    "id": "pvm-wilderness-bosses-ring-of-the-gods",
    "category": "pvm",
    "activity": "Wilderness Bosses",
    "name": "Ring of the Gods"
  },
  {
    "id": "pvm-wilderness-bosses-tyrannical-ring",
    "category": "pvm",
    "activity": "Wilderness Bosses",
    "name": "Tyrannical Ring"
  },
  {
    "id": "pvm-wilderness-bosses-treasonous-ring",
    "category": "pvm",
    "activity": "Wilderness Bosses",
    "name": "Treasonous Ring"
  },
  {
    "id": "pvm-wilderness-bosses-dragon-pickaxe",
    "category": "pvm",
    "activity": "Wilderness Bosses",
    "name": "Dragon Pickaxe"
  },
  {
    "id": "pvm-wilderness-bosses-skull-of-vet-ion",
    "category": "pvm",
    "activity": "Wilderness Bosses",
    "name": "Skull of Vet'ion"
  },
  {
    "id": "pvm-wilderness-bosses-vet-ion-jr",
    "category": "pvm",
    "activity": "Wilderness Bosses",
    "name": "Vet'ion Jr."
  },
  {
    "id": "pvm-wilderness-bosses-callisto-cub",
    "category": "pvm",
    "activity": "Wilderness Bosses",
    "name": "Callisto Cub"
  },
  {
    "id": "pvm-wilderness-bosses-venenatis-spiderling",
    "category": "pvm",
    "activity": "Wilderness Bosses",
    "name": "Venenatis Spiderling"
  },
  {
    "id": "pvm-moons-of-peril-blood-moon-armour-pieces",
    "category": "pvm",
    "activity": "Moons of Peril",
    "name": "Blood Moon armour pieces"
  },
  {
    "id": "pvm-moons-of-peril-blue-moon-armour-pieces",
    "category": "pvm",
    "activity": "Moons of Peril",
    "name": "Blue Moon armour pieces"
  },
  {
    "id": "pvm-moons-of-peril-eclipse-moon-armour-pieces",
    "category": "pvm",
    "activity": "Moons of Peril",
    "name": "Eclipse Moon armour pieces"
  },
  {
    "id": "pvm-moons-of-peril-dual-macuahuitl",
    "category": "pvm",
    "activity": "Moons of Peril",
    "name": "Dual Macuahuitl"
  },
  {
    "id": "pvm-moons-of-peril-blue-moon-spear",
    "category": "pvm",
    "activity": "Moons of Peril",
    "name": "Blue Moon Spear"
  },
  {
    "id": "pvm-moons-of-peril-eclipse-atlatl",
    "category": "pvm",
    "activity": "Moons of Peril",
    "name": "Eclipse Atlatl"
  },
  {
    "id": "pvm-barrows-all-24-barrows-items",
    "category": "pvm",
    "activity": "Barrows",
    "name": "All 24 Barrows items"
  },
  {
    "id": "pvm-tombs-of-amascut-osmumten-s-fang",
    "category": "pvm",
    "activity": "Tombs of Amascut",
    "name": "Osmumten's Fang"
  },
  {
    "id": "pvm-tombs-of-amascut-lightbearer",
    "category": "pvm",
    "activity": "Tombs of Amascut",
    "name": "Lightbearer"
  },
  {
    "id": "pvm-tombs-of-amascut-elidinis-ward",
    "category": "pvm",
    "activity": "Tombs of Amascut",
    "name": "Elidinis' Ward"
  },
  {
    "id": "pvm-tombs-of-amascut-masori-mask",
    "category": "pvm",
    "activity": "Tombs of Amascut",
    "name": "Masori Mask"
  },
  {
    "id": "pvm-tombs-of-amascut-masori-body",
    "category": "pvm",
    "activity": "Tombs of Amascut",
    "name": "Masori Body"
  },
  {
    "id": "pvm-tombs-of-amascut-masori-chaps",
    "category": "pvm",
    "activity": "Tombs of Amascut",
    "name": "Masori Chaps"
  },
  {
    "id": "pvm-tombs-of-amascut-tumeken-s-shadow",
    "category": "pvm",
    "activity": "Tombs of Amascut",
    "name": "Tumeken's Shadow"
  },
  {
    "id": "pvm-tombs-of-amascut-thread-of-elidinis",
    "category": "pvm",
    "activity": "Tombs of Amascut",
    "name": "Thread of Elidinis"
  },
  {
    "id": "pvm-chambers-of-xeric-dexterous-prayer-scroll",
    "category": "pvm",
    "activity": "Chambers of Xeric",
    "name": "Dexterous Prayer Scroll"
  },
  {
    "id": "pvm-chambers-of-xeric-arcane-prayer-scroll",
    "category": "pvm",
    "activity": "Chambers of Xeric",
    "name": "Arcane Prayer Scroll"
  },
  {
    "id": "pvm-chambers-of-xeric-twisted-buckler",
    "category": "pvm",
    "activity": "Chambers of Xeric",
    "name": "Twisted Buckler"
  },
  {
    "id": "pvm-chambers-of-xeric-dragon-hunter-crossbow",
    "category": "pvm",
    "activity": "Chambers of Xeric",
    "name": "Dragon Hunter Crossbow"
  },
  {
    "id": "pvm-chambers-of-xeric-dinh-s-bulwark",
    "category": "pvm",
    "activity": "Chambers of Xeric",
    "name": "Dinh's Bulwark"
  },
  {
    "id": "pvm-chambers-of-xeric-ancestral-hat",
    "category": "pvm",
    "activity": "Chambers of Xeric",
    "name": "Ancestral Hat"
  },
  {
    "id": "pvm-chambers-of-xeric-ancestral-robetop",
    "category": "pvm",
    "activity": "Chambers of Xeric",
    "name": "Ancestral Robetop"
  },
  {
    "id": "pvm-chambers-of-xeric-ancestral-robeskirt",
    "category": "pvm",
    "activity": "Chambers of Xeric",
    "name": "Ancestral Robeskirt"
  },
  {
    "id": "pvm-chambers-of-xeric-dragon-claws",
    "category": "pvm",
    "activity": "Chambers of Xeric",
    "name": "Dragon Claws"
  },
  {
    "id": "pvm-chambers-of-xeric-elder-maul",
    "category": "pvm",
    "activity": "Chambers of Xeric",
    "name": "Elder Maul"
  },
  {
    "id": "pvm-chambers-of-xeric-kodai-insignia",
    "category": "pvm",
    "activity": "Chambers of Xeric",
    "name": "Kodai Insignia"
  },
  {
    "id": "pvm-chambers-of-xeric-twisted-bow",
    "category": "pvm",
    "activity": "Chambers of Xeric",
    "name": "Twisted Bow"
  },
  {
    "id": "pvm-theatre-of-blood-avernic-defender-hilt",
    "category": "pvm",
    "activity": "Theatre of Blood",
    "name": "Avernic Defender Hilt"
  },
  {
    "id": "pvm-theatre-of-blood-ghrazi-rapier",
    "category": "pvm",
    "activity": "Theatre of Blood",
    "name": "Ghrazi Rapier"
  },
  {
    "id": "pvm-theatre-of-blood-sanguinesti-staff",
    "category": "pvm",
    "activity": "Theatre of Blood",
    "name": "Sanguinesti Staff"
  },
  {
    "id": "pvm-theatre-of-blood-scythe-of-vitur",
    "category": "pvm",
    "activity": "Theatre of Blood",
    "name": "Scythe of Vitur"
  },
  {
    "id": "pvm-theatre-of-blood-justiciar-faceguard",
    "category": "pvm",
    "activity": "Theatre of Blood",
    "name": "Justiciar Faceguard"
  },
  {
    "id": "pvm-theatre-of-blood-justiciar-chestguard",
    "category": "pvm",
    "activity": "Theatre of Blood",
    "name": "Justiciar Chestguard"
  },
  {
    "id": "pvm-theatre-of-blood-justiciar-legguards",
    "category": "pvm",
    "activity": "Theatre of Blood",
    "name": "Justiciar Legguards"
  },
  {
    "id": "pvm-tormented-demons-synapse",
    "category": "pvm",
    "activity": "Tormented Demons",
    "name": "Synapse"
  },
  {
    "id": "pvm-tormented-demons-burning-claw",
    "category": "pvm",
    "activity": "Tormented Demons",
    "name": "Burning Claw"
  },
  {
    "id": "pvm-corporeal-beast-spectral-sigil",
    "category": "pvm",
    "activity": "Corporeal Beast",
    "name": "Spectral Sigil"
  },
  {
    "id": "pvm-corporeal-beast-arcane-sigil",
    "category": "pvm",
    "activity": "Corporeal Beast",
    "name": "Arcane Sigil"
  },
  {
    "id": "pvm-corporeal-beast-elysian-sigil",
    "category": "pvm",
    "activity": "Corporeal Beast",
    "name": "Elysian Sigil"
  },
  {
    "id": "pvm-corporeal-beast-holy-elixir",
    "category": "pvm",
    "activity": "Corporeal Beast",
    "name": "Holy Elixir"
  },
  {
    "id": "pvm-corporeal-beast-pet-dark-core",
    "category": "pvm",
    "activity": "Corporeal Beast",
    "name": "Pet Dark Core"
  },
  {
    "id": "skilling-wintertodt-tome-of-fire",
    "category": "skilling",
    "activity": "Wintertodt",
    "name": "Tome of Fire"
  },
  {
    "id": "skilling-wintertodt-phoenix",
    "category": "skilling",
    "activity": "Wintertodt",
    "name": "Phoenix"
  },
  {
    "id": "skilling-wintertodt-dragon-axe",
    "category": "skilling",
    "activity": "Wintertodt",
    "name": "Dragon Axe"
  },
  {
    "id": "skilling-wintertodt-pyromancer-set",
    "category": "skilling",
    "activity": "Wintertodt",
    "name": "Pyromancer set"
  },
  {
    "id": "skilling-tempoross-tome-of-water",
    "category": "skilling",
    "activity": "Tempoross",
    "name": "Tome of Water"
  },
  {
    "id": "skilling-tempoross-fish-barrel",
    "category": "skilling",
    "activity": "Tempoross",
    "name": "Fish Barrel"
  },
  {
    "id": "skilling-tempoross-big-harpoonfish",
    "category": "skilling",
    "activity": "Tempoross",
    "name": "Big Harpoonfish"
  },
  {
    "id": "skilling-tempoross-tiny-tempor",
    "category": "skilling",
    "activity": "Tempoross",
    "name": "Tiny Tempor"
  },
  {
    "id": "skilling-tempoross-dragon-harpoon",
    "category": "skilling",
    "activity": "Tempoross",
    "name": "Dragon Harpoon"
  },
  {
    "id": "skilling-guardians-of-the-rift-abyssal-needle",
    "category": "skilling",
    "activity": "Guardians of the Rift",
    "name": "Abyssal Needle"
  },
  {
    "id": "skilling-guardians-of-the-rift-abyssal-lantern",
    "category": "skilling",
    "activity": "Guardians of the Rift",
    "name": "Abyssal Lantern"
  },
  {
    "id": "skilling-guardians-of-the-rift-abyssal-green-dye",
    "category": "skilling",
    "activity": "Guardians of the Rift",
    "name": "Abyssal Green Dye"
  },
  {
    "id": "skilling-guardians-of-the-rift-abyssal-blue-dye",
    "category": "skilling",
    "activity": "Guardians of the Rift",
    "name": "Abyssal Blue Dye"
  },
  {
    "id": "skilling-guardians-of-the-rift-abyssal-red-dye",
    "category": "skilling",
    "activity": "Guardians of the Rift",
    "name": "Abyssal Red Dye"
  },
  {
    "id": "skilling-guardians-of-the-rift-rift-guardian",
    "category": "skilling",
    "activity": "Guardians of the Rift",
    "name": "Rift Guardian"
  },
  {
    "id": "skilling-giant-s-foundry-smiths-uniform-top",
    "category": "skilling",
    "activity": "Giant's Foundry",
    "name": "Smiths' Uniform Top"
  },
  {
    "id": "skilling-giant-s-foundry-smiths-uniform-bottom",
    "category": "skilling",
    "activity": "Giant's Foundry",
    "name": "Smiths' Uniform Bottom"
  },
  {
    "id": "skilling-giant-s-foundry-smiths-gloves",
    "category": "skilling",
    "activity": "Giant's Foundry",
    "name": "Smiths' Gloves"
  },
  {
    "id": "skilling-giant-s-foundry-smiths-boots",
    "category": "skilling",
    "activity": "Giant's Foundry",
    "name": "Smiths' Boots"
  },
  {
    "id": "skilling-giant-s-foundry-smiths-gloves-2",
    "category": "skilling",
    "activity": "Giant's Foundry",
    "name": "Smiths' Gloves"
  },
  {
    "id": "skilling-giant-s-foundry-giant-s-sword",
    "category": "skilling",
    "activity": "Giant's Foundry",
    "name": "Giant's Sword"
  },
  {
    "id": "skilling-giant-s-foundry-giant-s-helm",
    "category": "skilling",
    "activity": "Giant's Foundry",
    "name": "Giant's Helm"
  },
  {
    "id": "skilling-forestry-beaver",
    "category": "skilling",
    "activity": "Forestry",
    "name": "Beaver"
  },
  {
    "id": "skilling-forestry-fox-whistle",
    "category": "skilling",
    "activity": "Forestry",
    "name": "Fox Whistle"
  },
  {
    "id": "skilling-forestry-pheasant-egg",
    "category": "skilling",
    "activity": "Forestry",
    "name": "Pheasant Egg"
  },
  {
    "id": "skilling-forestry-pheasant-cape",
    "category": "skilling",
    "activity": "Forestry",
    "name": "Pheasant Cape"
  },
  {
    "id": "skilling-forestry-pheasant-boots",
    "category": "skilling",
    "activity": "Forestry",
    "name": "Pheasant Boots"
  },
  {
    "id": "skilling-forestry-pheasant-legs",
    "category": "skilling",
    "activity": "Forestry",
    "name": "Pheasant Legs"
  },
  {
    "id": "skilling-forestry-forestry-basket",
    "category": "skilling",
    "activity": "Forestry",
    "name": "Forestry Basket"
  },
  {
    "id": "skilling-forestry-log-basket",
    "category": "skilling",
    "activity": "Forestry",
    "name": "Log Basket"
  },
  {
    "id": "skilling-forestry-friendly-ent-token",
    "category": "skilling",
    "activity": "Forestry",
    "name": "Friendly Ent Token"
  },
  {
    "id": "skilling-mahogany-homes-amy-s-saw",
    "category": "skilling",
    "activity": "Mahogany Homes",
    "name": "Amy's Saw"
  },
  {
    "id": "skilling-mahogany-homes-plank-sack",
    "category": "skilling",
    "activity": "Mahogany Homes",
    "name": "Plank Sack"
  },
  {
    "id": "skilling-mahogany-homes-hosidius-blueprints",
    "category": "skilling",
    "activity": "Mahogany Homes",
    "name": "Hosidius Blueprints"
  },
  {
    "id": "skilling-mahogany-homes-carpenter-s-helmet",
    "category": "skilling",
    "activity": "Mahogany Homes",
    "name": "Carpenter's Helmet"
  },
  {
    "id": "skilling-mahogany-homes-carpenter-s-shirt",
    "category": "skilling",
    "activity": "Mahogany Homes",
    "name": "Carpenter's Shirt"
  },
  {
    "id": "skilling-mahogany-homes-carpenter-s-trousers",
    "category": "skilling",
    "activity": "Mahogany Homes",
    "name": "Carpenter's Trousers"
  },
  {
    "id": "skilling-mahogany-homes-carpenter-s-boots",
    "category": "skilling",
    "activity": "Mahogany Homes",
    "name": "Carpenter's Boots"
  },
  {
    "id": "skilling-tithe-farm-farmer-s-strawhat",
    "category": "skilling",
    "activity": "Tithe Farm",
    "name": "Farmer's Strawhat"
  },
  {
    "id": "skilling-tithe-farm-farmer-s-jacket",
    "category": "skilling",
    "activity": "Tithe Farm",
    "name": "Farmer's Jacket"
  },
  {
    "id": "skilling-tithe-farm-farmer-s-trousers",
    "category": "skilling",
    "activity": "Tithe Farm",
    "name": "Farmer's Trousers"
  },
  {
    "id": "skilling-tithe-farm-farmer-s-boots",
    "category": "skilling",
    "activity": "Tithe Farm",
    "name": "Farmer's Boots"
  },
  {
    "id": "skilling-tithe-farm-herb-sack",
    "category": "skilling",
    "activity": "Tithe Farm",
    "name": "Herb Sack"
  },
  {
    "id": "skilling-tithe-farm-seed-box",
    "category": "skilling",
    "activity": "Tithe Farm",
    "name": "Seed Box"
  },
  {
    "id": "skilling-tithe-farm-gricoller-s-can",
    "category": "skilling",
    "activity": "Tithe Farm",
    "name": "Gricoller's Can"
  },
  {
    "id": "skilling-motherlode-mine-prospector-helmet",
    "category": "skilling",
    "activity": "Motherlode Mine",
    "name": "Prospector Helmet"
  },
  {
    "id": "skilling-motherlode-mine-prospector-jacket",
    "category": "skilling",
    "activity": "Motherlode Mine",
    "name": "Prospector Jacket"
  },
  {
    "id": "skilling-motherlode-mine-prospector-legs",
    "category": "skilling",
    "activity": "Motherlode Mine",
    "name": "Prospector Legs"
  },
  {
    "id": "skilling-motherlode-mine-prospector-boots",
    "category": "skilling",
    "activity": "Motherlode Mine",
    "name": "Prospector Boots"
  },
  {
    "id": "skilling-motherlode-mine-coal-bag",
    "category": "skilling",
    "activity": "Motherlode Mine",
    "name": "Coal Bag"
  },
  {
    "id": "skilling-motherlode-mine-gem-bag",
    "category": "skilling",
    "activity": "Motherlode Mine",
    "name": "Gem Bag"
  },
  {
    "id": "skilling-rooftop-agility-giant-squirrel",
    "category": "skilling",
    "activity": "Rooftop Agility",
    "name": "Giant Squirrel"
  },
  {
    "id": "skilling-hallowed-sepulchre-ring-of-endurance",
    "category": "skilling",
    "activity": "Hallowed Sepulchre",
    "name": "Ring of Endurance"
  },
  {
    "id": "skilling-hallowed-sepulchre-strange-old-lockpick",
    "category": "skilling",
    "activity": "Hallowed Sepulchre",
    "name": "Strange Old Lockpick"
  },
  {
    "id": "skilling-hallowed-sepulchre-hallowed-sack",
    "category": "skilling",
    "activity": "Hallowed Sepulchre",
    "name": "Hallowed Sack"
  },
  {
    "id": "skilling-hallowed-sepulchre-hallowed-focus",
    "category": "skilling",
    "activity": "Hallowed Sepulchre",
    "name": "Hallowed Focus"
  },
  {
    "id": "skilling-hallowed-sepulchre-hallowed-hammer",
    "category": "skilling",
    "activity": "Hallowed Sepulchre",
    "name": "Hallowed Hammer"
  },
  {
    "id": "skilling-hallowed-sepulchre-hallowed-symbol",
    "category": "skilling",
    "activity": "Hallowed Sepulchre",
    "name": "Hallowed Symbol"
  },
  {
    "id": "skilling-fishing-trawler-angler-hat",
    "category": "skilling",
    "activity": "Fishing Trawler",
    "name": "Angler Hat"
  },
  {
    "id": "skilling-fishing-trawler-angler-top",
    "category": "skilling",
    "activity": "Fishing Trawler",
    "name": "Angler Top"
  },
  {
    "id": "skilling-fishing-trawler-angler-waders",
    "category": "skilling",
    "activity": "Fishing Trawler",
    "name": "Angler Waders"
  },
  {
    "id": "skilling-fishing-trawler-angler-boots",
    "category": "skilling",
    "activity": "Fishing Trawler",
    "name": "Angler Boots"
  },
  {
    "id": "skilling-fishing-trawler-heron",
    "category": "skilling",
    "activity": "Fishing Trawler",
    "name": "Heron"
  },
  {
    "id": "skilling-aerial-fishing-fish-sack",
    "category": "skilling",
    "activity": "Aerial Fishing",
    "name": "Fish Sack"
  },
  {
    "id": "skilling-aerial-fishing-golden-tench",
    "category": "skilling",
    "activity": "Aerial Fishing",
    "name": "Golden Tench"
  },
  {
    "id": "skilling-aerial-fishing-pearl-fishing-rod",
    "category": "skilling",
    "activity": "Aerial Fishing",
    "name": "Pearl Fishing Rod"
  },
  {
    "id": "skilling-hunter-herbi",
    "category": "skilling",
    "activity": "Hunter",
    "name": "Herbi"
  },
  {
    "id": "skilling-hunter-herbiboar-pet",
    "category": "skilling",
    "activity": "Hunter",
    "name": "Herbiboar Pet"
  },
  {
    "id": "skilling-hunter-dark-kebbit-fur",
    "category": "skilling",
    "activity": "Hunter",
    "name": "Dark Kebbit Fur"
  },
  {
    "id": "skilling-hunter-sunlight-antelope-antlers-if-using-hunter-uniques",
    "category": "skilling",
    "activity": "Hunter",
    "name": "Sunlight Antelope Antlers (if using hunter uniques)"
  },
  {
    "id": "skilling-runecraft-rift-guardian",
    "category": "skilling",
    "activity": "Runecraft",
    "name": "Rift Guardian"
  },
  {
    "id": "skilling-runecraft-bloodbark-scroll",
    "category": "skilling",
    "activity": "Runecraft",
    "name": "Bloodbark Scroll"
  },
  {
    "id": "skilling-runecraft-swampbark-scroll",
    "category": "skilling",
    "activity": "Runecraft",
    "name": "Swampbark Scroll"
  },
  {
    "id": "skilling-farming-tangleroot",
    "category": "skilling",
    "activity": "Farming",
    "name": "Tangleroot"
  },
  {
    "id": "skilling-farming-bottomless-compost-bucket",
    "category": "skilling",
    "activity": "Farming",
    "name": "Bottomless Compost Bucket"
  },
  {
    "id": "skilling-misc-skilling-pets-beaver",
    "category": "skilling",
    "activity": "Misc. Skilling Pets",
    "name": "Beaver"
  },
  {
    "id": "skilling-misc-skilling-pets-giant-squirrel",
    "category": "skilling",
    "activity": "Misc. Skilling Pets",
    "name": "Giant Squirrel"
  },
  {
    "id": "skilling-misc-skilling-pets-rocky",
    "category": "skilling",
    "activity": "Misc. Skilling Pets",
    "name": "Rocky"
  },
  {
    "id": "skilling-misc-skilling-pets-rift-guardian",
    "category": "skilling",
    "activity": "Misc. Skilling Pets",
    "name": "Rift Guardian"
  },
  {
    "id": "skilling-misc-skilling-pets-heron",
    "category": "skilling",
    "activity": "Misc. Skilling Pets",
    "name": "Heron"
  },
  {
    "id": "skilling-misc-skilling-pets-tangleroot",
    "category": "skilling",
    "activity": "Misc. Skilling Pets",
    "name": "Tangleroot"
  },
  {
    "id": "skilling-misc-skilling-pets-phoenix",
    "category": "skilling",
    "activity": "Misc. Skilling Pets",
    "name": "Phoenix"
  },
  {
    "id": "skilling-misc-skilling-pets-tiny-tempor",
    "category": "skilling",
    "activity": "Misc. Skilling Pets",
    "name": "Tiny Tempor"
  },
  {
    "id": "skilling-misc-skilling-pets-herbi",
    "category": "skilling",
    "activity": "Misc. Skilling Pets",
    "name": "Herbi"
  }
];

function getSession(request) {
  const cookie = request.headers.get("Cookie") || "";
  const match = cookie.match(/ironkin_session=([^;]+)/);
  if (!match) return null;
  try { return JSON.parse(atob(match[1])); } catch { return null; }
}

function isStaffSession(session) {
  return Boolean(session?.roles?.some(roleId => STAFF_ROLE_IDS.includes(roleId)));
}

function safeJsonParse(value, fallback) {
  if (!value) return fallback;
  try { return JSON.parse(value); } catch { return fallback; }
}

function summarizeItem(item, votes) {
  const itemVotes = votes[item.id] || {};
  const entries = Object.values(itemVotes);
  const yesVotes = entries.filter(vote => vote?.want === true).length;
  const noVotes = entries.filter(vote => vote?.want === false).length;
  const qtyValues = entries
    .filter(vote => vote?.want === true)
    .map(vote => Number(vote.qty || 1))
    .filter(qty => Number.isFinite(qty) && qty > 0);
  const recommendedQty = qtyValues.length ? Math.max(...qtyValues) : 1;
  return { ...item, yesVotes, noVotes, totalVotes: entries.length, recommendedQty };
}

export async function onRequestPost({ request, env }) {
  const session = getSession(request);
  if (!isStaffSession(session)) {
    return Response.json({ error: "Staff only." }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const itemId = String(body.itemId || "");
  const want = body.want === true ? true : body.want === false ? false : null;
  const qty = Math.max(1, Math.min(99, Number.parseInt(body.qty || 1, 10) || 1));
  const item = DEFAULT_BINGO_TILE_ITEMS.find(candidate => candidate.id === itemId);

  if (!item) {
    return Response.json({ error: "Unknown bingo tile item." }, { status: 400 });
  }

  if (want === null) {
    return Response.json({ error: "Vote must be yes or no." }, { status: 400 });
  }

  const votes = safeJsonParse(await env.DROPS_KV.get(BINGO_TILE_VOTES_KEY), {});
  const userId = session.id || session.discordId || session.username || "unknown";

  votes[itemId] = votes[itemId] || {};
  votes[itemId][userId] = {
    want,
    qty: want ? qty : 1,
    staffName: session.displayName || session.global_name || session.username || "Staff",
    updatedAt: new Date().toISOString()
  };

  await env.DROPS_KV.put(BINGO_TILE_VOTES_KEY, JSON.stringify(votes));

  return Response.json({ success: true, item: { ...summarizeItem(item, votes), myVote: votes[itemId][userId] } });
}
