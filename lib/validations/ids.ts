import { z } from 'zod';
import type { IdPrefix } from '@/lib/ids';

const ALPHABET_CLASS = '[23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]';

export function publicId(prefix: IdPrefix) {
  return z
    .string()
    .regex(
      new RegExp(`^${prefix}_${ALPHABET_CLASS}{8,}$`),
      `must be a ${prefix}_ public id`,
    );
}
