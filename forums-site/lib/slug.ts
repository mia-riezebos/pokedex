export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')  // strip combining marks (diacritics)
    .replace(/[^a-z0-9\s-]/g, '')    // drop everything that isn't alnum/space/dash
    .trim()
    .replace(/\s+/g, '-')             // whitespace → dash
    .replace(/-+/g, '-')              // collapse consecutive dashes
    .replace(/^-+|-+$/g, '')          // trim leading/trailing dashes
    .slice(0, 60)
    .replace(/-+$/g, '');             // re-trim trailing dash after truncation
}
