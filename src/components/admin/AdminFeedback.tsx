"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

type FeedbackTone = "success" | "error";

type FeedbackItem = {
  id: number;
  tone: FeedbackTone;
  message: string;
};

type AdminFeedbackContextValue = {
  showFeedback: (tone: FeedbackTone, message: string) => void;
};

const AdminFeedbackContext =
  createContext<AdminFeedbackContextValue | null>(null);

export function AdminFeedbackProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const nextIdRef = useRef(1);
  const timersRef = useRef(new Map<number, number>());

  const removeFeedback = useCallback((id: number) => {
    const timer = timersRef.current.get(id);

    if (timer !== undefined) {
      window.clearTimeout(timer);
      timersRef.current.delete(id);
    }

    setItems((current) =>
      current.filter((item) => item.id !== id),
    );
  }, []);

  const showFeedback = useCallback(
    (tone: FeedbackTone, message: string) => {
      const id = nextIdRef.current;
      nextIdRef.current += 1;
      setItems((current) => [
        ...current.slice(-2),
        { id, tone, message },
      ]);

      const timer = window.setTimeout(() => {
        removeFeedback(id);
      }, 4_500);
      timersRef.current.set(id, timer);
    },
    [removeFeedback],
  );

  useEffect(() => {
    const timers = timersRef.current;

    return () => {
      for (const timer of timers.values()) {
        window.clearTimeout(timer);
      }
      timers.clear();
    };
  }, []);

  return (
    <AdminFeedbackContext.Provider value={{ showFeedback }}>
      {children}
      <div
        aria-label="后台操作通知"
        className="pointer-events-none fixed right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] left-4 z-[90] flex flex-col items-end gap-2 sm:left-auto sm:w-[min(420px,calc(100vw-2rem))]"
      >
        {items.map((item) => (
          <div
            key={item.id}
            role={item.tone === "error" ? "alert" : "status"}
            className={`pointer-events-auto flex w-full items-start gap-4 border px-4 py-3.5 shadow-[0_16px_45px_rgba(33,29,25,0.16)] ${
              item.tone === "error"
                ? "border-[#8b3f32]/35 bg-[#f7efeb] text-[#713327]"
                : "border-[#55735a]/35 bg-[#f1f5f0] text-[#3f5b45]"
            }`}
          >
            <span
              aria-hidden="true"
              className="mt-1 size-1.5 shrink-0 rounded-full bg-current"
            />
            <p className="min-w-0 flex-1 text-xs leading-5">
              {item.message}
            </p>
            <button
              type="button"
              aria-label="关闭通知"
              onClick={() => removeFeedback(item.id)}
              className="-mr-1 grid size-7 shrink-0 place-items-center text-current opacity-55 transition-opacity hover:opacity-100"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </AdminFeedbackContext.Provider>
  );
}

export function useAdminFeedback() {
  const context = useContext(AdminFeedbackContext);

  if (!context) {
    throw new Error(
      "useAdminFeedback 必须在 AdminFeedbackProvider 内使用",
    );
  }

  return context;
}
