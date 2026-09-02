import { createLowlight } from "lowlight";
import bash from "highlight.js/lib/languages/bash";
import css from "highlight.js/lib/languages/css";
import diff from "highlight.js/lib/languages/diff";
import go from "highlight.js/lib/languages/go";
import java from "highlight.js/lib/languages/java";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import markdown from "highlight.js/lib/languages/markdown";
import plaintext from "highlight.js/lib/languages/plaintext";
import python from "highlight.js/lib/languages/python";
import rust from "highlight.js/lib/languages/rust";
import sql from "highlight.js/lib/languages/sql";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";

/**
 * Syntax highlighting, shared by the editor and by the reader.
 *
 * ONE registry for both, because a code block that is coloured one way while
 * being written and another way once published is worse than no colour at all.
 * The editor highlights through CodeBlockLowlight; the page highlights through
 * this same instance at render time.
 */
type Grammar = Parameters<ReturnType<typeof createLowlight>["register"]>[1];

const GRAMMARS: [value: string, label: string, grammar: Grammar][] = [
  ["bash", "Shell", bash as Grammar],
  ["javascript", "JavaScript", javascript as Grammar],
  ["typescript", "TypeScript", typescript as Grammar],
  ["json", "JSON", json as Grammar],
  ["css", "CSS", css as Grammar],
  ["xml", "HTML / XML", xml as Grammar],
  ["python", "Python", python as Grammar],
  ["java", "Java", java as Grammar],
  ["rust", "Rust", rust as Grammar],
  ["go", "Go", go as Grammar],
  ["sql", "SQL", sql as Grammar],
  ["markdown", "Markdown", markdown as Grammar],
  ["yaml", "YAML", yaml as Grammar],
  ["diff", "Diff", diff as Grammar],
];

export const lowlight = createLowlight();
for (const [value, , grammar] of GRAMMARS) lowlight.register(value, grammar);

/**
 * `plaintext` MUST be registered, even though it produces no colour.
 *
 * CodeBlockLowlight falls back to `highlightAuto()` for any language it does not
 * find registered. Since `plaintext` is also the default that every code block
 * with no language set resolves to, leaving it out means the editor cheerfully
 * GUESSES and colours a block as SQL while the reader, which refuses to guess,
 * ships it monochrome. The picker would say "Plain text" and the editor would
 * disagree with both it and the published article. Registering the no-op grammar
 * makes "plaintext" mean the same thing in all three places.
 */
lowlight.register("plaintext", plaintext as Grammar);

/** Offered in the picker, in the order a property blog actually uses them. */
export const CODE_LANGUAGES: { value: string; label: string }[] = [
  { value: "plaintext", label: "Plain text" },
  ...GRAMMARS.map(([value, label]) => ({ value, label })),
];

const REGISTERED = new Set(CODE_LANGUAGES.map((l) => l.value));

/**
 * Highlights to hast, or returns null when there is nothing to colour.
 *
 * Never `highlightAuto`. Guessing is how a shell snippet becomes Perl in one
 * paragraph and Ruby in the next, and the writer picked a language precisely so
 * nobody has to guess.
 */
export function highlightCode(code: string, language: string | null | undefined) {
  const lang = language ?? "plaintext";
  if (lang === "plaintext" || !REGISTERED.has(lang)) return null;
  try {
    return lowlight.highlight(lang, code);
  } catch {
    // An unregistered or broken grammar renders monochrome rather than throwing
    // a whole article away over a colour.
    return null;
  }
}
