import { test, expect } from '@playwright/test'

for (const width of [1440, 390]) {
  test(`home incentiva instalação em ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/')
    const instalar = page.getByTestId('instalar-principal')
    await expect(instalar).toBeVisible()
    await expect(instalar).toHaveAttribute('href', 'https://play.google.com/store/apps/details?id=com.futebol.cadepelada')
    await expect(instalar).toBeInViewport()
    await expect(page.getByRole('link', { name: 'Explorar pelo navegador' })).toHaveCount(0)
    await expect(page.getByTestId('contador-visitas')).toContainText('Visitas neste navegador: 1')
    await expect(page.getByRole('link', { name: 'Falar com o desenvolvedor pelo WhatsApp' })).toHaveAttribute('href', 'https://wa.me/5592999888648')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    if (width === 390) await expect(page.locator('.instalar-mobile')).toBeVisible()
    await page.screenshot({ path: `test-results/inicio-${width}.png`, fullPage: true })
  })
}
