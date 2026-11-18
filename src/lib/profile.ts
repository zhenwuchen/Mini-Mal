export type ProfileInput = {
  name: string | null;
};

export type ProfileFormResult =
  | { success: true; data: ProfileInput }
  | { success: false; message: string };

const editableFields = new Set(["name"]);
const MAX_NAME_LENGTH = 60;

export function parseProfileForm(
  formData: FormData,
): ProfileFormResult {
  for (const key of formData.keys()) {
    if (key.startsWith("$ACTION_") || editableFields.has(key)) {
      continue;
    }

    return {
      success: false,
      message: "提交内容包含不可修改字段，请刷新页面后重试。",
    };
  }

  const rawName = formData.get("name");
  const name = typeof rawName === "string" ? rawName.trim() : "";

  if (/[\u0000-\u001f\u007f]/.test(name)) {
    return {
      success: false,
      message: "展示名称包含不支持的字符。",
    };
  }

  if (name.length > MAX_NAME_LENGTH) {
    return {
      success: false,
      message: `展示名称不能超过 ${MAX_NAME_LENGTH} 个字符。`,
    };
  }

  return {
    success: true,
    data: { name: name || null },
  };
}
