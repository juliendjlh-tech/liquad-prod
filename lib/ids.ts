// Public-id generator (Stripe-style: <prefix>_<8 random chars>).
// Internal UUIDs remain the primary key; this id is for user-facing surfaces.

const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const ID_LENGTH = 8;

function randomChars(length: number): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < length; i++) {
    out += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return out;
}

export const ID_PREFIXES = {
  bot: 'bot',
  catalog: 'cat',
  domain: 'dom',
  subscription: 'sub',
  apiKey: 'key',
  workspace: 'wks',
  gateway: 'gw',
  accessSettings: 'as',
} as const;

export type IdPrefix = (typeof ID_PREFIXES)[keyof typeof ID_PREFIXES];

const ALL_PREFIXES = Object.values(ID_PREFIXES);

export function generatePublicId(prefix: IdPrefix): string {
  return `${prefix}_${randomChars(ID_LENGTH)}`;
}

export function isPublicId(value: unknown, prefix?: IdPrefix): value is string {
  if (typeof value !== 'string') return false;
  const prefixes = prefix ? [prefix] : ALL_PREFIXES;
  const re = new RegExp(`^(${prefixes.join('|')})_[${ALPHABET}]{${ID_LENGTH},}$`);
  return re.test(value);
}
