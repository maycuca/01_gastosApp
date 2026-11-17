import { Suspense } from 'react'
import { NavLink, Outlet } from 'react-router'
import { useAuth } from '../hooks/useAuth'
import { ROUTES } from '../routes'
import { Loading } from './StatusViews'

const NAV_ITEMS = [
  { to: ROUTES.dashboard, label: 'Dashboard', end: true },
  { to: ROUTES.expenses, label: 'Gastos', end: false },
  { to: ROUTES.categories, label: 'Categorías', end: false },
  { to: ROUTES.limits, label: 'Límites', end: false },
]

function navLinkClass({ isActive }: { isActive: boolean }): string {
  return isActive ? 'nav-link nav-link-active' : 'nav-link'
}

/** Shared navigation for every authenticated page. */
export function Layout() {
  const { user, logout } = useAuth()

  return (
    <div className="app-shell">
      <header className="app-rail">
        <span className="brand">Mis Gastos</span>
        <nav className="app-nav" aria-label="Navegación principal">
          {NAV_ITEMS.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className={navLinkClass}>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="app-user">
          {/* The user name leads to the account page; the label also says where it goes. */}
          <NavLink
            to={ROUTES.account}
            className={(state) => `${navLinkClass(state)} app-username`}
            aria-label={user ? `Cuenta: ${user.username}` : undefined}
          >
            {user ? user.username : 'Cuenta'}
          </NavLink>
          <button type="button" className="btn btn-ghost" onClick={logout}>
            Cerrar sesión
          </button>
        </div>
      </header>
      <main className="app-main">
        {/* Pages are loaded on demand (see App.tsx); the menu stays while their code arrives. */}
        <Suspense fallback={<Loading label="Cargando página…" />}>
          <Outlet />
        </Suspense>
      </main>
    </div>
  )
}
