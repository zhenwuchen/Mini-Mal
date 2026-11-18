const LOCAL_IMAGE_PATTERN =
  /^\/images\/(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+\.(?:avif|gif|jpe?g|png|webp)$/i;

export function isValidLocalImagePath(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 500 ||
    value.trim() !== value ||
    value.includes("\\") ||
    value.includes("%") ||
    !value.startsWith("/images/") ||
    !LOCAL_IMAGE_PATTERN.test(value)
  ) {
    return false;
  }

  return value
    .split("/")
    .every((segment) => segment !== "." && segment !== "..");
}

export function normalizeLocalImagePath(
  value: unknown,
  fallback: string,
): string {
  return isValidLocalImagePath(value) ? value : fallback;
}
