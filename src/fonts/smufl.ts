// SMuFL's glyph names, loaded the first time they are needed, and writing characters as names.

export interface SmuflNames {
  /** The code point a name is at; undefined for a name SMuFL hasn't got. */
  codePoint(name: string): number | undefined;
  /** The name at a code point; undefined where SMuFL has none. */
  nameOf(cp: number): string | undefined;
  /** The names containing `query` (ignoring case), each with its code point, in SMuFL's order. */
  search(query: string): { name: string; cp: number }[];
}

let loading: Promise<SmuflNames> | undefined;

/** The names, loading them (a chunk of its own) the first time. */
export function smuflNames(): Promise<SmuflNames> {
  if (!loading) {
    loading = import('./smufl-names.json').then((m) => _namesFrom(m.default as Record<string, number>));
    loading.catch(() => { loading = undefined; });
  }
  return loading;
}

/** Make SmuflNames from the JSON's object. Pure; what smuflNames uses, exported for tests. */
export function _namesFrom(table: Record<string, number>): SmuflNames {
  const entries = Object.entries(table);
  const byCodePoint = new Map<number, string>();
  // A code point with two names keeps the first.
  for (const [name, cp] of entries) if (!byCodePoint.has(cp)) byCodePoint.set(cp, name);
  return {
    codePoint: (name) => (Object.hasOwn(table, name) ? table[name] : undefined),
    nameOf: (cp) => byCodePoint.get(cp),
    search(query) {
      const q = query.toLowerCase();
      return entries.filter(([name]) => name.toLowerCase().includes(q)).map(([name, cp]) => ({ name, cp }));
    },
  };
}

/**
 * `text` with each Private Use Area character (U+E000 to U+F8FF) SMuFL names written as its name,
 * separated from what is next to it by one space; other characters as they are.
 * "" gives "fingering4 fingeringSubstitutionDash fingering5". Pure.
 */
export function smuflText(text: string, names: SmuflNames): string {
  const parts: string[] = [];
  let plain = '';
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    const name = cp >= 0xe000 && cp <= 0xf8ff ? names.nameOf(cp) : undefined;
    if (name === undefined) plain += ch;
    else {
      if (plain) parts.push(plain);
      plain = '';
      parts.push(name);
    }
  }
  if (plain) parts.push(plain);
  return parts.join(' ');
}
