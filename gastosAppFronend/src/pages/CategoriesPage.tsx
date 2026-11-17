import { useCallback, useState } from 'react'
import { CategoryForm } from '../components/CategoryForm'
import { Modal } from '../components/Modal'
import { EmptyState, ErrorState, Loading } from '../components/StatusViews'
import { useCategories } from '../hooks/useCategories'
import type { Category, CategoryRequest } from '../types/api'

type Dialog = { kind: 'create' } | { kind: 'edit'; category: Category }

// Categories can only be created and edited (name and color). There is no delete, by spec.
export function CategoriesPage() {
  const { categories, loading, error, reload, createCategory, updateCategory } = useCategories()
  const [dialog, setDialog] = useState<Dialog | null>(null)
  const closeDialog = useCallback(() => setDialog(null), [])

  /** Closes `opened` only if it is still the open dialog, so a late answer never closes another one. */
  function closeIfStill(opened: Dialog | null) {
    setDialog((current) => (current === opened ? null : current))
  }

  async function handleCreate(body: CategoryRequest) {
    await createCategory(body)
    closeIfStill(dialog)
  }

  async function handleUpdate(category: Category, body: CategoryRequest) {
    await updateCategory(category.id, body)
    closeIfStill(dialog)
  }

  return (
    <section className="page">
      <header className="page-header">
        <h1>Categorías</h1>
        <button type="button" className="btn btn-primary" onClick={() => setDialog({ kind: 'create' })}>
          Nueva categoría
        </button>
      </header>

      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !categories ? (
        <Loading label="Cargando categorías…" />
      ) : categories.length === 0 ? (
        <EmptyState title="No tienes categorías">
          <p>Crea una con el botón "Nueva categoría".</p>
        </EmptyState>
      ) : (
        <ul className={loading ? 'card list is-refreshing' : 'card list'} aria-busy={loading}>
          {categories.map((category) => (
            <li key={category.id} className="list-row">
              <span className="category-chip">
                <span className="color-swatch" style={{ backgroundColor: category.color }} aria-hidden="true" />
                <span className="category-name">{category.name}</span>
                <code className="muted">{category.color}</code>
              </span>
              <button
                type="button"
                className="btn btn-small"
                onClick={() => setDialog({ kind: 'edit', category })}
                aria-label={`Editar ${category.name}`}
              >
                Editar
              </button>
            </li>
          ))}
        </ul>
      )}

      {dialog?.kind === 'create' && (
        <Modal title="Nueva categoría" onClose={closeDialog}>
          <CategoryForm onSubmit={handleCreate} onCancel={closeDialog} />
        </Modal>
      )}

      {dialog?.kind === 'edit' && (
        <Modal title="Editar categoría" onClose={closeDialog}>
          <CategoryForm
            category={dialog.category}
            onSubmit={(body) => handleUpdate(dialog.category, body)}
            onCancel={closeDialog}
          />
        </Modal>
      )}
    </section>
  )
}
