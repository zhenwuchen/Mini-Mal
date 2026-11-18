import assert from "node:assert/strict";
import test from "node:test";

import { createIsolatedAdminTestDatabase } from "./helpers/test-database";
import {
  AdminCategoryError,
  createAdminCategoryService,
} from "../src/lib/admin-category-service";
import { parseAdminCategoryForm } from "../src/lib/admin-category";

const database = createIsolatedAdminTestDatabase();
const service = createAdminCategoryService({ prisma: database.prisma });

function categoryForm(
  overrides: Record<string, string> = {},
): FormData {
  const form = new FormData();
  form.set("name", "家居香氛");
  form.set("slug", "home-fragrance");
  form.set("description", "适合日常空间的香气。");

  for (const [key, value] of Object.entries(overrides)) {
    form.set(key, value);
  }

  return form;
}

test.before(async () => {
  await database.initialize();
});

test.after(async () => {
  await database.cleanup();
});

test("validates category names and URL-safe slugs", () => {
  const parsed = parseAdminCategoryForm(categoryForm());
  assert.equal(parsed.success, true);
  if (!parsed.success) return;
  assert.deepEqual(parsed.data, {
    name: "家居香氛",
    slug: "home-fragrance",
    description: "适合日常空间的香气。",
  });

  for (const slug of ["", "Home Fragrance", "中文-slug", "-bad", "bad-"]) {
    const result = parseAdminCategoryForm(categoryForm({ slug }));
    assert.equal(result.success, false);
    assert.match(result.errors.slug ?? "", /标识/);
  }
});

test("creates, updates, and counts categories", async () => {
  const created = await service.create({
    name: "办公桌面",
    slug: "admin-office-desk",
    description: null,
  });
  const updated = await service.update(created.id, {
    name: "办公收纳",
    slug: "admin-office-storage",
    description: "安静的桌面收纳。",
  });
  const categories = await service.list();
  const saved = categories.find((category) => category.id === created.id);

  assert.equal(updated.id, created.id);
  assert.ok(saved);
  assert.equal(saved.name, "办公收纳");
  assert.equal(saved.slug, "admin-office-storage");
  assert.equal(saved.productCount, 0);
});

test("rejects duplicate slugs with a safe domain error", async () => {
  await service.create({
    name: "第一个分类",
    slug: "admin-duplicate-slug",
    description: null,
  });

  await assert.rejects(
    service.create({
      name: "第二个分类",
      slug: "admin-duplicate-slug",
      description: null,
    }),
    (error) => {
      assert.ok(error instanceof AdminCategoryError);
      assert.equal(error.code, "CATEGORY_SLUG_EXISTS");
      assert.doesNotMatch(error.message, /Prisma|SQL|stack/i);
      return true;
    },
  );
});

test("refuses to delete a category that still owns products", async () => {
  const category = await service.create({
    name: "不能删除分类",
    slug: "admin-category-with-product",
    description: null,
  });
  await database.prisma.product.create({
    data: {
      name: "分类内商品",
      slug: "admin-category-product",
      price: 100,
      stock: 1,
      categoryId: category.id,
    },
  });

  await assert.rejects(service.delete(category.id), (error) => {
    assert.ok(error instanceof AdminCategoryError);
    assert.equal(error.code, "CATEGORY_HAS_PRODUCTS");
    return true;
  });
  assert.equal(
    await database.prisma.category.count({
      where: { id: category.id },
    }),
    1,
  );
});
