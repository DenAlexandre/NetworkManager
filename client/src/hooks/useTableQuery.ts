import { useMemo, useState } from "react";

export function useTableQuery<T>(items: T[], searchFields: (item: T) => Array<string | null>) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<keyof T | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

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

    const query = search.trim().toLowerCase();
    if (query) {
      result = result.filter((item) =>
        searchFields(item).some((field) => (field || "").toLowerCase().includes(query))
      );
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
  }, [items, search, sortKey, sortDir, searchFields]);

  return { search, setSearch, sortKey, sortDir, toggleSort, rows };
}
