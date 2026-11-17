export const ORDER_PAYMENT_WINDOW_MS = 30 * 60 * 1_000;

export function calculateOrderExpiresAt(
  serverNow: Date,
): Date {
  return new Date(
    serverNow.getTime() + ORDER_PAYMENT_WINDOW_MS,
  );
}

export function isOrderExpired(
  expiresAt: Date | null,
  serverNow: Date,
): boolean {
  return (
    expiresAt !== null &&
    serverNow.getTime() >= expiresAt.getTime()
  );
}
