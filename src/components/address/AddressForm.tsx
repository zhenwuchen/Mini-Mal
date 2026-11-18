"use client";

import Link from "next/link";
import { useActionState } from "react";

import {
  createAddressAction,
  updateAddressAction,
} from "@/app/actions/address";
import {
  initialAddressActionState,
  type AddressActionState,
} from "@/lib/address-action";
import type { AddressSummary } from "@/lib/address-service";
import { useFormValuePreservation } from "@/lib/form-value-preservation";

const inputClassName =
  "mt-2 min-h-12 w-full border border-rule bg-paper px-4 text-sm text-ink transition-colors placeholder:text-muted/55 hover:border-ink/40 focus-visible:border-earth";

type AddressFormProps =
  | {
      mode: "create";
      address?: never;
    }
  | {
      mode: "edit";
      address: AddressSummary;
    };

export function AddressForm(props: AddressFormProps) {
  const action =
    props.mode === "create"
      ? createAddressAction
      : updateAddressAction;
  const [state, formAction, pending] = useActionState<
    AddressActionState,
    FormData
  >(action, initialAddressActionState);
  const { formRef, preserveSubmittedValues } =
    useFormValuePreservation(
      state.status === "error" ? state : null,
    );
  const address = props.mode === "edit" ? props.address : null;
  const errors = state.fieldErrors;
  const prefix = props.mode === "create" ? "new" : "edit";

  return (
    <form
      ref={formRef}
      action={formAction}
      onSubmit={preserveSubmittedValues}
      noValidate
    >
      {address && (
        <input type="hidden" name="addressId" value={address.id} />
      )}

      {state.status === "error" && state.message && (
        <p
          role="alert"
          className="mb-7 border-l-2 border-earth bg-earth/6 px-4 py-3 text-sm leading-6 text-earth"
        >
          {state.message}
        </p>
      )}

      <div className="grid gap-5 sm:grid-cols-2">
        <AddressField
          id={`${prefix}-recipient-name`}
          name="recipientName"
          label="收件人"
          autoComplete="name"
          defaultValue={address?.recipientName}
          error={errors?.recipientName}
          required
        />
        <AddressField
          id={`${prefix}-phone`}
          name="phone"
          label="手机号"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          defaultValue={address?.phone}
          error={errors?.phone}
          required
        />
      </div>

      <div className="mt-5 grid gap-5 sm:grid-cols-3">
        <AddressField
          id={`${prefix}-province`}
          name="province"
          label="省份"
          autoComplete="address-level1"
          defaultValue={address?.province}
          error={errors?.province}
          required
        />
        <AddressField
          id={`${prefix}-city`}
          name="city"
          label="城市"
          autoComplete="address-level2"
          defaultValue={address?.city}
          error={errors?.city}
          required
        />
        <AddressField
          id={`${prefix}-district`}
          name="district"
          label="区县"
          autoComplete="address-level3"
          defaultValue={address?.district}
          error={errors?.district}
          required
        />
      </div>

      <div className="mt-5">
        <AddressField
          id={`${prefix}-address-line`}
          name="addressLine"
          label="详细地址"
          autoComplete="street-address"
          defaultValue={address?.addressLine}
          error={errors?.addressLine}
          required
        />
      </div>

      <div className="mt-5 max-w-[320px]">
        <AddressField
          id={`${prefix}-postal-code`}
          name="postalCode"
          label="邮政编码（选填）"
          inputMode="numeric"
          autoComplete="postal-code"
          defaultValue={address?.postalCode ?? ""}
          error={errors?.postalCode}
        />
      </div>

      <label className="mt-6 flex min-h-11 cursor-pointer items-center gap-3 border-y border-rule/80 py-3 text-sm text-ink">
        <input
          type="checkbox"
          name="isDefault"
          value="true"
          defaultChecked={address?.isDefault ?? true}
          className="size-4 accent-earth"
        />
        设为默认收货地址
      </label>
      {errors?.isDefault && (
        <p className="mt-2 text-xs leading-5 text-earth">
          {errors.isDefault}
        </p>
      )}

      <div className="mt-8 flex flex-wrap items-center gap-5">
        <button
          type="submit"
          disabled={pending}
          className="min-h-12 bg-ink px-7 text-[10px] font-medium tracking-[0.16em] text-white uppercase transition-colors hover:bg-earth disabled:cursor-wait disabled:bg-muted"
        >
          {pending
            ? "正在保存…"
            : props.mode === "create"
              ? "保存地址"
              : "保存修改"}
        </button>
        <Link
          href="/account/addresses"
          className="border-b border-ink pb-1 text-[10px] font-medium tracking-[0.12em] text-ink uppercase transition-colors hover:border-earth hover:text-earth"
        >
          取消
        </Link>
      </div>
    </form>
  );
}

function AddressField({
  id,
  name,
  label,
  type = "text",
  inputMode,
  autoComplete,
  defaultValue,
  error,
  required = false,
}: {
  id: string;
  name: string;
  label: string;
  type?: "text" | "tel";
  inputMode?: "numeric" | "tel";
  autoComplete?: string;
  defaultValue?: string;
  error?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label htmlFor={id} className="text-sm font-medium text-ink">
        {label}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        inputMode={inputMode}
        autoComplete={autoComplete}
        defaultValue={defaultValue}
        required={required}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        className={inputClassName}
      />
      {error && (
        <p id={`${id}-error`} className="mt-2 text-xs leading-5 text-earth">
          {error}
        </p>
      )}
    </div>
  );
}
