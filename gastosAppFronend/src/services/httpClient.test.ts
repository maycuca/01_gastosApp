import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, parseRetryAfter, request, setUnauthorizedHandler } from './httpClient'
import { getToken, setToken } from './tokenStorage'

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('request', () => {
  it('sends the bearer token and returns the parsed body', async () => {
    setToken('abc')
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(200, { id: 1, username: 'ana' }))
    vi.stubGlobal('fetch', fetchMock)

    const user = await request<{ id: number; username: string }>('/api/auth/me')

    expect(user).toEqual({ id: 1, username: 'ana' })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/auth/me')
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer abc')
  })

  it('exposes the fieldErrors of a validation error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockResolvedValue(
        jsonResponse(400, {
          status: 400,
          error: 'Bad Request',
          message: 'Datos inválidos',
          fieldErrors: [{ field: 'amount', message: 'Debe ser mayor a 0' }],
        }),
      ),
    )

    const error = await request('/api/expenses', { method: 'POST', body: {} }).catch((cause: unknown) => cause)

    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({
      status: 400,
      message: 'Datos inválidos',
      fieldErrors: [{ field: 'amount', message: 'Debe ser mayor a 0' }],
    })
  })

  it('clears the token and notifies on a 401 from a protected endpoint', async () => {
    setToken('expired')
    const onUnauthorized = vi.fn()
    const restore = setUnauthorizedHandler(onUnauthorized)
    vi.stubGlobal(
      'fetch',
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(jsonResponse(401, { status: 401, error: 'Unauthorized', message: 'Token vencido' })),
    )

    await expect(request('/api/categories')).rejects.toMatchObject({ status: 401 })

    expect(getToken()).toBeNull()
    expect(onUnauthorized).toHaveBeenCalledTimes(1)
    restore()
  })
})

describe('429 Too Many Requests', () => {
  function tooManyAttempts(headers: Record<string, string> = {}): Response {
    return new Response(
      JSON.stringify({ status: 429, error: 'Too Many Requests', message: 'Demasiados intentos fallidos' }),
      { status: 429, headers: { 'Content-Type': 'application/json', ...headers } },
    )
  }

  it('exposes the Retry-After seconds', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(tooManyAttempts({ 'Retry-After': '840' })))

    const error = await request('/api/auth/login', { method: 'POST', body: {}, auth: false }).catch(
      (cause: unknown) => cause,
    )

    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 429, message: 'Demasiados intentos fallidos', retryAfterSeconds: 840 })
  })

  it('leaves retryAfterSeconds empty when the header is missing', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(tooManyAttempts()))

    await expect(request('/api/auth/login', { method: 'POST', body: {}, auth: false })).rejects.toMatchObject({
      status: 429,
      retryAfterSeconds: null,
    })
  })

  it('does not end the session, even on a protected endpoint', async () => {
    setToken('still-valid')
    const onUnauthorized = vi.fn()
    const restore = setUnauthorizedHandler(onUnauthorized)
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(tooManyAttempts({ 'Retry-After': '60' })))

    await expect(request('/api/categories')).rejects.toMatchObject({ status: 429 })

    expect(getToken()).toBe('still-valid')
    expect(onUnauthorized).not.toHaveBeenCalled()
    restore()
  })

  it.each([
    ['900', 900],
    [' 30 ', 30],
    ['0', 0],
    ['Wed, 21 Oct 2026 07:28:00 GMT', null],
    ['-5', null],
    ['1.5', null],
    ['', null],
  ])('parses Retry-After "%s" as %s', (header, expected) => {
    expect(parseRetryAfter(header)).toBe(expected)
  })
})
