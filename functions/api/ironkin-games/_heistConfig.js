// Confirmed event scoring and Phase 1 objectives; unverified details are clearly marked.
// DO NOT LAUNCH until original Phase 2–5 tasks, Phase 1 bank riddles and Phase 1–4 risks are restored.
export const HEIST_PHASES = [
  {
    "name": "Case the Joint",
    "points": 100,
    "tasks": [
      [
        "thieving",
        "Thieving Reconnaissance",
        "Gain 100,000 Thieving XP during the event.",
        25,
        "thieving_xp",
        100000
      ],
      [
        "banks",
        "Bank Reconnaissance",
        "Solve three bank clues by entering the correct bank names.",
        25,
        null,
        null
      ],
      [
        "pvm-drop",
        "Valuable PvM Drop",
        "Obtain one PvM drop worth at least 500,000 GP.",
        25,
        "drop_value",
        500000
      ],
      [
        "bosses",
        "Boss Surveillance",
        "Defeat 20 different bosses during the event.",
        25,
        "unique_bosses",
        20
      ]
    ],
    "risk": [
      [
        "calculated",
        "Calculated Risk: phase-specific objective requires original approved rules"
      ],
      [
        "allin",
        "All-In: phase-specific objective requires original approved rules"
      ]
    ]
  },
  {
    "name": "Assemble the Crew",
    "points": 150,
    "tasks": [
      [
        "crew",
        "Recruit the Crew [RULES NEED VERIFICATION]",
        "UNVERIFIED PLACEHOLDER \u2014 replace with the original approved challenge before launching. Complete a group activity with your team and submit proof.",
        37,
        null,
        null
      ],
      [
        "equipment",
        "Acquire Equipment [RULES NEED VERIFICATION]",
        "UNVERIFIED PLACEHOLDER \u2014 replace with the original approved challenge before launching. Obtain equipment for the operation and submit proof.",
        37,
        null,
        null
      ],
      [
        "training",
        "Practice the Plan [RULES NEED VERIFICATION]",
        "UNVERIFIED PLACEHOLDER \u2014 replace with the original approved challenge before launching. Complete a team preparation challenge and submit proof.",
        37,
        null,
        null
      ],
      [
        "contacts",
        "Build Contacts [RULES NEED VERIFICATION]",
        "UNVERIFIED PLACEHOLDER \u2014 replace with the original approved challenge before launching. Complete a coordinated team objective and submit proof.",
        39,
        null,
        null
      ]
    ],
    "risk": [
      [
        "calculated",
        "Calculated Risk: phase-specific objective requires original approved rules"
      ],
      [
        "allin",
        "All-In: phase-specific objective requires original approved rules"
      ]
    ]
  },
  {
    "name": "Breach the Defenses",
    "points": 200,
    "tasks": [
      [
        "entry",
        "Find an Entry [RULES NEED VERIFICATION]",
        "UNVERIFIED PLACEHOLDER \u2014 replace with the original approved challenge before launching. Complete a team entry challenge and submit proof.",
        50,
        null,
        null
      ],
      [
        "guards",
        "Evade the Guards [RULES NEED VERIFICATION]",
        "UNVERIFIED PLACEHOLDER \u2014 replace with the original approved challenge before launching. Complete a combat or evasion objective and submit proof.",
        50,
        null,
        null
      ],
      [
        "distraction",
        "Create a Distraction [RULES NEED VERIFICATION]",
        "UNVERIFIED PLACEHOLDER \u2014 replace with the original approved challenge before launching. Complete a coordinated distraction objective and submit proof.",
        50,
        null,
        null
      ],
      [
        "breach",
        "Breach the Perimeter [RULES NEED VERIFICATION]",
        "UNVERIFIED PLACEHOLDER \u2014 replace with the original approved challenge before launching. Complete a group challenge and submit proof.",
        50,
        null,
        null
      ]
    ],
    "risk": [
      [
        "calculated",
        "Calculated Risk: phase-specific objective requires original approved rules"
      ],
      [
        "allin",
        "All-In: phase-specific objective requires original approved rules"
      ]
    ]
  },
  {
    "name": "Crack the Vault",
    "points": 200,
    "tasks": [
      [
        "lock",
        "Pick the Lock [RULES NEED VERIFICATION]",
        "UNVERIFIED PLACEHOLDER \u2014 replace with the original approved challenge before launching. Complete a skill-based objective and submit proof.",
        50,
        null,
        null
      ],
      [
        "vault",
        "Open the Vault [RULES NEED VERIFICATION]",
        "UNVERIFIED PLACEHOLDER \u2014 replace with the original approved challenge before launching. Complete a team vault objective and submit proof.",
        50,
        null,
        null
      ],
      [
        "loot",
        "Secure the Loot [RULES NEED VERIFICATION]",
        "UNVERIFIED PLACEHOLDER \u2014 replace with the original approved challenge before launching. Complete a loot-gathering objective and submit proof.",
        50,
        null,
        null
      ],
      [
        "escapeplan",
        "Plan the Escape [RULES NEED VERIFICATION]",
        "UNVERIFIED PLACEHOLDER \u2014 replace with the original approved challenge before launching. Complete an escape preparation objective and submit proof.",
        50,
        null,
        null
      ]
    ],
    "risk": [
      [
        "calculated",
        "Calculated Risk: phase-specific objective requires original approved rules"
      ],
      [
        "allin",
        "All-In: phase-specific objective requires original approved rules"
      ]
    ]
  },
  {
    "name": "The Getaway",
    "points": 150,
    "tasks": [
      [
        "revenants",
        "Revenant Run [RULES NEED VERIFICATION]",
        "UNVERIFIED PLACEHOLDER \u2014 replace with the original approved challenge before launching. Complete a Revenant challenge and submit screenshots.",
        37,
        null,
        null
      ],
      [
        "wildslayer",
        "Wilderness Slayer [RULES NEED VERIFICATION]",
        "UNVERIFIED PLACEHOLDER \u2014 replace with the original approved challenge before launching. Obtain an eligible Wilderness Slayer drop and submit proof.",
        37,
        null,
        null
      ],
      [
        "extraction",
        "Extract the Loot [RULES NEED VERIFICATION]",
        "UNVERIFIED PLACEHOLDER \u2014 replace with the original approved challenge before launching. Complete a team extraction objective and submit proof.",
        37,
        null,
        null
      ],
      [
        "getaway",
        "Make the Getaway [RULES NEED VERIFICATION]",
        "UNVERIFIED PLACEHOLDER \u2014 replace with the original approved challenge before launching. Complete the final team getaway challenge and submit proof.",
        39,
        null,
        null
      ]
    ],
    "risk": [
      [
        "calculated",
        "Calculated Risk: 150 Revenant kills (+10 points, +10 Heat)"
      ],
      [
        "allin",
        "All-In: 3 eligible Wilderness Slayer drops (+20 points, +25 Heat)"
      ]
    ]
  }
];
export const HEIST_RIDDLES = [
  {
    "clue": "UNVERIFIED: original bank clue 1 must be restored.",
    "answer": "__unverified_1__"
  },
  {
    "clue": "UNVERIFIED: original bank clue 2 must be restored.",
    "answer": "__unverified_2__"
  },
  {
    "clue": "UNVERIFIED: original bank clue 3 must be restored.",
    "answer": "__unverified_3__"
  }
];
export const HEIST_BANK = {"finalExtraction": "Varrock West Bank", "minimumMembers": 3, "placementPoints": [50, 35, 20, 10]};
