const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(?:^-+)|(?:-+$)/g, '');
}

export function extractUuid(token: string): string {
  if (token.length >= 36) {
    const suffix = token.slice(-36);
    if (UUID_RE.test(suffix)) return suffix;
  }
  return token;
}
