import {
  Prisma,
  type PrismaClient,
} from "@prisma/client";

export type ProfileErrorCode =
  | "PROFILE_NOT_FOUND"
  | "PROFILE_UPDATE_FAILED";

const profileErrorMessages: Record<ProfileErrorCode, string> = {
  PROFILE_NOT_FOUND: "当前账户不存在，请重新登录后再试。",
  PROFILE_UPDATE_FAILED: "个人资料保存失败，请稍后重试。",
};

export class ProfileError extends Error {
  readonly code: ProfileErrorCode;

  constructor(code: ProfileErrorCode) {
    super(profileErrorMessages[code]);
    this.name = "ProfileError";
    this.code = code;
  }
}

export type UserProfile = {
  id: string;
  name: string | null;
  email: string;
  role: string;
};

export type ProfileService = {
  getProfile(userId: string): Promise<UserProfile>;
  updateName(
    userId: string,
    name: string | null,
  ): Promise<UserProfile>;
};

type ProfileServiceDependencies = {
  prisma: PrismaClient;
};

const profileSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
} satisfies Prisma.UserSelect;

export function createProfileService({
  prisma,
}: ProfileServiceDependencies): ProfileService {
  async function getProfile(userId: string): Promise<UserProfile> {
    const profile = await prisma.user.findUnique({
      where: { id: userId },
      select: profileSelect,
    });

    if (!profile) {
      throw new ProfileError("PROFILE_NOT_FOUND");
    }

    return profile;
  }

  async function updateName(
    userId: string,
    name: string | null,
  ): Promise<UserProfile> {
    try {
      return await prisma.user.update({
        where: { id: userId },
        data: { name },
        select: profileSelect,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2025"
      ) {
        throw new ProfileError("PROFILE_NOT_FOUND");
      }

      if (error instanceof ProfileError) {
        throw error;
      }

      throw new ProfileError("PROFILE_UPDATE_FAILED");
    }
  }

  return { getProfile, updateName };
}
