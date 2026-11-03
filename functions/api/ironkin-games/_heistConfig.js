// Grand Heist finalized event configuration; evidence requires admin verification.
export const HEIST_PHASES = [
  {
    "name": "Case the Joint",
    "points": 100,
    "tasks": [
      [
        "thieving",
        "Inside Information",
        "Gain 100,000 Thieving XP collectively. WOM XP evidence.",
        25,
        "thieving_xp",
        100000
      ],
      [
        "banks",
        "Establish Surveillance",
        "Solve all three bank clues by typing their names.",
        25,
        null,
        null
      ],
      [
        "pvm-drop",
        "Bribe the Informants",
        "Obtain one new PvM drop worth at least 500,000 GP; Loot Logger evidence.",
        25,
        "drop_value",
        500000
      ],
      [
        "bosses",
        "Study the Security",
        "Defeat 20 different bosses collectively; verified unique boss kills.",
        25,
        "unique_bosses",
        20
      ]
    ],
    "risk": [
      [
        "calculated",
        "Obtain a SECOND separate PvM drop worth 500,000+ GP; no reuse of core drop."
      ],
      [
        "allin",
        "Obtain a separate PvM drop worth 1,000,000+ GP AND defeat five additional unique bosses; no core overlap."
      ]
    ]
  },
  {
    "name": "Assemble the Crew",
    "points": 150,
    "tasks": [
      [
        "fish",
        "Prepare the Supplies I",
        "Cook 1,000 fish collectively. Before/after or RuneLite production evidence.",
        35,
        null,
        1000
      ],
      [
        "ham",
        "Undercover Operation",
        "Three different members obtain and wear full HAM outfits; visible RSNs and screenshots.",
        40,
        null,
        3
      ],
      [
        "potions",
        "Prepare the Supplies II",
        "Create 300 potions collectively; production evidence.",
        40,
        null,
        300
      ],
      [
        "construction",
        "Build the Safehouse",
        "Gain 250,000 Construction XP collectively; WOM.",
        35,
        "construction_xp",
        250000
      ]
    ],
    "risk": [
      [
        "calculated",
        "Obtain 5 Brimstone keys; screenshots proving new acquisitions."
      ],
      [
        "allin",
        "Create 300 ADDITIONAL potions, separate from the 300 core potions."
      ]
    ]
  },
  {
    "name": "Breach the Defenses",
    "points": 200,
    "tasks": [
      [
        "mining",
        "Break Through the Walls",
        "Gain 100,000 Mining XP collectively; WOM.",
        50,
        "mining_xp",
        100000
      ],
      [
        "superiors",
        "Eliminate the Elite Guards",
        "Kill 3 Superior Slayer creatures collectively; proof of kills.",
        50,
        null,
        3
      ],
      [
        "dragon",
        "Secure the Weaponry",
        "Present one dragon equipment item; existing banked item permitted.",
        50,
        null,
        1
      ],
      [
        "cannonballs",
        "Prepare the Artillery",
        "Smith 10,000 cannonballs collectively; production evidence.",
        50,
        null,
        10000
      ]
    ],
    "risk": [
      [
        "calculated",
        "Kill 3 ADDITIONAL Superior Slayer creatures beyond the three core kills."
      ],
      [
        "allin",
        "Smith 5,000 ADDITIONAL cannonballs beyond the 10,000 core cannonballs."
      ]
    ]
  },
  {
    "name": "Crack the Vault",
    "points": 200,
    "tasks": [
      [
        "smithing",
        "Forge the Vault Tools",
        "Gain 150,000 Smithing XP collectively; WOM.",
        50,
        "smithing_xp",
        150000
      ],
      [
        "runes",
        "Break the Magical Seal",
        "Screenshot one stack of 100,000 runes; banked runes allowed.",
        50,
        null,
        100000
      ],
      [
        "treasure",
        "Secure the Treasure",
        "Obtain 5,000,000 GP in new PvM drops collectively; Loot Logger.",
        50,
        "pvm_loot",
        5000000
      ],
      [
        "chests",
        "Crack the Final Lock",
        "Open 150 qualifying chests collectively; Rogues’ Castle chests count; opening evidence.",
        50,
        null,
        150
      ]
    ],
    "risk": [
      [
        "calculated",
        "Obtain 1,000,000 GP ADDITIONAL PvM loot beyond the 5M core."
      ],
      [
        "allin",
        "Open 25 ADDITIONAL qualifying chests beyond the 150 core chests."
      ]
    ]
  },
  {
    "name": "The Getaway",
    "points": 150,
    "tasks": [
      [
        "slayer",
        "Fight Through the Pursuit",
        "Complete one Slayer assignment worth at least 40,000 Slayer XP; same-assignment start and completion screenshots.",
        50,
        null,
        40000
      ],
      [
        "hunter",
        "Cover Your Tracks",
        "Gain 150,000 Hunter XP collectively; WOM.",
        50,
        "hunter_xp",
        150000
      ],
      [
        "bones",
        "Destroy the Evidence",
        "Sacrifice 500 bones at the Chaos Altar collectively; before/after or RuneLite evidence.",
        50,
        null,
        500
      ]
    ],
    "risk": [
      [
        "calculated",
        "Kill 150 Revenants; verified kills and no overlap with core objectives."
      ],
      [
        "allin",
        "Obtain 3 eligible Wilderness Slayer drops while on Wilderness Slayer assignments; Loot Logger and assignment proof; no overlap with core."
      ]
    ]
  }
];
export const HEIST_RIDDLES = [
  {
    "clue": "A city of knights guards its treasures in twin houses. Seek the one closer to the rising sun, not the one beside the western road. Name the vault.",
    "answer": "falador east bank"
  },
  {
    "clue": "A toll once divided two peoples; now coins pass freely where a furnace burns near a palace of the sands. Name the bank.",
    "answer": "al kharid bank"
  },
  {
    "clue": "Where a great market draws merchants from across Gielinor, seek the older city’s vault on the side of the setting sun. Name the bank.",
    "answer": "varrock west bank"
  }
];
export const HEIST_BANK = {
  "finalExtraction": "Varrock West Bank",
  "minimumMembers": 3,
  "placementPoints": [
    50,
    35,
    20,
    10
  ]
};
