export const TEAM_ONE_KEY = "team1";
export const TEAM_TWO_KEY = "team2";
export const TEAM_ONE_NAME = "Apey's Apes";
export const TEAM_TWO_NAME = "The Harambe Hunters";

const TEAM_ONE_MEMBERS = [
  "AirFreyr",
  "ak7 4u",
  "apey",
  "Apie",
  "Area S4",
  "Avoids Nerds",
  "BurnsWhenIFe",
  "bye uwu",
  "CatchingSam",
  "Coll Loggin",
  "David",
  "DrunkWeldr",
  "IM W A N O K",
  "ImhimMan",
  "Iron Jekke",
  "oSteezz",
  "Papasteen",
  "Solo Ikigai",
  "Thirte",
  "TileNoMore",
  "Tony Paddle",
  "Too ter",
  "VibingIron",
  "Vixyll",
  "Squidee241",
  "poosani"
];

const TEAM_TWO_MEMBERS = [
  "9ty2",
  "AForAnarchy",
  "Bludbag",
  "Celestialith",
  "DaveisIron",
  "Evil-gunter",
  "Bob Locked",
  "Fe Regifly",
  "FlamingoStef",
  "GIM Seedling",
  "iBoolean",
  "Ironstet",
  "Is Gap On",
  "Lonelyy",
  "Mahorraga",
  "nihaowdi",
  "Noxyy",
  "Noxvyre",
  "of skies",
  "of skys",
  "Rad Effects",
  "Rokon",
  "Sir Vaivil",
  "St Grump",
  "Tjob",
  "Trycksters",
  "whiskFey",
  "Quiorra91",
  "7 o_o7 UIM"
];

export function normalizeRosterName(value) {
  return String(value || "")
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/[’‘`]/g, "'")
    .replace(/\s+/g, " ");
}

const TEAM_ONE_LOOKUP = new Set(TEAM_ONE_MEMBERS.map(normalizeRosterName));
const TEAM_TWO_LOOKUP = new Set(TEAM_TWO_MEMBERS.map(normalizeRosterName));

export function rosterTeamForName(value) {
  const fullName = normalizeRosterName(value);
  if (!fullName) return null;

  if (TEAM_ONE_LOOKUP.has(fullName)) return TEAM_ONE_KEY;
  if (TEAM_TWO_LOOKUP.has(fullName)) return TEAM_TWO_KEY;

  // Discord nicknames such as "apey | Apie" contain both a display name and RSN.
  const aliases = fullName.split("|").map(part => normalizeRosterName(part)).filter(Boolean);
  for (const alias of aliases) {
    if (TEAM_ONE_LOOKUP.has(alias)) return TEAM_ONE_KEY;
    if (TEAM_TWO_LOOKUP.has(alias)) return TEAM_TWO_KEY;
  }

  return null;
}

export function rosterTeamForSession(session, signup = null) {
  const candidates = [session?.nick, session?.global_name, session?.username, signup?.displayName, signup?.username];
  for (const candidate of candidates) {
    const team = rosterTeamForName(candidate);
    if (team) return team;
  }
  return null;
}
