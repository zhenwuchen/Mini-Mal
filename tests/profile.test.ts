import assert from "node:assert/strict";
import test from "node:test";

import { createIsolatedProfileTestDatabase } from "./helpers/test-database";
import {
  createProfileService,
  ProfileError,
} from "../src/lib/profile-service";
import { parseProfileForm } from "../src/lib/profile";

const database = createIsolatedProfileTestDatabase();
const profiles = createProfileService({ prisma: database.prisma });
const prefix = `phase07-profile-${process.pid}-${Date.now()}`;

test.before(async () => {
  await database.initialize();
});

test.after(async () => {
  await database.cleanup();
});

function form(values: Record<string, string>) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(values)) {
    formData.set(key, value);
  }
  return formData;
}

async function createUser(label: string) {
  return database.prisma.user.create({
    data: {
      name: `原资料 ${label}`,
      email: `${prefix}-${label}@example.com`,
      passwordHash: "unchanged-password-hash",
      role: "USER",
    },
  });
}

test("parses the editable display name and ignores action metadata", () => {
  const parsed = parseProfileForm(
    form({
      name: "  新展示名称  ",
      "$ACTION_ID_example": "",
    }),
  );

  assert.equal(parsed.success, true);
  if (!parsed.success) return;
  assert.equal(parsed.data.name, "新展示名称");
});

test("rejects sensitive identity and role fields", () => {
  for (const field of ["userId", "email", "role", "passwordHash"]) {
    const parsed = parseProfileForm(
      form({ name: "合法名称", [field]: "forged" }),
    );

    assert.equal(parsed.success, false);
    assert.match(parsed.message, /不可修改/);
  }
});

test("rejects overlong names and control characters", () => {
  assert.equal(
    parseProfileForm(form({ name: "名".repeat(61) })).success,
    false,
  );
  assert.equal(
    parseProfileForm(form({ name: "坏\u0000名称" })).success,
    false,
  );
});

test("updates only the current user's name", async () => {
  const current = await createUser("current");
  const other = await createUser("other");
  const parsed = parseProfileForm(form({ name: "更新后的名称" }));
  assert.equal(parsed.success, true);
  if (!parsed.success) return;

  const updated = await profiles.updateName(current.id, parsed.data.name);
  const savedCurrent =
    await database.prisma.user.findUniqueOrThrow({
      where: { id: current.id },
    });
  const savedOther = await database.prisma.user.findUniqueOrThrow({
    where: { id: other.id },
  });

  assert.equal(updated.name, "更新后的名称");
  assert.equal(savedCurrent.name, "更新后的名称");
  assert.equal(savedCurrent.email, current.email);
  assert.equal(savedCurrent.passwordHash, current.passwordHash);
  assert.equal(savedCurrent.role, "USER");
  assert.equal(savedOther.name, other.name);
});

test("allows clearing an optional display name", async () => {
  const user = await createUser("clear");
  const parsed = parseProfileForm(form({ name: "   " }));
  assert.equal(parsed.success, true);
  if (!parsed.success) return;

  const updated = await profiles.updateName(user.id, parsed.data.name);
  assert.equal(updated.name, null);
});

test("returns a safe error when the current user no longer exists", async () => {
  await assert.rejects(
    profiles.updateName("missing-user", "不会写入"),
    (error) => {
      assert.ok(error instanceof ProfileError);
      assert.equal(error.code, "PROFILE_NOT_FOUND");
      assert.doesNotMatch(error.message, /Prisma|SQL|stack/i);
      return true;
    },
  );
});
