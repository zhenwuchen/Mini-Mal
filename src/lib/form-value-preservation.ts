"use client";

import {
  useEffect,
  useRef,
} from "react";

export type RestorableFormControl = {
  type: string;
  name?: string;
  value: string;
  checked?: boolean;
  disabled?: boolean;
};

export type FormValueSnapshot = {
  key: string;
  type: string;
  name?: string;
  value: string;
  checked: boolean;
};

function isRestorableFormControl(
  element: Element,
): element is Element & RestorableFormControl {
  return (
    "type" in element &&
    "value" in element &&
    typeof element.type === "string" &&
    typeof element.value === "string"
  );
}

function getFormControls(
  form: HTMLFormElement,
): RestorableFormControl[] {
  return Array.from(form.elements).filter(
    isRestorableFormControl,
  );
}

function createFormControlKeys(
  controls: RestorableFormControl[],
): string[] {
  const occurrences = new Map<string, number>();

  return controls.map((control) => {
    // React may add or remove internal action fields between renders.
    // Match user controls by identity instead of their changing array index.
    const identity = `${control.type}\u0000${control.name ?? ""}`;
    const occurrence = occurrences.get(identity) ?? 0;

    occurrences.set(identity, occurrence + 1);
    return `${identity}\u0000${occurrence}`;
  });
}

function copyFormControl(
  control: RestorableFormControl,
): RestorableFormControl {
  return {
    type: control.type,
    name: control.name,
    value: control.value,
    checked: control.checked,
    disabled: control.disabled,
  };
}

export function captureFormValues(
  controls: Iterable<RestorableFormControl>,
): FormValueSnapshot[] {
  const controlList = Array.from(controls);
  const keys = createFormControlKeys(controlList);

  return controlList.map((control, index) => ({
    key: keys[index],
    type: control.type,
    name: control.name,
    value: control.value,
    checked: control.checked ?? false,
  }));
}

export function restoreFormValues(
  controls: Iterable<RestorableFormControl>,
  snapshot: FormValueSnapshot[],
  latestValues?: ReadonlyMap<string, RestorableFormControl>,
) {
  const controlList = Array.from(controls);
  const keys = createFormControlKeys(controlList);
  const snapshotByKey = new Map(
    snapshot.map((value) => [value.key, value]),
  );

  controlList.forEach((control, index) => {
    const key = keys[index];
    const saved = latestValues?.get(key) ?? snapshotByKey.get(key);

    if (!saved || control.type !== saved.type) return;

    control.value = saved.value;

    if ("checked" in control) {
      control.checked = saved.checked;
    }
  }, []);
}

export function useFormValuePreservation(
  restoreToken: unknown = null,
) {
  const formRef = useRef<HTMLFormElement>(null);
  const snapshotRef = useRef<FormValueSnapshot[] | null>(null);
  const latestValuesRef = useRef(
    new Map<string, RestorableFormControl>(),
  );

  useEffect(() => {
    const form = formRef.current;

    if (!form) return;
    const activeForm = form;

    function captureLatestValue(event: Event) {
      if (!snapshotRef.current) return;

      const target = event.target;

      if (!(target instanceof Element)) return;

      const controls = getFormControls(activeForm);
      const keys = createFormControlKeys(controls);
      const controlIndex = controls.indexOf(
        target as Element & RestorableFormControl,
      );

      if (controlIndex < 0) return;

      const control = controls[controlIndex];

      if (control.type === "radio" && control.name) {
        controls.forEach((candidate, index) => {
          if (
            candidate.type === "radio" &&
            candidate.name === control.name
          ) {
            latestValuesRef.current.set(
              keys[index],
              copyFormControl(candidate),
            );
          }
        });
        return;
      }

      latestValuesRef.current.set(
        keys[controlIndex],
        copyFormControl(control),
      );
    }

    activeForm.addEventListener("input", captureLatestValue);
    activeForm.addEventListener("change", captureLatestValue);

    return () => {
      activeForm.removeEventListener("input", captureLatestValue);
      activeForm.removeEventListener("change", captureLatestValue);
    };
  }, []);

  useEffect(() => {
    if (
      !restoreToken ||
      !formRef.current ||
      !snapshotRef.current
    ) {
      return;
    }

    restoreFormValues(
      getFormControls(formRef.current),
      snapshotRef.current,
      latestValuesRef.current,
    );

    latestValuesRef.current.clear();
    snapshotRef.current = null;
  }, [restoreToken]);

  function preserveSubmittedValues() {
    if (!formRef.current) return;

    latestValuesRef.current.clear();

    const form = formRef.current;
    const controls = getFormControls(form);
    snapshotRef.current = captureFormValues(
      controls,
    );
  }

  return {
    formRef,
    preserveSubmittedValues,
  };
}
