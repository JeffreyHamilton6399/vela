/**
 * Offline unit conversion. Every factor is in this file — the converter never
 * asks anything on the network, including for currency, which is why currency
 * is deliberately absent: a live rate would be a request Vela does not make.
 */
export interface Unit {
  readonly id: string;
  readonly name: string;
  /** How many base units one of this unit is worth. */
  readonly factor: number;
}

export interface UnitCategory {
  readonly id: string;
  readonly name: string;
  readonly units: readonly Unit[];
}

export const UNIT_CATEGORIES: readonly UnitCategory[] = [
  {
    id: 'length',
    name: 'Length',
    units: [
      { id: 'mm', name: 'Millimetres', factor: 0.001 },
      { id: 'cm', name: 'Centimetres', factor: 0.01 },
      { id: 'm', name: 'Metres', factor: 1 },
      { id: 'km', name: 'Kilometres', factor: 1000 },
      { id: 'in', name: 'Inches', factor: 0.0254 },
      { id: 'ft', name: 'Feet', factor: 0.3048 },
      { id: 'yd', name: 'Yards', factor: 0.9144 },
      { id: 'mi', name: 'Miles', factor: 1609.344 },
    ],
  },
  {
    id: 'mass',
    name: 'Mass',
    units: [
      { id: 'g', name: 'Grams', factor: 1 },
      { id: 'kg', name: 'Kilograms', factor: 1000 },
      { id: 't', name: 'Tonnes', factor: 1_000_000 },
      { id: 'oz', name: 'Ounces', factor: 28.349523125 },
      { id: 'lb', name: 'Pounds', factor: 453.59237 },
      { id: 'st', name: 'Stone', factor: 6350.29318 },
    ],
  },
  {
    id: 'data',
    name: 'Data',
    units: [
      { id: 'b', name: 'Bytes', factor: 1 },
      { id: 'kb', name: 'Kilobytes', factor: 1000 },
      { id: 'kib', name: 'Kibibytes', factor: 1024 },
      { id: 'mb', name: 'Megabytes', factor: 1e6 },
      { id: 'mib', name: 'Mebibytes', factor: 1024 ** 2 },
      { id: 'gb', name: 'Gigabytes', factor: 1e9 },
      { id: 'gib', name: 'Gibibytes', factor: 1024 ** 3 },
    ],
  },
  {
    id: 'speed',
    name: 'Speed',
    units: [
      { id: 'mps', name: 'Metres/second', factor: 1 },
      { id: 'kph', name: 'Km/hour', factor: 1000 / 3600 },
      { id: 'mph', name: 'Miles/hour', factor: 1609.344 / 3600 },
      { id: 'kn', name: 'Knots', factor: 1852 / 3600 },
    ],
  },
  {
    id: 'temperature',
    name: 'Temperature',
    // Temperature has offsets as well as scales, so it is handled separately.
    units: [
      { id: 'c', name: 'Celsius', factor: 1 },
      { id: 'f', name: 'Fahrenheit', factor: 1 },
      { id: 'k', name: 'Kelvin', factor: 1 },
    ],
  },
];

const [DEFAULT_CATEGORY] = UNIT_CATEGORIES as [UnitCategory, ...UnitCategory[]];

export function findCategory(id: string): UnitCategory {
  return UNIT_CATEGORIES.find((category) => category.id === id) ?? DEFAULT_CATEGORY;
}

function toCelsius(value: number, from: string): number | null {
  switch (from) {
    case 'c':
      return value;
    case 'f':
      return (value - 32) * (5 / 9);
    case 'k':
      return value - 273.15;
    default:
      return null;
  }
}

function fromCelsius(celsius: number, to: string): number | null {
  switch (to) {
    case 'c':
      return celsius;
    case 'f':
      return celsius * (9 / 5) + 32;
    case 'k':
      return celsius + 273.15;
    default:
      return null;
  }
}

/** Converts a value between two units of the same category. */
export function convert(
  value: number,
  categoryId: string,
  fromId: string,
  toId: string,
): number | null {
  if (!Number.isFinite(value)) return null;

  if (categoryId === 'temperature') {
    const celsius = toCelsius(value, fromId);
    return celsius === null ? null : fromCelsius(celsius, toId);
  }

  const category = UNIT_CATEGORIES.find((entry) => entry.id === categoryId);
  const from = category?.units.find((unit) => unit.id === fromId);
  const to = category?.units.find((unit) => unit.id === toId);
  if (from === undefined || to === undefined) return null;

  return (value * from.factor) / to.factor;
}
