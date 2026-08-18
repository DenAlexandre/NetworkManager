import type { FilterColumn } from "../hooks/useTableQuery";

interface ColumnFilterCellProps<T> {
  column: FilterColumn<T>;
  value: string;
  onChange: (value: string) => void;
}

export function ColumnFilterCell<T>({ column, value, onChange }: ColumnFilterCellProps<T>) {
  if (column.type === "select") {
    return (
      <select className="column-filter" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Tous</option>
        {column.options?.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    );
  }
  return (
    <input
      type="search"
      className="column-filter"
      placeholder="Filtrer..."
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}
