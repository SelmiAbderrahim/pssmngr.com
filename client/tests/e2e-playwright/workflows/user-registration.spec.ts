import { test, expect } from '@playwright/test'

test.describe('User Registration Workflow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  test('should register new user successfully', async ({ page }) => {
    // Navigate to registration page
    await page.click('text=Sign Up')
    await expect(page).toHaveURL('/login')

    // Fill registration form
    await page.fill('[data-testid="email-input"]', 'newuser@example.com')
    await page.fill('[data-testid="password-input"]', 'SecurePass123!')
    await page.fill('[data-testid="name-input"]', 'New User')

    // Submit registration
    await page.click('[data-testid="register-button"]')

    // Should redirect to dashboard or onboarding
    await expect(page).toHaveURL(/dashboard|onboarding/)

    // Verify user is logged in (check for user-specific elements)
    await expect(page.locator('[data-testid="user-menu"]')).toBeVisible()
  })

  test('should show validation errors for invalid registration', async ({ page }) => {
    await page.click('text=Sign Up')
    await expect(page).toHaveURL('/login')

    // Try to submit empty form
    await page.click('[data-testid="register-button"]')

    // Should show validation errors
    await expect(page.locator('text=Email is required')).toBeVisible()
    await expect(page.locator('text=Password is required')).toBeVisible()
    await expect(page.locator('text=Name is required')).toBeVisible()
  })

  test('should show error for existing email', async ({ page }) => {
    await page.click('text=Sign Up')
    await expect(page).toHaveURL('/login')

    // Try to register with existing email
    await page.fill('[data-testid="email-input"]', 'existing@example.com')
    await page.fill('[data-testid="password-input"]', 'SecurePass123!')
    await page.fill('[data-testid="name-input"]', 'Existing User')

    await page.click('[data-testid="register-button"]')

    // Should show error message
    await expect(page.locator('text=Email already exists')).toBeVisible()
  })

  test('should validate password strength', async ({ page }) => {
    await page.click('text=Sign Up')
    await expect(page).toHaveURL('/login')

    await page.fill('[data-testid="email-input"]', 'test@example.com')
    await page.fill('[data-testid="name-input"]', 'Test User')

    // Test weak password
    await page.fill('[data-testid="password-input"]', '123')
    await expect(page.locator('text=Password must be at least 8 characters')).toBeVisible()

    // Test password without special characters
    await page.fill('[data-testid="password-input"]', 'password123')
    await expect(page.locator('text=Password must contain special character')).toBeVisible()
  })

  test('should handle registration with social login', async ({ page }) => {
    await page.click('text=Sign Up')
    await expect(page).toHaveURL('/login')

    // Mock Google OAuth (in real test, this would redirect to Google)
    await page.route('**/auth/google', route => {
      route.fulfill({
        status: 302,
        headers: {
          'Location': '/dashboard',
          'Set-Cookie': 'auth-token=mock-google-token'
        }
      })
    })

    await page.click('[data-testid="google-login-button"]')

    // Should redirect to dashboard after successful OAuth
    await expect(page).toHaveURL('/dashboard')
    await expect(page.locator('[data-testid="user-menu"]')).toBeVisible()
  })

  test('should handle registration errors gracefully', async ({ page }) => {
    await page.click('text=Sign Up')
    await expect(page).toHaveURL('/login')

    // Mock server error
    await page.route('**/api/auth/register', route => {
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Registration service unavailable' })
      })
    })

    await page.fill('[data-testid="email-input"]', 'test@example.com')
    await page.fill('[data-testid="password-input"]', 'SecurePass123!')
    await page.fill('[data-testid="name-input"]', 'Test User')

    await page.click('[data-testid="register-button"]')

    // Should show error message
    await expect(page.locator('text=Registration failed')).toBeVisible()
    await expect(page.locator('text=Please try again later')).toBeVisible()
  })

  test('should redirect to login page when clicking login link', async ({ page }) => {
    await page.click('text=Sign Up')
    await expect(page).toHaveURL('/login')

    // Click on login link
    await page.click('[data-testid="login-link"]')

    // Should switch to login form
    await expect(page.locator('[data-testid="login-form"]')).toBeVisible()
    await expect(page.locator('[data-testid="register-form"]')).not.toBeVisible()
  })

  test('should maintain form data during validation errors', async ({ page }) => {
    await page.click('text=Sign Up')
    await expect(page).toHaveURL('/login')

    // Fill partial form
    await page.fill('[data-testid="email-input"]', 'test@example.com')
    await page.fill('[data-testid="name-input"]', 'Test User')
    // Don't fill password

    await page.click('[data-testid="register-button"]')

    // Should show validation error but keep other fields
    await expect(page.locator('text=Password is required')).toBeVisible()
    await expect(page.locator('[data-testid="email-input"]')).toHaveValue('test@example.com')
    await expect(page.locator('[data-testid="name-input"]')).toHaveValue('Test User')
  })

  test('should handle email verification flow', async ({ page }) => {
    await page.click('text=Sign Up')
    await expect(page).toHaveURL('/login')

    // Mock email verification requirement
    await page.route('**/api/auth/register', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          requiresVerification: true,
          message: 'Please check your email to verify your account'
        })
      })
    })

    await page.fill('[data-testid="email-input"]', 'newuser@example.com')
    await page.fill('[data-testid="password-input"]', 'SecurePass123!')
    await page.fill('[data-testid="name-input"]', 'New User')

    await page.click('[data-testid="register-button"]')

    // Should show verification message
    await expect(page.locator('text=Please check your email')).toBeVisible()
    await expect(page.locator('text=to verify your account')).toBeVisible()
  })
})