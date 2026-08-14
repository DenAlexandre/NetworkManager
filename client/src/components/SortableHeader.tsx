interface SortableHeaderProps<T> {
  label: string;
  field: keyof T;
  sortKey: keyof T | null;
  sortDir: "asc" | "desc";
  onSort: (field: keyof T) => void;
}

export function SortableHeader<T>({ label, field, sortKey, sortDir, onSort }: SortableHeaderProps<T>) {
  const active = sortKey === field;
  return (
    <th className="sortable" onClick={() => onSort(field)}>
      {label}
      <span className="sort-indicator">{active ? (sortDir === "asc" ? "▲" : "▼") : ""}</span>
    </th>
  );
}
