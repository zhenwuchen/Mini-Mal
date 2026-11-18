export const HEADER_SEARCH_MAX_LENGTH = 80;

export function normalizeHeaderSearchQuery(value: unknown): string {
  return typeof value === "string"
    ? value.trim().slice(0, HEADER_SEARCH_MAX_LENGTH)
    : "";
}

export function buildHeaderSearchHref(value: unknown): string {
  const query = normalizeHeaderSearchQuery(value);
  const params = new URLSearchParams();

  if (query) {
    params.set("search", query);
  }
  params.set("focus", "search");

  return `/products?${params.toString()}`;
}
