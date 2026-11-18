import { isValidLocalImagePath } from "@/lib/image-path";

export type AdminProductInput = {
  name: string;
  description: string | null;
  price: number;
  imageUrl: string | null;
  stock: number;
  categoryId: string;
  isActive: boolean;
};

export type AdminProductField =
  | "name"
  | "description"
  | "price"
  | "imageUrl"
  | "stock"
  | "categoryId";

export type AdminProductFieldErrors = Partial<
  Record<AdminProductField, string>
>;

export type AdminProductFormResult =
  | { success: true; data: AdminProductInput }
  | { success: false; errors: AdminProductFieldErrors };

export type AdminProductStatusFilter = "all" | "active" | "inactive";

export type AdminProductSearch = {
  q: string;
  categoryId: string | undefined;
  status: AdminProductStatusFilter;
  page: number;
};

type RawSearchParams = Record<
  string,
  string | string[] | undefined
>;

const MAX_DATABASE_INTEGER = 2_147_483_647;
const PRODUCT_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const PRICE_PATTERN = /^(\d{1,10})(?:\.(\d{1,2}))?$/;
const STOCK_PATTERN = /^\d{1,10}$/;

const firstValue = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

function formString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function parsePrice(value: string): number | null {
  const match = PRICE_PATTERN.exec(value);

  if (!match) {
    return null;
  }

  const yuan = Number(match[1]);
  const cents = Number((match[2] ?? "").padEnd(2, "0"));
  const price = yuan * 100 + cents;

  if (
    !Number.isSafeInteger(price) ||
    price < 0 ||
    price > MAX_DATABASE_INTEGER
  ) {
    return null;
  }

  return price;
}

function parseStock(value: string): number | null {
  if (!STOCK_PATTERN.test(value)) {
    return null;
  }

  const stock = Number(value);

  if (
    !Number.isSafeInteger(stock) ||
    stock < 0 ||
    stock > MAX_DATABASE_INTEGER
  ) {
    return null;
  }

  return stock;
}

export function parseAdminProductForm(
  formData: FormData,
): AdminProductFormResult {
  const name = formString(formData, "name");
  const description = formString(formData, "description");
  const priceText = formString(formData, "price");
  const imageUrl = formString(formData, "imageUrl");
  const stockText = formString(formData, "stock");
  const categoryId = formString(formData, "categoryId");
  const isActive = formString(formData, "isActive") === "true";
  const errors: AdminProductFieldErrors = {};
  const price = parsePrice(priceText);
  const stock = parseStock(stockText);

  if (!name) {
    errors.name = "请输入商品名称";
  } else if (name.length > 120) {
    errors.name = "商品名称不能超过 120 个字符";
  }

  if (description.length > 2_000) {
    errors.description = "商品描述不能超过 2000 个字符";
  }

  if (price === null) {
    errors.price = "价格必须是大于等于 0 的合法金额，最多保留两位小数";
  }

  if (stock === null) {
    errors.stock = "库存必须是大于等于 0 的整数";
  }

  if (!PRODUCT_ID_PATTERN.test(categoryId)) {
    errors.categoryId = "请选择有效分类";
  }

  if (imageUrl.length > 500) {
    errors.imageUrl = "图片地址不能超过 500 个字符";
  } else if (imageUrl && !isValidLocalImagePath(imageUrl)) {
    errors.imageUrl =
      "图片地址必须是 /images/ 下的站内 JPG、PNG、WebP、AVIF 或 GIF 图片";
  }

  if (Object.keys(errors).length > 0) {
    return { success: false, errors };
  }

  return {
    success: true,
    data: {
      name,
      description: description || null,
      price: price as number,
      imageUrl: imageUrl || null,
      stock: stock as number,
      categoryId,
      isActive,
    },
  };
}

export function normalizeAdminProductSearchParams(
  params: RawSearchParams,
): AdminProductSearch {
  const status = firstValue(params.status);
  const category = firstValue(params.category)?.trim() ?? "";
  const pageValue = Number(firstValue(params.page));

  return {
    q: (firstValue(params.q) ?? "").trim(),
    categoryId:
      category && category !== "all" && PRODUCT_ID_PATTERN.test(category)
        ? category
        : undefined,
    status:
      status === "active" || status === "inactive"
        ? status
        : "all",
    page:
      Number.isSafeInteger(pageValue) && pageValue > 0
        ? pageValue
        : 1,
  };
}

export function formatAdminPriceInput(price: number): string {
  if (!Number.isSafeInteger(price) || price < 0) {
    return "0.00";
  }

  return `${Math.floor(price / 100)}.${String(price % 100).padStart(2, "0")}`;
}
