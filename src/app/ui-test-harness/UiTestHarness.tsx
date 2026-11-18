"use client";

import {
  useActionState,
  useEffect,
  useState,
} from "react";

import { CheckoutForm } from "@/components/checkout/CheckoutForm";
import { ProductCardLink } from "@/components/ProductCardLink";
import { ProductDetailScrollReset } from "@/components/ProductDetailScrollReset";
import { useFormValuePreservation } from "@/lib/form-value-preservation";
import { markProductDetailScrollIntent } from "@/lib/product-detail-scroll";

type FixtureActionState = {
  status: "idle" | "success" | "error";
  message?: string;
};

const initialFixtureActionState: FixtureActionState = {
  status: "idle",
};

async function fixtureAction(
  _previousState: FixtureActionState,
  formData: FormData,
): Promise<FixtureActionState> {
  const delay = Number(formData.get("delay") ?? 0);

  await new Promise((resolve) => window.setTimeout(resolve, delay));

  if (formData.get("outcome") === "success") {
    return {
      status: "success",
      message: "保存成功",
    };
  }

  return {
    status: "error",
    message: "模拟保存失败",
  };
}

function FixtureForm({
  id,
  outcome,
  preserveValues,
}: {
  id: string;
  outcome: "success" | "error";
  preserveValues: boolean;
}) {
  const [state, action, pending] = useActionState(
    fixtureAction,
    initialFixtureActionState,
  );
  const { formRef, preserveSubmittedValues } =
    useFormValuePreservation(
      preserveValues && state.status === "error" ? state : null,
    );

  return (
    <form
      ref={formRef}
      action={action}
      onSubmit={preserveSubmittedValues}
      data-testid={id}
      data-pending={pending ? "true" : "false"}
      data-state={state.status}
    >
      <fieldset>
        <legend>{id}</legend>
        <label>
          名称
          <input name="name" type="text" defaultValue="" />
        </label>
        <label>
          邮箱
          <input name="email" type="email" defaultValue="" />
        </label>
        <label>
          地址 A
          <input
            name="addressId"
            type="radio"
            value="address-a"
            defaultChecked
          />
        </label>
        <label>
          地址 B
          <input
            name="addressId"
            type="radio"
            value="address-b"
          />
        </label>
      </fieldset>
      <input type="hidden" name="delay" value="500" />
      <input type="hidden" name="outcome" value={outcome} />
      <button type="submit" disabled={pending}>
        {pending ? "保存中…" : `提交 ${id}`}
      </button>
      {state.status === "error" && state.message && (
        <p role="alert">{state.message}</p>
      )}
      {state.status === "success" && state.message && (
        <p role="status">{state.message}</p>
      )}
    </form>
  );
}

function ScrollResetLifecycleFixture() {
  const [mounted, setMounted] = useState(false);
  const [version, setVersion] = useState(0);

  return (
    <div>
      <button
        type="button"
        onClick={() => setMounted(true)}
      >
        挂载滚动重置
      </button>
      <button
        type="button"
        onClick={() => setMounted(false)}
      >
        卸载滚动重置
      </button>
      <button
        type="button"
        onClick={() => {
          markProductDetailScrollIntent();
          setVersion((current) => current + 1);
        }}
      >
        触发新的滚动重置
      </button>
      {mounted && (
        <ProductDetailScrollReset slug={`cancel-frame-${version}`} />
      )}
    </div>
  );
}

export function UiTestHarness({ target }: { target: string }) {
  useEffect(() => {
    document.documentElement.dataset.uiTestReady = "true";

    return () => {
      delete document.documentElement.dataset.uiTestReady;
    };
  }, []);

  return (
    <main
      className="mx-auto max-w-5xl space-y-12 px-6 py-12"
    >
      {target === "scrolled" && (
        <ProductDetailScrollReset slug="integration-detail" />
      )}

      <section>
        <h1>表单恢复集成测试</h1>
        <FixtureForm
          id="fixture-control"
          outcome="error"
          preserveValues={false}
        />
        <FixtureForm
          id="fixture-restored"
          outcome="error"
          preserveValues
        />
        <FixtureForm
          id="fixture-success"
          outcome="success"
          preserveValues
        />
        <FixtureForm
          id="fixture-independent"
          outcome="error"
          preserveValues
        />
      </section>

      <section data-testid="checkout-harness">
        <h2>结账表单集成测试</h2>
        <CheckoutForm
          checkoutKey="valid-checkout-key"
          ready
          totalAmount={8_800}
          addresses={[
            {
              id: "address-a",
              recipientName: "默认地址",
              phone: "13800000000",
              province: "上海市",
              city: "上海市",
              district: "浦东新区",
              addressLine: "测试路 1 号",
              postalCode: "200000",
              isDefault: true,
            },
            {
              id: "address-b",
              recipientName: "备选地址",
              phone: "13900000000",
              province: "浙江省",
              city: "杭州市",
              district: "西湖区",
              addressLine: "测试路 2 号",
              postalCode: "310000",
              isDefault: false,
            },
          ]}
          items={[
            {
              id: "product-a",
              name: "测试商品",
              slug: "test-product",
              imageUrl: "/images/categories/home-living.jpg",
              price: 8_800,
              quantity: 1,
              subtotal: 8_800,
            },
          ]}
        />
      </section>

      <section>
        <h2>商品详情滚动集成测试</h2>
        <ProductCardLink
          href="/ui-test-harness?target=scrolled"
          ariaLabel="打开同类精选商品"
          className="block border-b border-ink py-2"
          scrollToTopOnNavigate
        >
          同类精选商品
        </ProductCardLink>
        <ProductCardLink
          href="/ui-test-harness?target=ordinary"
          ariaLabel="打开普通商品列表"
          className="mt-4 block border-b border-ink py-2"
        >
          普通商品列表
        </ProductCardLink>
        <ScrollResetLifecycleFixture />
      </section>

      <div
        data-testid="scroll-tail"
        aria-hidden="true"
        style={{ height: "2600px" }}
      />
    </main>
  );
}
