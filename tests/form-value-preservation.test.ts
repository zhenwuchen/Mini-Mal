import assert from "node:assert/strict";
import test from "node:test";

import {
  captureFormValues,
  restoreFormValues,
  type RestorableFormControl,
} from "../src/lib/form-value-preservation";

function control(
  values: Partial<RestorableFormControl>,
): RestorableFormControl {
  return {
    type: "text",
    value: "",
    checked: false,
    disabled: false,
    ...values,
  };
}

test("restores the values that were submitted before a form was reset", () => {
  const controls = [
    control({ type: "text", value: "验收用户" }),
    control({ type: "email", value: "user@example.com" }),
    control({ type: "checkbox", value: "true", checked: true }),
  ];
  const snapshot = captureFormValues(controls);

  controls[0].value = "";
  controls[1].value = "";
  controls[2].checked = false;
  restoreFormValues(controls, snapshot);

  assert.equal(controls[0].value, "验收用户");
  assert.equal(controls[1].value, "user@example.com");
  assert.equal(controls[2].checked, true);
});

test("restores parallel controls without changing their order", () => {
  const controls = [
    control({ type: "radio", value: "address-a", checked: false }),
    control({ type: "radio", value: "address-b", checked: true }),
    control({ type: "submit", value: "提交" }),
  ];
  const snapshot = captureFormValues(controls);

  controls[0].checked = true;
  controls[1].checked = false;
  controls[2].value = "";
  restoreFormValues(controls, snapshot);

  assert.deepEqual(
    controls.map(({ value, checked }) => ({ value, checked })),
    [
      { value: "address-a", checked: false },
      { value: "address-b", checked: true },
      { value: "提交", checked: false },
    ],
  );
});

test("restores controls with the same name independently", () => {
  const controls = [
    control({ type: "text", value: "第一项" }),
    control({ type: "text", value: "第二项" }),
  ];
  const snapshot = captureFormValues(controls);

  controls[0].value = "";
  controls[1].value = "";
  restoreFormValues(controls, snapshot);

  assert.deepEqual(
    controls.map(({ value }) => value),
    ["第一项", "第二项"],
  );
});

test("restores edits made after submission without overriding them", () => {
  const controls = [
    control({ type: "text", value: "提交时名称" }),
    control({ type: "textarea", value: "提交时说明" }),
    control({ type: "radio", value: "address-a", checked: true }),
    control({ type: "radio", value: "address-b", checked: false }),
  ];
  const snapshot = captureFormValues(controls);

  controls[0].value = "";
  controls[1].value = "";
  controls[2].checked = false;
  controls[3].checked = false;
  restoreFormValues(controls, snapshot, new Map([
    [snapshot[0].key, control({ type: "text", value: "等待期间的新名称" })],
    [snapshot[1].key, control({ type: "textarea", value: "等待期间的新说明" })],
    [
      snapshot[2].key,
      control({ type: "radio", value: "address-a", checked: false }),
    ],
    [
      snapshot[3].key,
      control({ type: "radio", value: "address-b", checked: true }),
    ],
  ]));

  assert.deepEqual(
    controls.map(({ value, checked }) => ({ value, checked })),
    [
      { value: "等待期间的新名称", checked: false },
      { value: "等待期间的新说明", checked: false },
      { value: "address-a", checked: false },
      { value: "address-b", checked: true },
    ],
  );
});

test("restores every supported control type", () => {
  const controls = [
    control({ type: "text", value: "名称" }),
    control({ type: "email", value: "user@example.com" }),
    control({ type: "password", value: "secret-value" }),
    control({ type: "number", value: "88.50" }),
    control({ type: "textarea", value: "多行\n说明" }),
    control({ type: "select-one", value: "fashion" }),
    control({ type: "checkbox", value: "true", checked: true }),
    control({ type: "radio", value: "address-b", checked: true }),
  ];
  const snapshot = captureFormValues(controls);

  controls.forEach((current) => {
    current.value = "";
    if ("checked" in current) current.checked = false;
  });
  restoreFormValues(controls, snapshot);

  assert.deepEqual(
    controls.map(({ value, checked }) => ({ value, checked })),
    [
      { value: "名称", checked: false },
      { value: "user@example.com", checked: false },
      { value: "secret-value", checked: false },
      { value: "88.50", checked: false },
      { value: "多行\n说明", checked: false },
      { value: "fashion", checked: false },
      { value: "true", checked: true },
      { value: "address-b", checked: true },
    ],
  );
});

test("restores values after React changes the form control list", () => {
  const controls = [
    control({ type: "text", name: "name", value: "名称" }),
    control({ type: "email", name: "email", value: "user@example.com" }),
  ];
  const snapshot = captureFormValues(controls);
  const hiddenActionField = control({
    type: "hidden",
    name: "$ACTION_INTERNAL",
    value: "",
  });
  const currentControls = [hiddenActionField, ...controls];

  controls[0].value = "";
  controls[1].value = "";
  restoreFormValues(currentControls, snapshot);

  assert.equal(controls[0].value, "名称");
  assert.equal(controls[1].value, "user@example.com");
});
