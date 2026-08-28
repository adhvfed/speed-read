import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const WIKIPEDIA_ARTICLE = {
  title: 'A brief note on attention',
  byline: null,
  siteName: 'Wikipedia',
  sourceUrl: 'https://en.wikipedia.org/wiki/Attention',
  paragraphs: [
    'Attention is not a switch that turns on when we decide to concentrate. It is closer to a small agreement we keep making with the thing in front of us.',
    'A stable page helps because the eyes can move without negotiating a moving target. The reading boundary marks when to continue while the text itself remains where it was placed.',
    'Pace matters, but only as a useful constraint. A pace that is slightly demanding can quiet the impulse to circle back over familiar words. A pace that is too fast turns reading into guessing.',
    'The useful measure is therefore personal. Can you stay with the argument, remember its shape, and finish more comfortably than you did before? Improvement begins with that honest comparison.',
    'This article is long enough to try the controls. Use the arrow keys on a keyboard, or the controls at the bottom of a phone. Notice that the boundary advances while the page itself stays still.',
  ],
};

async function startRoulette(page: Page) {
  await page.getByRole('button', { name: 'Roll Wikipedia' }).click();
  await expect(page.getByRole('main', { name: 'Choosing a Wikipedia article' })).toBeVisible();
  await expect(page.locator('.rolling-die')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start reading' }).first()).toBeVisible({ timeout: 5_000 });
}

async function finishReading(page: Page) {
  await page.getByRole('button', { name: 'Start reading' }).click();
  const lineCount = await page.locator('.reading-line').count();
  for (let index = 0; index < lineCount; index += 1) await page.keyboard.press('ArrowDown');
}

test.beforeEach(async ({ page }) => {
  await page.route('**/api/quiz', async (route) => {
    await route.fulfill({ json: { available: false } });
  });
  await page.route('**/api/title', async (route) => {
    await route.fulfill({ json: { title: 'How Attention Shapes Reading' } });
  });
  await page.route(/https:\/\/en\.wikipedia\.org\/w\/api\.php.*/, async (route) => {
    await route.fulfill({ json: {
      query: { pages: [{ pageid: 42, title: WIKIPEDIA_ARTICLE.title, fullurl: WIKIPEDIA_ARTICLE.sourceUrl }] },
    } });
  });
  await page.route('**/api/extract', async (route) => {
    await route.fulfill({ json: WIKIPEDIA_ARTICLE });
  });
});

test('intake is ready for a link or pasted text without horizontal overflow', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Improve your speed reading' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Roll Wikipedia' })).toBeVisible();
  await expect(page.getByLabel('Link or text')).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  expect(errors).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('intake.png'), fullPage: true });
});

test('Wikipedia roulette uses a serial, identifiable random request before extraction', async ({ page }, testInfo) => {
  const requests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('en.wikipedia.org/w/api.php') || request.url().includes('/api/extract')) requests.push(request.url());
  });
  await page.goto('/');
  const wikipediaRequest = page.waitForRequest((request) => request.url().includes('en.wikipedia.org/w/api.php'));
  await page.getByRole('button', { name: 'Roll Wikipedia' }).click();
  await expect(page.locator('.rolling-die')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('rolling.png'), fullPage: false });
  const request = await wikipediaRequest;
  const url = new URL(request.url());
  expect(url.searchParams.get('generator')).toBe('random');
  expect(url.searchParams.get('grnnamespace')).toBe('0');
  expect(request.headers()['api-user-agent']).toContain('github.com/adhvfed/speed-read');
  await expect(page.getByRole('button', { name: 'Start reading' }).first()).toBeVisible({ timeout: 5_000 });
  expect(requests.findIndex((item) => item.includes('en.wikipedia.org')))
    .toBeLessThan(requests.findIndex((item) => item.includes('/api/extract')));
});

