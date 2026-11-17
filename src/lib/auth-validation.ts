export type RegistrationInput = {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
};

export type RegistrationField =
  | "name"
  | "email"
  | "password"
  | "confirmPassword";

export type RegistrationFieldErrors = Partial<
  Record<RegistrationField, string>
>;

export type RegistrationValidationResult =
  | {
      success: true;
      data: {
        name: string;
        email: string;
        password: string;
      };
    }
  | {
      success: false;
      fieldErrors: RegistrationFieldErrors;
    };

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const specialCharacterPattern = /[^\p{L}\p{N}]/u;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  const normalized = normalizeEmail(email);
  return normalized.length <= 254 && emailPattern.test(normalized);
}

export function validatePassword(password: string): string | null {
  if (password.length < 10) {
    return "密码至少 10 位";
  }
  if (password.length > 128) {
    return "密码不能超过 128 位";
  }
  if (!/\p{L}/u.test(password) || !/\p{N}/u.test(password)) {
    return "密码需同时包含字母和数字";
  }
  if (!specialCharacterPattern.test(password)) {
    return "密码需包含至少一个特殊字符";
  }
  return null;
}

export function validateRegistrationInput(
  input: RegistrationInput,
): RegistrationValidationResult {
  const fieldErrors: RegistrationFieldErrors = {};
  const name = input.name.trim();
  const email = normalizeEmail(input.email);
  const passwordError = validatePassword(input.password);

  if (name.length < 2) {
    fieldErrors.name = "用户名至少 2 个字符";
  } else if (name.length > 50) {
    fieldErrors.name = "用户名不能超过 50 个字符";
  }

  if (!isValidEmail(email)) {
    fieldErrors.email = "请输入有效的邮箱地址";
  }

  if (passwordError) {
    fieldErrors.password = passwordError;
  }

  if (input.password !== input.confirmPassword) {
    fieldErrors.confirmPassword = "两次输入的密码不一致";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { success: false, fieldErrors };
  }

  return {
    success: true,
    data: {
      name,
      email,
      password: input.password,
    },
  };
}

export function sanitizeAuthRedirect(
  value: string | null | undefined,
  fallback = "/",
): string {
  const candidate = value?.trim();

  if (
    !candidate ||
    candidate.length > 2048 ||
    !candidate.startsWith("/") ||
    candidate.startsWith("//") ||
    candidate.includes("\\") ||
    /[\u0000-\u001f]/.test(candidate)
  ) {
    return fallback;
  }

  try {
    const url = new URL(candidate, "http://mini-mall.local");

    if (
      url.origin !== "http://mini-mall.local" ||
      url.pathname === "/login" ||
      url.pathname === "/register"
    ) {
      return fallback;
    }

    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}
