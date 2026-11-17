import { describe, expect, it } from 'vitest'
import { tooManyAttemptsMessage, waitInMinutes } from './errors'

describe('waitInMinutes', () => {
  it.each([
    [0, 'en menos de un minuto'],
    [59, 'en menos de un minuto'],
    [60, 'en 1 minuto'],
    [61, 'en 2 minutos'],
    [840, 'en 14 minutos'],
    [900, 'en 15 minutos'],
  ])('%s seconds -> "%s"', (seconds, expected) => {
    expect(waitInMinutes(seconds)).toBe(expected)
  })
})

describe('tooManyAttemptsMessage', () => {
  it('says how long to wait from Retry-After', () => {
    expect(tooManyAttemptsMessage(900)).toBe(
      'Demasiados intentos fallidos para este usuario. Vuelve a intentarlo en 15 minutos.',
    )
  })

  it('falls back to the lockout of the spec without Retry-After', () => {
    expect(tooManyAttemptsMessage(null)).toBe(
      'Demasiados intentos fallidos para este usuario. Vuelve a intentarlo en unos minutos (como máximo 15).',
    )
  })
})