test('a bare domain is inferred as an https link', async ({ page }) => {
  let postedUrl = '';
  await page.unroute('**/api/extract');
  await page.route('**/api/extract', async (route) => {
    postedUrl = (route.request().postDataJSON() as { url: string }).url;
    await route.fulfill({ json: WIKIPEDIA_ARTICLE });
  });
  await page.goto('/');
  await page.getByLabel('Link or text').fill('example.com/an-article');
  await page.getByRole('button', { name: 'Prepare reading' }).click();
  await expect(page.getByRole('button', { name: 'Start reading' }).first()).toBeVisible();
  expect(postedUrl).toBe('https://example.com/an-article');
});

test('pasted prose receives a generated title before the start gate appears', async ({ page }) => {
  let postedText = '';
  await page.unroute('**/api/title');
  await page.route('**/api/title', async (route) => {
    postedText = (route.request().postDataJSON() as { text: string }).text;
    await route.fulfill({ json: { title: 'Attention Without Moving the Page' } });
  });
  await page.goto('/');
  await page.getByLabel('Link or text').fill(
    'Attention works through repeated choices rather than a single switch. A stable page gives the eyes a fixed place to return to while a reading boundary controls progress. Readers can increase pace gradually while checking whether the argument still stays with them afterward.',
  );
  await page.getByRole('button', { name: 'Prepare reading' }).click();
  await expect(page.locator('.reader-start-gate h2')).toHaveText('Attention Without Moving the Page');
  expect(postedText).toContain('Attention works');
});

test('line and pace controls change state without moving the page', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('/?demo=reader');
  const active = page.locator('.reading-line.active');
  await expect(active).toBeVisible();
  await expect(page.locator('.reading-line.window-visible')).toHaveCount(3);
  expect(await page.evaluate(() => {
    const lines = [...document.querySelectorAll<HTMLElement>('.reading-line')];
    const activeIndex = lines.findIndex((line) => line.classList.contains('active'));
    const hiddenLine = lines[activeIndex + 3];
    if (!hiddenLine) return true;
    const bounds = hiddenLine.getBoundingClientRect();
    const hit = document.elementFromPoint(bounds.left + 8, bounds.top + bounds.height / 2);
    return Boolean(hit?.closest('.reading-future-curtain'));
  })).toBe(true);
  const firstText = await active.textContent();
  const scrollBefore = await page.evaluate(() => scrollY);
  await page.keyboard.press('ArrowDown');
  await expect(active).not.toHaveText(firstText ?? '');
  expect(await page.evaluate(() => scrollY)).toBe(scrollBefore);
  await expect(page.locator('.reading-curtain')).toHaveCSS('background-color', 'rgb(43, 64, 85)');
  await expect.poll(() => page.evaluate(() => {
    const curtain = document.querySelector('.reading-curtain')!.getBoundingClientRect();
    const line = document.querySelector('.reading-line.active')!.getBoundingClientRect();
    return Math.abs(curtain.bottom - line.top);
  })).toBeLessThanOrEqual(1);
  await expect.poll(() => page.evaluate(() => {
    const curtain = document.querySelector('.reading-future-curtain')!.getBoundingClientRect();
    const visible = [...document.querySelectorAll('.reading-line.window-visible')].at(-1)!.getBoundingClientRect();
    return Math.abs(curtain.top - visible.bottom);
  })).toBeLessThanOrEqual(1);
  const exposedPassedText = await page.evaluate(() => {
    const curtain = document.querySelector('.reading-curtain')!.getBoundingClientRect();
    const active = document.querySelector('.reading-line.active')!;
    const previous = active.previousElementSibling?.getBoundingClientRect();
    return previous ? previous.bottom - curtain.bottom : 0;
  });
  expect(exposedPassedText).toBeLessThanOrEqual(0.5);
  const paceBefore = Number(await page.locator('.reader-measurements strong').first().textContent());
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.reader-measurements strong').first()).toHaveText(String(paceBefore + 25));
  const clickedLine = page.locator('.reading-line').nth(2);
  await clickedLine.click();
  await expect(clickedLine).toHaveAttribute('aria-current', 'true');
  const clickedText = await active.textContent();
  await page.keyboard.press('ArrowDown');
  await expect(active).not.toHaveText(clickedText ?? '');
  const activeFits = await active.evaluate((element) => {
    const line = element.getBoundingClientRect();
    const copy = element.parentElement!.getBoundingClientRect();
    return element.scrollWidth <= element.clientWidth + 1 && line.right <= copy.right + 1;
  });
  expect(activeFits).toBe(true);
  expect(await page.evaluate(() => scrollY)).toBe(scrollBefore);
  expect(errors).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('reader.png'), fullPage: false });
});

