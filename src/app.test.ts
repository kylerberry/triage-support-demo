import { describe, expect, it } from 'vitest'
import { app } from './app.js'

describe('app', () => {
  it('can be imported without throwing', () => {
    expect(app).toBeDefined()
  })
})
