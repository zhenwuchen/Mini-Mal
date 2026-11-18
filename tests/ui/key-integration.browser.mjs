export async function runKeyIntegrationBrowserTest(page, baseUrl) {
  const harnessUrl = `${baseUrl}/ui-test-harness`;
  const scrollIntentKey = "minimal1:scroll-product-detail-to-top";
  const pageErrors = [];

  page.on("pageerror", (error) => {
    pageErrors.push(error.message);
  });

  function assert(condition, message) {
    if (!condition) {
      throw new Error(message);
    }
  }

  async function openHarness(target = "") {
    const suffix = target ? `?target=${encodeURIComponent(target)}` : "";
    await page.goto(`${harnessUrl}${suffix}`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForSelector('html[data-ui-test-ready="true"]');
  }

  async function fillFixture(form, values) {
    await form.locator('input[name="name"]').fill(values.name);
    await form.locator('input[name="email"]').fill(values.email);
    await form
      .locator(`input[name="addressId"][value="${values.address}"]`)
      .check();
  }

  async function waitForFixtureState(form, state) {
    await page.waitForFunction(
      ({ testId, expectedState }) =>
        document
          .querySelector(`[data-testid="${testId}"]`)
          ?.getAttribute("data-state") === expectedState,
      {
        testId: await form.getAttribute("data-testid"),
        expectedState: state,
      },
    );
  }

  await openHarness();

  const control = page.getByTestId("fixture-control");
  await fillFixture(control, {
    name: "控制组名称",
    email: "control@example.com",
    address: "address-b",
  });
  await control.getByRole("button", { name: "提交 fixture-control" }).click();
  await waitForFixtureState(control, "error");
  assert(
    (await control.locator('input[name="name"]').inputValue()) === "",
    "未接入恢复机制的表单应能证明 React Form Action 自动 reset",
  );

  const independent = page.getByTestId("fixture-independent");
  await fillFixture(independent, {
    name: "独立实例",
    email: "independent@example.com",
    address: "address-b",
  });

  const restored = page.getByTestId("fixture-restored");
  await fillFixture(restored, {
    name: "提交时名称",
    email: "submitted@example.com",
    address: "address-b",
  });
  await restored
    .getByRole("button", { name: "提交 fixture-restored" })
    .click();
  await page.waitForFunction(() => {
    const form = document.querySelector(
      '[data-testid="fixture-restored"]',
    );
    return form?.getAttribute("data-pending") === "true";
  });

  await restored
    .locator('input[name="name"]')
    .fill("等待期间最新名称");
  await restored
    .locator('input[name="addressId"][value="address-a"]')
    .check();

  await waitForFixtureState(restored, "error");
  assert(
    (await restored.locator('input[name="name"]').inputValue()) ===
      "等待期间最新名称",
    "错误返回后应保留 pending 期间的最新文本输入",
  );
  assert(
    (await restored.locator('input[name="email"]').inputValue()) ===
      "submitted@example.com",
    "未在 pending 期间修改的字段应恢复提交时的值",
  );
  assert(
    await restored
      .locator('input[name="addressId"][value="address-a"]')
      .isChecked(),
    "错误返回后应保留 pending 期间最新选择的 radio",
  );

  assert(
    (await independent.locator('input[name="name"]').inputValue()) ===
      "独立实例",
    "多个表单实例的恢复状态不应互相覆盖",
  );

  const success = page.getByTestId("fixture-success");
  await fillFixture(success, {
    name: "成功后不应恢复",
    email: "success@example.com",
    address: "address-b",
  });
  await success
    .getByRole("button", { name: "提交 fixture-success" })
    .click();
  await waitForFixtureState(success, "success");
  assert(
    (await success.locator('input[name="name"]').inputValue()) === "",
    "Action 成功后不应恢复旧输入",
  );

  const checkout = page.getByTestId("checkout-harness");
  const checkoutRadios = checkout.locator(
    'input[name="addressId"]',
  );
  let releaseCheckoutRequest;
  let markCheckoutRequestSeen;
  let checkoutRequestSeen = false;
  const checkoutRequestGate = new Promise((resolve) => {
    releaseCheckoutRequest = resolve;
  });
  const checkoutRequestObserved = new Promise((resolve) => {
    markCheckoutRequestSeen = resolve;
  });

  await page.route("**/*", async (route) => {
    if (
      route.request().method() === "POST" &&
      route.request().url().includes("/ui-test-harness")
    ) {
      checkoutRequestSeen = true;
      markCheckoutRequestSeen();
      await checkoutRequestGate;
    }

    await route.continue();
  });

  await checkoutRadios.nth(0).check();
  await checkout
    .locator('input[name="checkoutKey"]')
    .evaluate((element) => {
      element.value = "";
    });
  await checkout
    .getByRole("button", { name: "提交订单" })
    .click();
  await Promise.race([
    checkoutRequestObserved,
    new Promise((_, reject) => {
      setTimeout(
        () => reject(new Error("Checkout Server Action request was not observed")),
        5_000,
      );
    }),
  ]);
  assert(checkoutRequestSeen, "CheckoutForm 应进入真实 pending 请求");
  await checkoutRadios.nth(1).check();
  releaseCheckoutRequest();
  await checkout.getByRole("alert").waitFor();
  await page.unroute("**/*");
  assert(
    await checkoutRadios.nth(1).isChecked(),
    "CheckoutForm 错误返回后应恢复用户选择的收货地址",
  );

  await openHarness();
  await page.evaluate(() => window.scrollTo(0, 900));
  await page.getByLabel("打开同类精选商品").click();
  await page.waitForURL("**/ui-test-harness?target=scrolled");
  await page.waitForFunction(() => window.scrollY === 0);
  assert(
    (await page.evaluate((key) => sessionStorage.getItem(key), scrollIntentKey)) ===
      null,
    "滚动意图消费后应清除，不能重复触发",
  );

  await openHarness();
  await page.getByLabel("打开普通商品列表").click();
  await page.waitForURL("**/ui-test-harness?target=ordinary");
  assert(
    (await page.evaluate((key) => sessionStorage.getItem(key), scrollIntentKey)) ===
      null,
    "普通商品列表导航不应产生滚动意图",
  );

  await openHarness();
  await page.evaluate(() => {
    window.__scrollResetProbe = {
      token: null,
      cancelled: [],
    };
    window.requestAnimationFrame = () => {
      window.__scrollResetProbe.token = 4242;
      return 4242;
    };
    window.cancelAnimationFrame = (token) => {
      window.__scrollResetProbe.cancelled.push(token);
    };
  });
  await page.getByRole("button", { name: "挂载滚动重置" }).click();
  await page
    .getByRole("button", { name: "触发新的滚动重置" })
    .click();
  await page.waitForFunction(
    () => window.__scrollResetProbe.token !== null,
  );
  await page.getByRole("button", { name: "卸载滚动重置" }).click();
  assert(
    await page.evaluate(
      () => window.__scrollResetProbe.cancelled.includes(4242),
    ),
    "组件卸载时应取消尚未执行的 requestAnimationFrame",
  );

  await openHarness();
  const errorsBeforeStorageFailure = pageErrors.length;
  await page.evaluate(() => {
    Object.defineProperty(window, "sessionStorage", {
      configurable: true,
      get() {
        throw new DOMException("Storage blocked", "SecurityError");
      },
    });
  });
  await page.evaluate(() => window.scrollTo(0, 900));
  await page.getByLabel("打开同类精选商品").click();
  await page.waitForURL("**/ui-test-harness?target=scrolled");
  await page.waitForTimeout(300);
  assert(
    pageErrors.length === errorsBeforeStorageFailure,
    `存储不可用时不应产生页面异常：${pageErrors.slice(
      errorsBeforeStorageFailure,
    ).join("; ")}`,
  );

  return {
    ok: true,
    assertions: 12,
  };
}
