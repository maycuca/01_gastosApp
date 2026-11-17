// DTOs that mirror docs/specs/gastos-funcional.md (v1.3), section 3.
// Do not add fields that are not in the spec.

export type Period = 'DAY' | 'WEEK' | 'FORTNIGHT' | 'MONTH' | 'YEAR'

/** ISO date `YYYY-MM-DD`. */
export type IsoDate = string

// ---------- Errors ----------

export interface FieldError {
  field: string
  message: string
}

export interface ApiErrorBody {
  status: number
  error: string
  message: string
  /** Only present on validation errors. */
  fieldErrors?: FieldError[]
}

// ---------- Auth ----------

export interface User {
  id: number
  username: string
}

export interface AuthRequest {
  username: string
  password: string
}

export interface AuthResponse {
  token: string
  user: User
}

/**
 * Body of `PUT /api/auth/password`. Answers `200` with an {@link AuthResponse} (same body as the
 * login): the change invalidates every token issued before, so the new one must be stored.
 */
export interface PasswordChangeRequest {
  currentPassword: string
  newPassword: string
}

// ---------- Categories ----------

export interface Category {
  id: number
  name: string
  /** `#RRGGBB` */
  color: string
}

export interface CategoryRequest {
  name: string
  color: string
}

// ---------- Expenses ----------

export interface Expense {
  id: number
  amount: number
  description: string
  date: IsoDate
  category: Category
  tags: string[]
}

export interface ExpenseCreateRequest {
  amount: number
  description: string
  date: IsoDate
  categoryId: number
  tags: string[]
}

/** `date` is immutable, so it is not part of the update body. */
export interface ExpenseUpdateRequest {
  amount: number
  description: string
  categoryId: number
  tags: string[]
}

export interface ExceededLimit {
  period: Period
  limitAmount: number
  spent: number
}

export interface ExpenseSaveResponse {
  expense: Expense
  exceededLimits: ExceededLimit[]
}

export interface ExpenseFilters {
  description?: string
  categoryId?: number
  startDate?: IsoDate
  endDate?: IsoDate
  tag?: string
}

export interface ExpenseListParams extends ExpenseFilters {
  page?: number
  size?: number
}

export interface Page<T> {
  content: T[]
  page: number
  size: number
  totalElements: number
  totalPages: number
}

// ---------- Limits ----------

export interface LimitStatus {
  period: Period
  limitAmount: number
  spent: number
  /** May be negative. */
  remaining: number
  exceeded: boolean
}

export interface LimitRequest {
  limitAmount: number
}

// ---------- Dashboard ----------

export interface DashboardLimit {
  limitAmount: number
  remaining: number
  percentageUsed: number
  exceeded: boolean
}

export interface CategorySpending {
  categoryId: number
  name: string
  color: string
  amount: number
  percentage: number
}

export interface BreakdownPoint {
  /** `YYYY-MM-DD` for WEEK/FORTNIGHT/MONTH, `YYYY-MM` for YEAR. */
  label: string
  amount: number
}

export interface DashboardSummary {
  period: Period
  from: IsoDate
  to: IsoDate
  totalSpent: number
  previousTotal: number
  /** `null` when `previousTotal` is 0. */
  changePercentage: number | null
  /** `null` when the user has no limit for the period. */
  limit: DashboardLimit | null
  byCategory: CategorySpending[]
  /** Empty for DAY. */
  breakdown: BreakdownPoint[]
}
