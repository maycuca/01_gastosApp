export const MAX_TAGS = 10
export const MAX_TAG_LENGTH = 30

/** Same normalization the backend applies: trimmed and lowercase. */
export function normalizeTag(raw: string): string {
  return raw.trim().toLowerCase()
}

/** Splits free text on commas, normalizes and removes blanks and duplicates. */
export function parseTags(raw: string): string[] {
  const result: string[] = []
  for (const part of raw.split(',')) {
    const tag = normalizeTag(part)
    if (tag !== '' && !result.includes(tag)) result.push(tag)
  }
  return result
}

/** Adds the tags typed in `raw` to `current`, without duplicates. */
export function mergeTags(current: readonly string[], raw: string): string[] {
  const result = [...current]
  for (const tag of parseTags(raw)) {
    if (!result.includes(tag)) result.push(tag)
  }
  return result
}
