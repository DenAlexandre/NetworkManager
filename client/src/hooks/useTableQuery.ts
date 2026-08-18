import { useMemo, useState } from "react";

export interface FilterOption {
  value: string;
  label: string;
}

export interface FilterColumn<T> {
  key: string;
  getValue: (item: T) => string;
  type?: "text" | "select";
  options?: FilterOption[];
}

export function useTableQuery<T>(items: T[], columns: FilterColumn<T>[]) {
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [sortKey, setSortKey] = useState<keyof T | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  function setFilter(key: string, value: string) {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

  function toggleSort(key: keyof T) {
    if (sortKey === key) {
      setSortDir((dir) => (dir === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const rows = useMemo(() => {
    let result = items;

    for (const column of columns) {
      const raw = (filters[column.key] ?? "").trim();
      if (!raw) continue;
      if (column.type === "select") {
        result = result.filter((item) => column.getValue(item) === raw);
      } else {
        const query = raw.toLowerCase();
        result = result.filter((item) => column.getValue(item).toLowerCase().includes(query));
      }
    }

    if (sortKey) {
      result = [...result].sort((a, b) => {
        const av = a[sortKey];
        const bv = b[sortKey];
        const cmp =
          typeof av === "number" && typeof bv === "number"
            ? av - bv
            : String(av ?? "").localeCompare(String(bv ?? ""));
        return sortDir === "asc" ? cmp : -cmp;
      });
    }

    return result;
  }, [items, columns, filters, sortKey, sortDir]);

  return { filters, setFilter, sortKey, sortDir, toggleSort, rows };
}
