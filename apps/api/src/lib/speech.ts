export function joinStreamDelta(accumulated: string, next: string) {
  const needsSpace =
    accumulated.length > 0 &&
    !/\s$/.test(accumulated) &&
    !/^\s/.test(next) &&
    !/^[,.;:!?)]/.test(next);
  return `${needsSpace ? " " : ""}${next}`;
}

export function pullSpeakable(
  buffer: string,
  final: boolean,
): { ready: string[]; rest: string } {
  const ready: string[] = [];
  let rest = buffer;

  while (rest.length > 0) {
    const match = rest.match(/^[\s\S]*?[.!?]/);
    if (!match?.[0]) break;
    const sentence = match[0].trim();
    if (!sentence) break;
    ready.push(sentence);
    rest = rest.slice(match[0].length).replace(/^\s+/, "");
  }

  if (!final && rest.length >= 36) {
    const cut = rest.lastIndexOf(" ", 48);
    if (cut >= 12) {
      ready.push(rest.slice(0, cut).trim());
      rest = rest.slice(cut + 1);
    }
  }

  if (final && rest.trim()) ready.push(rest.trim());
  return { ready, rest: final ? "" : rest };
}
