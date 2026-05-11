import { test, expect } from '@playwright/test';

const RUN_ID = Date.now().toString(36);
const EMAIL = `test+${RUN_ID}@example.com`;
const PASSWORD = 'password-123456';
const USERNAME = `tt_${RUN_ID.slice(-6)}`;

test('signup → onboarding → create thread → reply', async ({ page }) => {
  // 1. Sign up
  await page.goto('/signup');
  await page.fill('input[type=email]', EMAIL);
  await page.fill('input[type=password]', PASSWORD);
  // Use Promise.race: either we navigate away from /signup (success) or we see
  // "Check your email" content appear on the page (email confirmation required).
  const [navigationResult] = await Promise.all([
    // Wait for navigation away from /signup — resolves with the new URL.
    page.waitForURL((url) => !url.pathname.endsWith('/signup'), { timeout: 15_000 })
      .then(() => 'navigated')
      .catch(() => 'stayed'),
    page.click('button[type=submit]:has-text("Create")'),
  ]);

  // If we're still on signup, email confirmations are enabled — skip gracefully.
  if (navigationResult === 'stayed' || page.url().includes('/signup')) {
    test.skip(true, 'Local Supabase has email confirmations enabled — set enable_confirmations=false in supabase/config.toml');
  }

  // 2. Onboarding: claim username
  await page.fill('input[placeholder=username]', USERNAME);
  await page.click('button:has-text("Continue")');
  await page.waitForURL('/');

  // 3. Create a thread
  await page.goto('/f/general/new');
  await page.fill('input[placeholder="Thread title"]', 'Hello e2e world');
  await page.fill('textarea', 'This is the OP body — first post in the thread.');
  await page.click('button:has-text("Create thread")');

  // Should land on /t/<uuid>
  await page.waitForURL(/\/t\/[0-9a-f-]+/, { timeout: 10_000 });

  // OP body should be visible on the page
  await expect(page.getByText('This is the OP body — first post in the thread.')).toBeVisible();

  // 4. Post a reply
  await page.fill('textarea', 'A reply to the thread.');
  await page.click('button:has-text("Post reply")');

  // Reply should now be visible
  await expect(page.getByText('A reply to the thread.')).toBeVisible({ timeout: 10_000 });
});
