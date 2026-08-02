/**
 * Language Switching E2E Tests
 *
 * End-to-end tests for language switching functionality
 * Testing all languages including Arabic RTL support
 *
 * @module tests/e2e/language-switching.test.ts
 */

import { test, expect, Page } from '@playwright/test';

// =============================================================================
// TEST DATA
// =============================================================================

const languages = [
  { code: 'en', name: 'English', flag: '🇺🇸', dir: 'ltr' },
  { code: 'es', name: 'Español', flag: '🇪🇸', dir: 'ltr' },
  { code: 'fr', name: 'Français', flag: '🇫🇷', dir: 'ltr' },
  { code: 'de', name: 'Deutsch', flag: '🇩🇪', dir: 'ltr' },
  { code: 'ar', name: 'العربية', flag: '🇸🇦', dir: 'rtl' },
];

// =============================================================================
// FIXTURES
// =============================================================================

test.describe('Language Switching', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    
    // Navigate to login page for testing
    await page.click('text=Sign in');
  });

  test('should display language switcher', async ({ page }) => {
    // Check if language switcher is visible
    await expect(page.locator('[data-testid="language-switcher"]')).toBeVisible();
    
    // Check if all language options are available
    for (const lang of languages) {
      await expect(page.locator(`text=${lang.name}`)).toBeVisible();
    }
  });

  test('should switch to different languages', async ({ page }) => {
    // Open language switcher
    await page.click('[data-testid="language-switcher"]');
    
    // Wait for dropdown to open
    await page.waitForSelector('[role="menu"]');
    
    // Test each language
    for (const lang of languages) {
      // Click on language
      await page.click(`text=${lang.name}`);
      
      // Wait for language change to apply
      await page.waitForTimeout(1000);
      
      // Verify URL doesn't change (should be stored in state/localStorage)
      expect(page.url()).not.toContain(`lang=${lang.code}`);
      
      // Verify page content updates
      // Check if any translated content is visible
      await expect(page.locator('text=Dashboard')).toBeVisible();
    }
  });

  test('should persist language preference', async ({ page }) => {
    // Open language switcher
    await page.click('[data-testid="language-switcher"]');
    await page.waitForSelector('[role="menu"]');
    
    // Switch to Spanish
    await page.click('text=Español');
    await page.waitForTimeout(1000);
    
    // Reload page
    await page.reload();
    
    // Wait for page to load
    await page.waitForLoadState('domcontentloaded');
    
    // Check if Spanish is still selected
    await page.click('[data-testid="language-switcher"]');
    await page.waitForSelector('[role="menu"]');
    
    // Spanish option should be marked as selected
    await expect(page.locator(`text=${languages.find(l => l.code === 'es')?.name}`)).toHaveClass(/selected/);
  });

  test.describe('RTL Support for Arabic', () => {
    test('should switch to RTL layout for Arabic', async ({ page }) => {
      // Open language switcher
      await page.click('[data-testid="language-switcher"]');
      await page.waitForSelector('[role="menu"]');
      
      // Switch to Arabic
      await page.click('text=العربية');
      await page.waitForTimeout(1000);
      
      // Check document direction
      const dir = await page.evaluate(() => document.documentElement.dir);
      expect(dir).toBe('rtl');
      
      // Check document language
      const lang = await page.evaluate(() => document.documentElement.lang);
      expect(lang).toBe('ar');
    });

    test('should maintain RTL layout after reload', async ({ page }) => {
      // Switch to Arabic
      await page.click('[data-testid="language-switcher"]');
      await page.waitForSelector('[role="menu"]');
      await page.click('text=العربية');
      await page.waitForTimeout(1000);
      
      // Reload page
      await page.reload();
      await page.waitForLoadState('domcontentloaded');
      
      // Check if RTL is maintained
      const dir = await page.evaluate(() => document.documentElement.dir);
      expect(dir).toBe('rtl');
    });

    test('should align text properly for Arabic', async ({ page }) => {
      // Switch to Arabic
      await page.click('[data-testid="language-switcher"]');
      await page.waitForSelector('[role="menu"]');
      await page.click('text=العربية');
      await page.waitForTimeout(1000);
      
      // Check text alignment in form elements
      const textInputs = await page.locator('input[type="text"]').all();
      for (const input of textInputs) {
        const textAlign = await input.evaluate(el => 
          window.getComputedStyle(el).textAlign
        );
        expect(textAlign).toBe('right');
      }
      
      // Check text direction in paragraphs
      const paragraphs = await page.locator('p').all();
      for (const paragraph of paragraphs) {
        const textAlign = await paragraph.evaluate(el => 
          window.getComputedStyle(el).textAlign
        );
        expect(textAlign).toBe('right');
      }
    });

    test('should position elements correctly for RTL', async ({ page }) => {
      // Switch to Arabic
      await page.click('[data-testid="language-switcher"]');
      await page.waitForSelector('[role="menu"]');
      await page.click('text=العربية');
      await page.waitForTimeout(1000);
      
      // Check margins and padding
      const containers = await page.locator('.container, .card, .dialog').all();
      for (const container of containers) {
        const styles = await container.evaluate(el => {
          const computed = window.getComputedStyle(el);
          return {
            marginLeft: computed.marginLeft,
            marginRight: computed.marginRight,
            paddingLeft: computed.paddingLeft,
            paddingRight: computed.paddingRight,
          };
        });
        
        // RTL should flip margins/paddings
        expect(styles.marginLeft).toBe('0px');
        expect(styles.marginRight).toContain('px'); // Should have margin on right
        expect(styles.paddingRight).toContain('px'); // Should have padding on right
      }
    });
  });

  test.describe('Language in Forms', () => {
    test('should display form labels in correct language', async ({ page }) => {
      // Switch to French
      await page.click('[data-testid="language-switcher"]');
      await page.waitForSelector('[role="menu"]');
      await page.click('text=Français');
      await page.waitForTimeout(1000);
      
      // Check form labels
      await expect(page.locator('text=Email')).toBeVisible();
      await expect(page.locator('text=Email')).toBeVisible();
      await expect(page.locator('text=Mot de passe')).toBeVisible();
    });

    test('should display validation messages in correct language', async ({ page }) => {
      // Switch to German
      await page.click('[data-testid="language-switcher"]');
      await page.waitForSelector('[role="menu"]');
      await page.click('text=Deutsch');
      await page.waitForTimeout(1000);
      
      // Submit empty form to trigger validation
      await page.click('text=Anmelden');
      await page.waitForTimeout(1000);
      
      // Check error messages
      await expect(page.locator('text=Dieses Feld ist erforderlich')).toBeVisible();
    });

    test('should format dates and numbers correctly', async ({ page }) => {
      // Switch to Spanish
      await page.click('[data-testid="language-switcher"]');
      await page.waitForSelector('[role="menu"]');
      await page.click('text=Español');
      await page.waitForTimeout(1000);
      
      // Check number formatting (if present)
      const numberElements = await page.locator('[data-testid="formatted-number"]').all();
      for (const element of numberElements) {
        const text = await element.textContent();
        // Spanish uses comma as decimal separator
        expect(text).toMatch(/[0-9]+,[0-9]{3}/);
      }
      
      // Check date formatting (if present)
      const dateElements = await page.locator('[data-testid="formatted-date"]').all();
      for (const element of dateElements) {
        const text = await element.textContent();
        // Spanish date format: DD/MM/YYYY
        expect(text).toMatch(/\d{2}\/\d{2}\/\d{4}/);
      }
    });
  });

  test.describe('Performance', () => {
    test('should load language files quickly', async ({ page }) => {
      // Measure performance of switching languages
      const startTime = Date.now();
      
      // Switch through all languages
      for (const lang of languages) {
        await page.click('[data-testid="language-switcher"]');
        await page.waitForSelector('[role="menu"]');
        await page.click(`text=${lang.name}`);
        await page.waitForTimeout(500);
      }
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      // Should complete all switches within 5 seconds
      expect(duration).toBeLessThan(5000);
    });

    test('should not cause layout shifts', async ({ page }) => {
      // Check initial layout
      const initialLayout = await page.evaluate(() => ({
        width: document.documentElement.offsetWidth,
        height: document.documentElement.offsetHeight,
      }));
      
      // Switch languages rapidly
      for (let i = 0; i < 5; i++) {
        await page.click('[data-testid="language-switcher"]');
        await page.waitForSelector('[role="menu"]');
        await page.click(`text=${languages[i].name}`);
        await page.waitForTimeout(200);
      }
      
      // Check final layout
      const finalLayout = await page.evaluate(() => ({
        width: document.documentElement.offsetWidth,
        height: document.documentElement.offsetHeight,
      }));
      
      // Layout should be stable (no significant shifts)
      expect(Math.abs(finalLayout.width - initialLayout.width)).toBeLessThan(10);
      expect(Math.abs(finalLayout.height - initialLayout.height)).toBeLessThan(50);
    });
  });

  test.describe('Accessibility', () => {
    test('should support keyboard navigation', async ({ page }) => {
      // Open language switcher
      await page.click('[data-testid="language-switcher"]');
      await page.waitForSelector('[role="menu"]');
      
      // Test keyboard navigation
      await page.keyboard.press('Tab'); // Focus on switcher
      await page.keyboard.press('Enter'); // Open dropdown
      await page.keyboard.press('ArrowDown'); // Navigate down
      await page.keyboard.press('Enter'); // Select language
      
      // Check if language changed
      await page.waitForTimeout(1000);
      
      // Should have keyboard focus indicators
      await expect(page.locator('[data-testid="language-switcher"]')).toBeFocused();
    });

    test('should support screen readers', async ({ page }) => {
      // Switch to Arabic
      await page.click('[data-testid="language-switcher"]');
      await page.waitForSelector('[role="menu"]');
      await page.click('text=العربية');
      await page.waitForTimeout(1000);
      
      // Check ARIA labels
      await expect(page.locator('[aria-label="Select Language"]')).toBeVisible();
      
      // Check if language is announced
      const announcements = await page.locator('[role="status"]').all();
      const hasLanguageAnnouncement = announcements.some(async el => {
        const text = await el.textContent();
        return text?.includes('العربية') || text?.includes('Arabic');
      });
      
      expect(hasLanguageAnnouncement).toBe(true);
    });

    test('should maintain focus management', async ({ page }) => {
      // Focus on language switcher
      await page.click('[data-testid="language-switcher"]');
      await page.waitForTimeout(1000);
      
      // Open dropdown
      await page.keyboard.press('Enter');
      
      // Check focus stays within dropdown
      const focusedElement = await page.evaluate(() => document.activeElement);
      const dropdown = await page.locator('[role="menu"]');
      
      await expect(dropdown).toContain(focusedElement);
    });
  });
});
