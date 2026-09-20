interface PaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  disabled?: boolean;
  label: string;
}

export function Pagination({ page, totalPages, onPageChange, disabled = false, label }: PaginationProps) {
  const displayTotal = Math.max(totalPages, 1);
  return (
    <nav className="data-pagination" aria-label={label}>
      <button
        type="button"
        className="button button--secondary"
        aria-label="Go to previous page"
        disabled={disabled || page <= 1}
        onClick={() => onPageChange(page - 1)}
      >
        Previous
      </button>
      <span>Page <strong>{page}</strong> of <strong>{displayTotal}</strong></span>
      <button
        type="button"
        className="button button--secondary"
        aria-label="Go to next page"
        disabled={disabled || totalPages === 0 || page >= totalPages}
        onClick={() => onPageChange(page + 1)}
      >
        Next
      </button>
    </nav>
  );
}
