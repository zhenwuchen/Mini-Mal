import assert from "node:assert/strict";
import test from "node:test";

import {
  sanitizeAuthRedirect,
  validateRegistrationInput,
} from "../src/lib/auth-validation";

test("normalizes valid registration data", () => {
  const result = validateRegistrationInput({
    name: "  Lin  ",
    email: "  LIN@Example.COM ",
    password: "GoodPass1!",
    confirmPassword: "GoodPass1!",
  });

  assert.equal(result.success, true);
  if (!result.success) return;

  assert.deepEqual(result.data, {
    name: "Lin",
    email: "lin@example.com",
    password: "GoodPass1!",
  });
});

test("rejects an invalid email address", () => {
  const result = validateRegistrationInput({
    name: "Lin",
    email: "not-an-email",
    password: "GoodPass1!",
    confirmPassword: "GoodPass1!",
  });

  assert.equal(result.success, false);
  if (result.success) return;
  assert.equal(result.fieldErrors.email, "请输入有效的邮箱地址");
});

test("rejects a weak password", () => {
  const result = validateRegistrationInput({
    name: "Lin",
    email: "lin@example.com",
    password: "Short1!",
    confirmPassword: "Short1!",
  });

  assert.equal(result.success, false);
  if (result.success) return;
  assert.match(result.fieldErrors.password ?? "", /至少 10 位/);
});

test("rejects mismatched password confirmation", () => {
  const result = validateRegistrationInput({
    name: "Lin",
    email: "lin@example.com",
    password: "GoodPass1!",
    confirmPassword: "OtherPass1!",
  });

  assert.equal(result.success, false);
  if (result.success) return;
  assert.equal(result.fieldErrors.confirmPassword, "两次输入的密码不一致");
});

test("accepts safe relative return paths", () => {
  assert.equal(
    sanitizeAuthRedirect("/products/ceramic-coffee-cup?from=login"),
    "/products/ceramic-coffee-cup?from=login",
  );
});

test("rejects external and protocol-relative return URLs", () => {
  assert.equal(sanitizeAuthRedirect("https://example.com/steal"), "/");
  assert.equal(sanitizeAuthRedirect("//example.com/steal"), "/");
  assert.equal(sanitizeAuthRedirect("/\\example.com/steal"), "/");
  assert.equal(sanitizeAuthRedirect("javascript:alert(1)"), "/");
});
