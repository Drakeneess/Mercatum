/** Human-scale aptitudes. In V1, Dexterity sets movement cadence, Strength sets carry capacity and door force time,
 * and Intellect sets the alternative door analysis time. Other attributes await future systems. */
export const STAT_KEYS = [
  "strength",
  "dexterity",
  "endurance",
  "perception",
  "intellect",
  "social",
  "composure",
] as const;

export type StatKey = typeof STAT_KEYS[number];
export type CharacterStats = Record<StatKey, number>;

export const STARTING_STAT = 1;
export const CREATION_MAX_STAT = 3;
export const STAT_MAX = 5;
export const ATTRIBUTE_POINTS = 7;
export const TOTAL_STARTING_POINTS = STAT_KEYS.length * STARTING_STAT + ATTRIBUTE_POINTS;

export const STAT_INFO: ReadonlyArray<{
  key: StatKey;
  short: string;
  name: string;
  description: string;
  active: boolean;
}> = [
  { key: "strength", short: "FUE", name: "Fuerza", description: "Peso de carga y apertura por fuerza.", active: true },
  { key: "dexterity", short: "DES", name: "Destreza", description: "Intervalo real entre hexágonos.", active: true },
  { key: "endurance", short: "RES", name: "Resistencia", description: "Fatiga, heridas y esfuerzo sostenido.", active: false },
  { key: "perception", short: "PER", name: "Percepción", description: "Rastros, indicios y amenazas detectables.", active: false },
  { key: "intellect", short: "INT", name: "Intelecto", description: "Análisis y apertura de mecanismos.", active: true },
  { key: "social", short: "TRA", name: "Trato", description: "Negociación e intercambio de información.", active: false },
  { key: "composure", short: "TEM", name: "Temple", description: "Control de la tensión y del pánico.", active: false },
];

export const BALANCED_STATS: Readonly<CharacterStats> = Object.freeze({
  strength: 2, dexterity: 2, endurance: 2, perception: 2,
  intellect: 2, social: 2, composure: 2,
});

export function spentAttributePoints(stats: CharacterStats): number {
  return STAT_KEYS.reduce((sum, key) => sum + stats[key] - STARTING_STAT, 0);
}

/** Reject partial, extra, fractional or out-of-budget character sheets. */
export function parseCharacterStats(input: unknown): CharacterStats | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const record = input as Record<string, unknown>;
  if (Object.keys(record).length !== STAT_KEYS.length) return null;

  const parsed = {} as CharacterStats;
  for (const key of STAT_KEYS) {
    const value = record[key];
    if (!Number.isInteger(value) || (value as number) < STARTING_STAT || (value as number) > CREATION_MAX_STAT) {
      return null;
    }
    parsed[key] = value as number;
  }

  return spentAttributePoints(parsed) === ATTRIBUTE_POINTS ? parsed : null;
}

/** Discrete cooldown; exactly one adjacent tile is moved per accepted command.
 * 0, 4 and 5 are reserved for debuffs/progression beyond character creation. */
const MOVE_INTERVAL_MS = [1400, 1200, 1050, 900, 800, 700] as const;
export function getMovementDelayMs(dexterity: number): number {
  const level = Number.isFinite(dexterity) ? Math.max(0, Math.min(STAT_MAX, Math.trunc(dexterity))) : STARTING_STAT;
  return MOVE_INTERVAL_MS[level];
}
