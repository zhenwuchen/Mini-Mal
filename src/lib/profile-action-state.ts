export type ProfileActionState = {
  status: "idle" | "error";
  message?: string;
};

export const initialProfileActionState: ProfileActionState = {
  status: "idle",
};
