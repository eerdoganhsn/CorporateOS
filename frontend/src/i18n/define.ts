/** Same keys as the English source, with any string values. */
export type Shape<T> = { [K in keyof T]: T[K] extends string ? string : Shape<T[K]> }

/**
 * Declares one area's messages in every language. English is the source of truth for the
 * keys; Turkish and German must have exactly the same shape, which the compiler enforces.
 */
export function defineMessages<T extends object>(messages: { en: T; tr: NoInfer<Shape<T>>; de: NoInfer<Shape<T>> }) {
  return messages
}
