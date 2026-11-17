import type { RegistrationFieldErrors } from "@/lib/auth-validation";

export type AuthActionState = {
  status: "idle" | "error";
  message?: string;
  fieldErrors?: RegistrationFieldErrors;
};

export const initialAuthActionState: AuthActionState = {
  status: "idle",
};
