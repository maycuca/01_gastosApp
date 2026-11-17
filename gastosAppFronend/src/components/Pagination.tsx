interface PaginationProps {
  /** Zero-based page index. */
  page: number
  totalPages: number
  totalElements: number
  disabled?: boolean
  onPageChange: (page: number) => void
}

export function Pagination({ page, totalPages, totalElements, disabled, onPageChange }: PaginationProps) {
  const isFirst = page <= 0
  const isLast = page >= totalPages - 1

  return (
    <nav className="pagination" aria-label="Paginación">
      <button type="button" className="btn" onClick={() => onPageChange(page - 1)} disabled={disabled || isFirst}>
        Anterior
      </button>
      <span className="pagination-info">
        Página {page + 1} de {Math.max(totalPages, 1)} · {totalElements} {totalElements === 1 ? 'gasto' : 'gastos'}
      </span>
      <button type="button" className="btn" onClick={() => onPageChange(page + 1)} disabled={disabled || isLast}>
        Siguiente
      </button>
    </nav>
  )
}
