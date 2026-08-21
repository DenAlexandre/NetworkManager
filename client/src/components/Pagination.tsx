interface PaginationProps {
  page: number;
  pageCount: number;
  onChange: (page: number) => void;
}

export function Pagination({ page, pageCount, onChange }: PaginationProps) {
  if (pageCount <= 1) return null;

  return (
    <div className="pagination">
      <button type="button" className="btn-outline btn-sm" onClick={() => onChange(1)} disabled={page <= 1}>
        « Première
      </button>
      <button type="button" className="btn-outline btn-sm" onClick={() => onChange(page - 1)} disabled={page <= 1}>
        Précédent
      </button>
      <span className="pagination-info">
        Page {page} / {pageCount}
      </span>
      <button
        type="button"
        className="btn-outline btn-sm"
        onClick={() => onChange(page + 1)}
        disabled={page >= pageCount}
      >
        Suivant
      </button>
      <button
        type="button"
        className="btn-outline btn-sm"
        onClick={() => onChange(pageCount)}
        disabled={page >= pageCount}
      >
        Dernière »
      </button>
    </div>
  );
}
