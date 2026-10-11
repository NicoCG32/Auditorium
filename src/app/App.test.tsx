import { StrictMode } from 'react'
import { render, screen, within } from '@testing-library/react'
import { expect, test } from 'vitest'
import { App } from './App'

test('monta la aplicación y presenta la bienvenida en el contenido principal', () => {
  render(
    <StrictMode>
      <App />
    </StrictMode>,
  )

  const main = screen.getByRole('main')

  expect(
    within(main).getByRole('heading', { level: 1, name: 'Auditórium' }),
  ).toBeVisible()
  expect(within(main).getByText('Un lugar para tu música.')).toBeVisible()
})
