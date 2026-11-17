import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiError, COMIDA, installApi, json, renderAppAt, TRANSPORTE } from '../test/fakeApi'
import type { ApiHandler } from '../test/fakeApi'
import type { Category } from '../types/api'

function categoriesApi(options: { categories?: Category[]; override?: ApiHandler } = {}) {
  let categories = options.categories ?? [COMIDA, TRANSPORTE]
  return installApi((call) => {
    const overridden = options.override?.(call)
    if (overridden) return overridden
    if (call.path === '/api/categories' && call.method === 'GET') return json(200, categories)
    if (call.path === '/api/categories' && call.method === 'POST') {
      const created = { id: 99, ...(call.body as { name: string; color: string }) }
      categories = [...categories, created]
      return json(201, created)
    }
    if (call.path.startsWith('/api/categories/') && call.method === 'PUT') {
      const id = Number(call.path.split('/').pop())
      const updated = { id, ...(call.body as { name: string; color: string }) }
      categories = categories.map((category) => (category.id === id ? updated : category))
      return json(200, updated)
    }
    return undefined
  })
}

async function openPage() {
  renderAppAt('/categorias')
  await screen.findByRole('heading', { name: 'Categorías', level: 1 })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('CategoriesPage', () => {
  it('lists the categories with their name and color', async () => {
    const api = categoriesApi()
    await openPage()

    const items = within(await screen.findByRole('list')).getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(within(items[0]).getByText('Comida')).toBeInTheDocument()
    expect(within(items[0]).getByText('#FF8A00')).toBeInTheDocument()
    expect(items[0].querySelector('.color-swatch')).toHaveStyle({ backgroundColor: '#FF8A00' })
    expect(within(items[1]).getByText('Transporte')).toBeInTheDocument()
    expect(items[1].querySelector('.color-swatch')).toHaveStyle({ backgroundColor: '#2196F3' })
    expect(api.lastCallTo('GET', '/api/categories').authorization).toBe('Bearer valid-token')
  })

  it('shows the empty state', async () => {
    categoriesApi({ categories: [] })
    await openPage()

    expect(await screen.findByText('No tienes categorías')).toBeInTheDocument()
  })

  it('shows the error state and retries', async () => {
    let fail = true
    categoriesApi({
      override: (call) =>
        call.method === 'GET' && call.path === '/api/categories' && fail
          ? apiError(500, 'Error interno del servidor')
          : undefined,
    })
    const user = userEvent.setup()
    await openPage()

    expect(await screen.findByText('No se pudo cargar la información')).toBeInTheDocument()
    fail = false
    await user.click(screen.getByRole('button', { name: 'Reintentar' }))

    expect(await screen.findByText('Comida')).toBeInTheDocument()
  })

  it('creates a category with name and color', async () => {
    const api = categoriesApi()
    const user = userEvent.setup()
    await openPage()

    await user.click(screen.getByRole('button', { name: 'Nueva categoría' }))
    const dialog = within(await screen.findByRole('dialog', { name: 'Nueva categoría' }))
    await user.type(dialog.getByLabelText('Nombre'), '  Mascotas ')
    fireEvent.change(dialog.getByLabelText('Color'), { target: { value: '#12ab9f' } })
    await user.click(dialog.getByRole('button', { name: 'Crear categoría' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(api.lastCallTo('POST', '/api/categories').body).toEqual({ name: 'Mascotas', color: '#12AB9F' })
    // The list is reloaded and shows the new category.
    expect(await screen.findByText('Mascotas')).toBeInTheDocument()
    expect(api.callsTo('GET', '/api/categories')).toHaveLength(2)
  })

  it('edits the name and the color of a category', async () => {
    const api = categoriesApi()
    const user = userEvent.setup()
    await openPage()

    await user.click(await screen.findByRole('button', { name: 'Editar Comida' }))
    const dialog = within(await screen.findByRole('dialog', { name: 'Editar categoría' }))
    expect(dialog.getByLabelText('Nombre')).toHaveValue('Comida')
    expect(dialog.getByLabelText('Color')).toHaveValue('#ff8a00')
    await user.clear(dialog.getByLabelText('Nombre'))
    await user.type(dialog.getByLabelText('Nombre'), 'Alimentos')
    fireEvent.change(dialog.getByLabelText('Color'), { target: { value: '#00ff00' } })
    await user.click(dialog.getByRole('button', { name: 'Guardar cambios' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(api.lastCallTo('PUT', '/api/categories/1').body).toEqual({ name: 'Alimentos', color: '#00FF00' })
    expect(await screen.findByText('Alimentos')).toBeInTheDocument()
    expect(screen.queryByText('Comida')).not.toBeInTheDocument()
  })

  it('can change only the name, keeping the color', async () => {
    const api = categoriesApi()
    const user = userEvent.setup()
    await openPage()

    await user.click(await screen.findByRole('button', { name: 'Editar Transporte' }))
    const dialog = within(await screen.findByRole('dialog', { name: 'Editar categoría' }))
    await user.clear(dialog.getByLabelText('Nombre'))
    await user.type(dialog.getByLabelText('Nombre'), 'Movilidad')
    await user.click(dialog.getByRole('button', { name: 'Guardar cambios' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(api.lastCallTo('PUT', '/api/categories/2').body).toEqual({ name: 'Movilidad', color: '#2196F3' })
  })

  it('requires a name before calling the API', async () => {
    const api = categoriesApi()
    const user = userEvent.setup()
    await openPage()

    await user.click(screen.getByRole('button', { name: 'Nueva categoría' }))
    const dialog = within(await screen.findByRole('dialog', { name: 'Nueva categoría' }))
    await user.type(dialog.getByLabelText('Nombre'), '   ')
    await user.click(dialog.getByRole('button', { name: 'Crear categoría' }))

    expect(dialog.getByLabelText('Nombre')).toHaveAccessibleDescription('Escribe el nombre')
    expect(api.callsTo('POST', '/api/categories')).toHaveLength(0)
  })

  it('shows the 409 of a repeated name and keeps the form open', async () => {
    categoriesApi({
      override: (call) =>
        call.method === 'POST' ? apiError(409, 'Ya existe una categoría con ese nombre') : undefined,
    })
    const user = userEvent.setup()
    await openPage()

    await user.click(screen.getByRole('button', { name: 'Nueva categoría' }))
    const dialog = within(await screen.findByRole('dialog', { name: 'Nueva categoría' }))
    await user.type(dialog.getByLabelText('Nombre'), 'comida')
    await user.click(dialog.getByRole('button', { name: 'Crear categoría' }))

    expect(await dialog.findByRole('alert')).toHaveTextContent('Ya existe una categoría con ese nombre')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(dialog.getByLabelText('Nombre')).toHaveValue('comida')
  })

  it('shows the backend fieldErrors next to their fields', async () => {
    categoriesApi({
      override: (call) =>
        call.method === 'PUT'
          ? apiError(400, 'Datos inválidos', [
              { field: 'name', message: 'Debe tener entre 1 y 50 caracteres' },
              { field: 'color', message: 'Debe tener el formato #RRGGBB' },
            ])
          : undefined,
    })
    const user = userEvent.setup()
    await openPage()

    await user.click(await screen.findByRole('button', { name: 'Editar Comida' }))
    const dialog = within(await screen.findByRole('dialog', { name: 'Editar categoría' }))
    await user.click(dialog.getByRole('button', { name: 'Guardar cambios' }))

    await waitFor(() =>
      expect(dialog.getByLabelText('Nombre')).toHaveAccessibleDescription('Debe tener entre 1 y 50 caracteres'),
    )
    expect(dialog.getByLabelText('Color')).toHaveAccessibleDescription('Debe tener el formato #RRGGBB')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('offers no way to delete a category', async () => {
    const api = categoriesApi()
    const user = userEvent.setup()
    await openPage()
    await screen.findByText('Comida')

    const destructive = /eliminar|borrar|quitar|suprimir|delete|remove/i
    const page = screen.getByRole('main')
    expect(within(page).queryByRole('button', { name: destructive })).not.toBeInTheDocument()
    expect(within(page).queryByRole('link', { name: destructive })).not.toBeInTheDocument()
    expect(page).not.toHaveTextContent(destructive)
    // The only action of each row is "Editar".
    for (const item of within(within(page).getByRole('list')).getAllByRole('listitem')) {
      const buttons = within(item).getAllByRole('button')
      expect(buttons).toHaveLength(1)
      expect(buttons[0]).toHaveTextContent('Editar')
    }

    await user.click(screen.getByRole('button', { name: 'Editar Comida' }))
    const dialog = await screen.findByRole('dialog', { name: 'Editar categoría' })
    expect(within(dialog).queryByRole('button', { name: destructive })).not.toBeInTheDocument()
    expect(dialog).not.toHaveTextContent(destructive)
    expect(within(dialog).getAllByRole('button').map((button) => button.textContent)).toEqual([
      '×',
      'Cancelar',
      'Guardar cambios',
    ])
    expect(api.calls.filter((call) => call.method === 'DELETE')).toHaveLength(0)
  })
})
