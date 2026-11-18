export type AdminCategoryInput = {
  name: string;
  slug: string;
  description: string | null;
};

export type AdminCategoryFieldErrors = Partial<
  Record<"name" | "slug" | "description", string>
>;

export type AdminCategoryFormResult =
  | { success: true; data: AdminCategoryInput }
  | { success: false; errors: AdminCategoryFieldErrors };

const CATEGORY_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function formString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export function parseAdminCategoryForm(
  formData: FormData,
): AdminCategoryFormResult {
  const name = formString(formData, "name");
  const slug = formString(formData, "slug").toLowerCase();
  const description = formString(formData, "description");
  const errors: AdminCategoryFieldErrors = {};

  if (!name) {
    errors.name = "请输入分类名称";
  } else if (name.length > 60) {
    errors.name = "分类名称不能超过 60 个字符";
  }

  if (
    !slug ||
    slug.length > 64 ||
    !CATEGORY_SLUG_PATTERN.test(slug)
  ) {
    errors.slug = "标识只能包含小写字母、数字和单个连字符";
  }

  if (description.length > 300) {
    errors.description = "分类说明不能超过 300 个字符";
  }

  if (Object.keys(errors).length > 0) {
    return { success: false, errors };
  }

  return {
    success: true,
    data: {
      name,
      slug,
      description: description || null,
    },
  };
}
