"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { unstable_update } from "@/auth";
import { requireUser } from "@/lib/auth-session";
import { parseProfileForm } from "@/lib/profile";
import {
  createProfileService,
  ProfileError,
} from "@/lib/profile-service";
import type { ProfileActionState } from "@/lib/profile-action-state";
import { prisma } from "@/lib/prisma";

const profileService = createProfileService({ prisma });

export async function updateProfileAction(
  _previousState: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  const user = await requireUser("/account/profile");
  const parsed = parseProfileForm(formData);

  if (!parsed.success) {
    return { status: "error", message: parsed.message };
  }

  try {
    const profile = await profileService.updateName(
      user.id,
      parsed.data.name,
    );

    try {
      await unstable_update({
        user: { name: profile.name },
      });
    } catch {
      // The database remains authoritative; the profile page rereads it.
    }
  } catch (error) {
    if (error instanceof ProfileError) {
      return { status: "error", message: error.message };
    }

    return {
      status: "error",
      message: "个人资料保存失败，请稍后重试。",
    };
  }

  revalidatePath("/account");
  revalidatePath("/account/profile");
  redirect("/account/profile?saved=1");
}
