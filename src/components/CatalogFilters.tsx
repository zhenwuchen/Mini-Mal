"use client";

import { usePathname, useRouter } from "next/navigation";
import {
  useEffect,
  useRef,
  useState,
  useTransition,
  type FormEvent,
} from "react";

import { CloseIcon, SearchIcon } from "@/components/Icons";
import {
  updateCatalogSearchParams,
  type CatalogCategory,
  type ProductSort,
} from "@/lib/product-catalog";

type CatalogFiltersProps = {
  categories: CatalogCategory[];
  search: string;
  category: string;
  sort: ProductSort;
  focusOnMount?: boolean;
};

export function CatalogFilters({
  categories,
  search,
  category,
  sort,
  focusOnMount = false,
}: CatalogFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState(search);
  const [isPending, startTransition] = useTransition();
  const hasFilters = Boolean(search || category);

  function updateUrl(changes: {
    search?: string;
    category?: string;
    sort?: ProductSort;
    page?: number;
  }) {
    const params = updateCatalogSearchParams(
      new URLSearchParams(window.location.search),
      changes,
    );
    const queryString = params.toString();

    startTransition(() => {
      router.push(queryString ? `${pathname}?${queryString}` : pathname, {
        scroll: false,
      });
    });
  }

  useEffect(() => {
    if (focusOnMount) {
      searchInputRef.current?.focus({ preventScroll: true });
    }
  }, [focusOnMount]);

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextSearch = query.trim();
    setQuery(nextSearch);

    if (nextSearch !== search) {
      updateUrl({ search: nextSearch });
    }
  }

  function clearSearch() {
    setQuery("");

    if (search) {
      updateUrl({ search: "" });
    }
  }

  function selectCategory(nextCategory: string) {
    if (nextCategory !== category) {
      updateUrl({ category: nextCategory });
    }
  }

  function clearFilters() {
    setQuery("");
    updateUrl({ search: "", category: "" });
  }

  return (
    <div
      aria-busy={isPending}
      className="border-y border-rule/80 py-5 sm:py-6"
    >
      <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_260px] md:items-end">
        <form
          role="search"
          aria-describedby="catalog-controls-note"
          onSubmit={submitSearch}
        >
          <label
            htmlFor="catalog-search"
            className="mb-2 block text-[10px] font-medium tracking-[0.16em] text-muted uppercase"
          >
            搜索商品
          </label>
          <div className="flex items-center border-b border-ink/30 pb-2 transition-colors focus-within:border-earth">
            <SearchIcon className="mr-3 size-4 shrink-0 text-muted" />
            <input
              ref={searchInputRef}
              id="catalog-search"
              name="search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="输入商品名称…"
              autoComplete="off"
              aria-controls="catalog-results"
              className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-muted/70"
            />
            {query && (
              <button
                type="button"
                aria-label="清除搜索"
                onClick={clearSearch}
                className="grid size-8 place-items-center text-muted transition-colors hover:text-ink"
              >
                <CloseIcon className="size-4" />
              </button>
            )}
            <button
              type="submit"
              disabled={isPending}
              className="ml-2 min-h-8 shrink-0 border-l border-rule pl-4 text-[10px] font-medium tracking-[0.12em] text-ink uppercase transition-colors hover:text-earth disabled:cursor-wait disabled:text-muted"
            >
              搜索
            </button>
          </div>
        </form>

        <div>
          <label
            htmlFor="catalog-sort"
            className="mb-2 block text-[10px] font-medium tracking-[0.16em] text-muted uppercase"
          >
            排序
          </label>
          <select
            id="catalog-sort"
            name="sort"
            value={sort}
            onChange={(event) =>
              updateUrl({ sort: event.target.value as ProductSort })
            }
            disabled={isPending}
            className="w-full border-b border-ink/30 bg-transparent pb-2 text-sm text-ink outline-none transition-colors focus:border-earth"
          >
            <option value="featured">推荐排序</option>
            <option value="price-asc">价格从低到高</option>
            <option value="price-desc">价格从高到低</option>
            <option value="newest">最新商品优先</option>
          </select>
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-3 border-t border-rule/70 pt-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="-mx-5 min-w-0 overflow-x-auto px-5 sm:mx-0 sm:px-0">
          <div
            role="group"
            aria-label="商品分类"
            className="flex min-w-max gap-6"
          >
            <CategoryButton
              active={!category}
              disabled={isPending}
              label="全部商品"
              onClick={() => selectCategory("")}
            />
            {categories.map((item) => (
              <CategoryButton
                key={item.id}
                active={item.slug === category}
                disabled={isPending}
                label={item.name}
                onClick={() => selectCategory(item.slug)}
              />
            ))}
          </div>
        </div>
        <div className="flex min-h-8 items-center justify-end gap-4">
          {hasFilters && (
            <button
              type="button"
              onClick={clearFilters}
              disabled={isPending}
              className="text-[10px] font-medium tracking-[0.12em] text-muted uppercase transition-colors hover:text-ink disabled:cursor-wait"
            >
              清除筛选
            </button>
          )}
          <p id="catalog-controls-note" className="sr-only">
            搜索与分类筛选可以组合使用，更改条件后会更新商品列表。
          </p>
        </div>
      </div>
    </div>
  );
}

function CategoryButton({
  active,
  disabled,
  label,
  onClick,
}: {
  active: boolean;
  disabled: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      disabled={disabled}
      className={`border-b pb-1 text-xs transition-colors disabled:cursor-wait ${
        active
          ? "border-ink text-ink"
          : "border-transparent text-muted hover:border-rule hover:text-ink"
      }`}
    >
      {label}
    </button>
  );
}
