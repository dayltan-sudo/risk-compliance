/**
 * Salus design tokens.
 *
 * Single typed source of truth for colour, type, spacing, radius, border and
 * shadow. `theme.css` mirrors these values as CSS custom properties on `:root`;
 * if you change a value here, change it there too. Nothing in this module
 * imports from the app, the engine or any data layer.
 */

/* ------------------------------------------------------------------ colour */

export const color = {
  ink950: '#14130F',
  ink850: '#1C1B17',
  ink800: '#26251F',
  ink: '#21201C',
  accent: '#3A5BC7',
  accentDeep: '#2C46A5',
  accentDeeper: '#1F2D5C',
  accentTint: '#EDF2FE',
  focus: '#3E63DD',
  brand: '#CB1D63',
  parchment: '#6E6E69',
  dusk: '#6B6B66',
  duskDim: '#4A4A46',
  paper: '#F7F4EE',
  card: '#FFFFFF',
  muted: '#63635E',
  line: '#DAD9D6',
  lineStrong: '#BCBBB5',
  controlBorder: '#8D8D86',
} as const;

export type ColorName = keyof typeof color;

/* -------------------------------------------------------------------- risk */

export type BandName = 'Low' | 'Medium' | 'High' | 'Critical';
export type StatusName = 'Met' | 'At-risk' | 'Gap' | 'Excluded';

export interface BandColors {
  /** Marker / dot fill for the band. */
  fg: string;
  /** Tinted chip background. */
  bg: string;
  /** Text colour that holds contrast on `bg`. */
  text: string;
}

export interface StatusColors {
  /** Tone family the status borrows its treatment from. */
  name: ToneName;
  fg: string;
  bg: string;
  dot: string;
}

export const band: Record<BandName, BandColors> = {
  Low: { fg: '#008573', bg: '#E0F8F3', text: '#0D3D38' },
  Medium: { fg: '#AB6400', bg: '#FFF7C2', text: '#4F3422' },
  High: { fg: '#CC4E00', bg: '#FFEFD6', text: '#582D1D' },
  Critical: { fg: '#CE2C31', bg: '#FEEBEC', text: '#641723' },
};

export const status: Record<StatusName, StatusColors> = {
  Met: { name: 'low', fg: band.Low.fg, bg: band.Low.bg, dot: band.Low.fg },
  'At-risk': { name: 'medium', fg: band.Medium.text, bg: band.Medium.bg, dot: band.Medium.fg },
  Gap: { name: 'critical', fg: band.Critical.text, bg: band.Critical.bg, dot: band.Critical.fg },
  Excluded: { name: 'neutral', fg: color.muted, bg: color.paper, dot: color.muted },
};

/** Saturated marker colour for a risk band. */
export function bandColor(value: BandName): string {
  return band[value].fg;
}

/** Full chip treatment for a status. */
export function statusTone(value: StatusName): StatusColors {
  return status[value];
}

/* ------------------------------------------------------------------- tones */

export type ToneName = 'neutral' | 'accent' | 'low' | 'medium' | 'high' | 'critical';

/** Any value the Tag primitive knows how to colour. */
export type ToneRef = ToneName | BandName | StatusName;

export interface ToneColors {
  name: ToneName;
  fg: string;
  bg: string;
  dot: string;
}

export const tone: Record<ToneName, ToneColors> = {
  neutral: { name: 'neutral', fg: color.muted, bg: color.paper, dot: color.muted },
  accent: { name: 'accent', fg: color.accentDeep, bg: color.accentTint, dot: color.accent },
  low: { name: 'low', fg: band.Low.text, bg: band.Low.bg, dot: band.Low.fg },
  medium: { name: 'medium', fg: band.Medium.text, bg: band.Medium.bg, dot: band.Medium.fg },
  high: { name: 'high', fg: band.High.text, bg: band.High.bg, dot: band.High.fg },
  critical: { name: 'critical', fg: band.Critical.text, bg: band.Critical.bg, dot: band.Critical.fg },
};

/** Own-property check: `value in record` would accept "toString" and friends. */
const has = (record: object, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(record, key);

const isBand = (value: string): value is BandName => has(band, value);
const isStatus = (value: string): value is StatusName => has(status, value);
const isTone = (value: string): value is ToneName => has(tone, value);

/** Normalise a tone name, a band or a status into one chip treatment. */
export function resolveTone(value: ToneRef): ToneColors {
  if (isBand(value)) return tone[value.toLowerCase() as ToneName];
  if (isStatus(value)) {
    const mapped = status[value];
    return { name: mapped.name, fg: mapped.fg, bg: mapped.bg, dot: mapped.dot };
  }
  if (isTone(value)) return tone[value];
  return tone.neutral;
}

/* -------------------------------------------------------------------- type */

export const font = {
  sans: "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif",
  serif: "'Source Serif 4', Georgia, 'Times New Roman', serif",
  mono: "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
} as const;

export const text = {
  micro: '9.5px',
  tiny: '10px',
  label: '10.5px',
  xs: '11px',
  sm: '11.5px',
  bodySm: '12px',
  body: '12.5px',
  base: '13px',
  lead: '13.5px',
  h3: '16.5px',
  h2: '21px',
  h1: '26px',
} as const;

export const leading = {
  tight: '1.25',
  snug: '1.4',
  normal: '1.5',
  relaxed: '1.6',
} as const;

export const weight = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
} as const;

/* ----------------------------------------------------------------- spacing */

export const space = {
  none: '0',
  hair: '2px',
  xxs: '4px',
  xs: '6px',
  sm: '8px',
  md: '10px',
  lg: '12px',
  xl: '14px',
  xxl: '16px',
  xxxl: '20px',
  section: '22px',
  page: '28px',
  gutter: '32px',
} as const;

/* ------------------------------------------------------------------ shapes */

export const radius = {
  xs: '5px',
  sm: '6px',
  md: '7px',
  lg: '8px',
  xl: '10px',
  xxl: '12px',
  xxxl: '14px',
  pill: '999px',
  full: '50%',
} as const;

export const border = {
  width: '1px',
  hairline: `1px solid ${color.line}`,
  rail: `1px solid ${color.ink800}`,
  accent: `1px solid ${color.accent}`,
  transparent: '1px solid transparent',
} as const;

export const shadow = {
  card: '0 1px 2px rgba(30,20,10,.05), 0 8px 22px -12px rgba(30,20,10,.15)',
} as const;

export const layout = {
  sidebarWidth: '236px',
  topbarHeight: '60px',
  railWidth: '296px',
  pageMax: '1320px',
} as const;

/* ------------------------------------------------------------------- utils */

type ClassValue = string | false | null | undefined;

/** Join class names, dropping falsy entries. */
export function cn(...values: ClassValue[]): string {
  return values.filter(Boolean).join(' ');
}

/* ---------------------------------------------------------------- aggregate */

export const tokens = {
  color,
  band,
  status,
  tone,
  font,
  text,
  leading,
  weight,
  space,
  radius,
  border,
  shadow,
  layout,
} as const;