test('countdown advances the boundary without scrolling the document', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('speed-read:wpm', '800'));
  await page.goto('/?demo=reader');
  const active = page.locator('.reading-line.active');
  const firstText = await active.textContent();
  const scrollBefore = await page.evaluate(() => scrollY);
  await expect(active).not.toHaveText(firstText ?? '', { timeout: 3_000 });
  expect(await page.evaluate(() => scrollY)).toBe(scrollBefore);
  await expect(page.locator('.reader-measurements strong').nth(1)).toHaveText('2');
});

test('a prepared article waits for Start and restores from its hash', async ({ page }, testInfo) => {
  await page.addInitScript(() => localStorage.setItem('speed-read:wpm', '800'));
  await page.goto('/');
  await startRoulette(page);
  await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute('aria-label'))).toBe('Start reading');
  await expect(page.getByRole('button', { name: 'Start reading' }).first()).toBeVisible();
  await expect(page.locator('.reader-start-gate h2')).toHaveText(WIKIPEDIA_ARTICLE.title);
  await expect(page.locator('.reading-line.window-visible')).toHaveCount(0);
  await expect(page.locator('.reading-line.active')).toHaveAttribute('tabindex', '-1');
  await expect(page.locator('.reading-line.active')).toHaveAttribute('aria-hidden', 'true');
  const startShape = await page.locator('.reader-start-orb').evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return { width: bounds.width, height: bounds.height, radius: getComputedStyle(element).borderRadius };
  });
  expect(startShape.width).toBe(startShape.height);
  expect(startShape.radius).toBe('50%');
  await expect.poll(() => page.evaluate(() => location.hash)).toMatch(/^#read\/[a-f0-9]{16,64}\/0$/);
  const firstText = await page.locator('.reading-line.active').textContent();
  await page.screenshot({ path: testInfo.outputPath('reader-ready.png'), fullPage: false });
  await page.waitForTimeout(1_100);
  await expect(page.locator('.reading-line.active')).toHaveText(firstText ?? '');

  await page.reload();
  await expect(page.locator('main.reader-main')).toHaveAttribute('aria-label', 'Reading A brief note on attention');
  await expect(page.getByRole('button', { name: 'Start reading' }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Start reading' }).first().click();
  await expect(page.locator('.reading-line.active')).toHaveAttribute('tabindex', '0');
  await expect(page.locator('.reading-line.active')).toHaveAttribute('aria-hidden', 'false');
  await expect(page.locator('.reading-line.active')).not.toHaveText(firstText ?? '', { timeout: 3_000 });
});

test('an unknown saved-article hash falls back to a new read', async ({ page }) => {
  await page.goto('/#read/abcdef0123456789/12');
  await expect(page.getByRole('heading', { name: 'Improve your speed reading' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => location.hash)).toBe('');
});

test('manual line movement pages only after the active boundary leaves the usable screen', async ({ page }) => {
  await page.goto('/');
  await startRoulette(page);
  await expect(page.getByRole('button', { name: 'Start reading' }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Start reading' }).first().click();
  await page.keyboard.press('ArrowDown');
  expect(await page.evaluate(() => scrollY)).toBe(0);

  for (let index = 0; index < 20 && await page.evaluate(() => scrollY === 0); index += 1) {
    await page.keyboard.press('ArrowDown');
  }
  const pagedDown = await page.evaluate(() => scrollY);
  expect(pagedDown).toBeGreaterThan(0);

  for (let index = 0; index < 20 && await page.evaluate((value) => scrollY >= value, pagedDown); index += 1) {
    await page.keyboard.press('ArrowUp');
  }
  expect(await page.evaluate(() => scrollY)).toBeLessThan(pagedDown);
});

test('a completed saved article can be read again', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'Completion workflow is covered once; responsive controls are tested separately.');
  await page.addInitScript(() => localStorage.setItem('speed-read:wpm', '800'));
  await page.goto('/');
  await startRoulette(page);
  await finishReading(page);
  await expect(page.getByRole('heading', { name: 'Your Wikipedia trail.' })).toBeVisible({ timeout: 3_000 });
  await page.getByRole('button', { name: 'Read again' }).click();
  await expect(page.getByRole('button', { name: 'Start reading' }).first()).toBeVisible();
  await expect(page.locator('.reading-line.active')).toHaveAttribute('aria-label', /Attention is not a switch/);
});

test('a completed read receives a restorable, scored quiz when the endpoint is available', async ({ page }, testInfo) => {
  const quiz = {
    questions: Array.from({ length: 4 }, (_, index) => ({
      prompt: `Grounded question ${index + 1}?`,
      choices: ['Supported answer', 'Distractor one', 'Distractor two', 'Distractor three'],
      correctIndex: 0,
      explanation: `Grounded explanation ${index + 1}.`,
    })),
  };
  let postedText = '';
  await page.unroute('**/api/quiz');
  await page.route('**/api/quiz', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: { available: true } });
      return;
    }
    const request = route.request();
    postedText = (request.postDataJSON() as { text: string }).text;
    expect(request.headers()['x-speed-read-client']).toMatch(/^[a-z0-9-]{16,100}$/i);
    await route.fulfill({ json: quiz });
  });

  await page.goto('/');
  await startRoulette(page);
  await finishReading(page);
  await expect(page.getByRole('heading', { name: 'What stayed with you?' })).toBeVisible({ timeout: 4_000 });
  expect(postedText).toContain('Attention');
  expect(postedText.length).toBeLessThanOrEqual(16_000);
  await page.screenshot({ path: testInfo.outputPath('quiz.png'), fullPage: true });

  for (const question of await page.locator('.quiz-question').all()) {
    await question.getByRole('radio').first().check();
  }
  await page.getByRole('button', { name: 'Check my answers' }).click();
  await expect(page.locator('.quiz-measure')).toContainText('4/ 4');
  await expect(page.getByText('Grounded explanation 4.')).toBeVisible();
  await expect.poll(() => page.evaluate(() => location.hash)).toMatch(/^#quiz\//);

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Here’s what stayed.' })).toBeVisible();
  await expect(page.locator('.quiz-question input[type="radio"]:checked')).toHaveCount(4);
  await page.getByRole('button', { name: 'See stats' }).click();
  await expect(page.getByText('Quiz 4/4')).toBeVisible();
  await expect(page.getByText('4/4 correct · 1 quiz')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Review quiz' })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('history.png'), fullPage: true });
  await page.getByRole('button', { name: 'Review quiz' }).click();
  await page.getByRole('button', { name: 'Roll next article' }).click();
  await expect(page.locator('.rolling-die')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start reading' }).first()).toBeVisible({ timeout: 5_000 });
});

test('keyboard focus follows a focused reading line when the boundary advances', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('speed-read:wpm', '800'));
  await page.goto('/?demo=reader');
  const active = page.locator('.reading-line.active');
  await active.focus();
  const firstLabel = await active.getAttribute('aria-label');
  await expect(active).not.toHaveAttribute('aria-label', firstLabel ?? '', { timeout: 3_000 });
  await expect.poll(() => page.evaluate(() => document.activeElement?.classList.contains('reading-line') && document.activeElement?.getAttribute('aria-current'))).toBe('true');
});

test('touch controls replace keyboard controls on mobile', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'Mobile-only control transformation.');
  await page.goto('/?demo=reader');
  const dock = page.locator('.mobile-reader-controls');
  await expect(dock).toBeVisible();
  await expect(dock.getByRole('button', { name: 'Next' })).toBeVisible();
  const firstText = await page.locator('.reading-line.active').textContent();
  await dock.getByRole('button', { name: 'Next' }).click();
  await expect(page.locator('.reading-line.active')).not.toHaveText(firstText ?? '');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await page.screenshot({ path: testInfo.outputPath('reader-mobile.png'), fullPage: false });
});
