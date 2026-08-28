import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const PARAGRAPH = [
  'Attention is not a switch that turns on when we decide to concentrate.',
  'It is closer to a small agreement we keep making with the thing in front of us,',
  'renewed sentence by sentence for as long as the material earns it.',
  'A stable page helps because the eyes can move without negotiating a moving target,',
  'and the reading boundary marks when to continue while the text stays where it was placed.',
].join(' ');

// The roll rejects anything under three hundred words, so the fixture has to
// be a plausible article rather than a token stub.
const WIKIPEDIA_ARTICLE = {
  title: 'A brief note on attention',
  byline: null,
  siteName: 'Wikipedia',
  sourceUrl: 'https://en.wikipedia.org/wiki/Attention',
  paragraphs: Array.from({ length: 8 }, (_, index) => `${index + 1}. ${PARAGRAPH}`),
};

const QUIZ = {
  questions: Array.from({ length: 4 }, (_, index) => ({
    prompt: `Grounded question ${index + 1}?`,
    choices: ['Supported answer', 'Distractor one', 'Distractor two', 'Distractor three'],
    correctIndex: 0,
    explanation: `Grounded explanation ${index + 1}.`,
  })),
};

async function rollToBetScreen(page: Page) {
  await page.locator('.roll-action').click();
  await expect(page.getByRole('main', { name: 'Rolling an article' })).toBeVisible();
  await expect(page.locator('.roll-workspace')).toHaveCSS('place-items', 'center');
  await expect(page.locator('.bet-workspace')).toBeVisible({ timeout: 8_000 });
}

async function playRound(page: Page) {
  await page.locator('.bet-start').click();
  await expect(page.locator('.reader-shell')).toBeVisible();
  await expect(page.locator('.reading-line.active')).toBeVisible();
  await expect(page.getByRole('progressbar', { name: 'Article progress' })).toContainText('0%read');
  for (let index = 0; index < 200 && await page.locator('.article-end .primary-button').count() === 0; index += 1) {
    await page.keyboard.press('ArrowDown');
  }
  await page.keyboard.press('ArrowDown');
}

async function answerAll(page: Page, choice = 0) {
  for (let index = 0; index < QUIZ.questions.length; index += 1) {
    const question = page.locator('.quiz-question');
    await expect(question).toHaveCount(1);
    await question.locator('.quiz-choices label', { hasText: choice === 0 ? 'Supported answer' : 'Distractor one' }).click();
    if (index < QUIZ.questions.length - 1) {
      await expect(question.locator('legend')).toContainText(`Grounded question ${index + 2}?`);
    }
  }
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('wikispreed:tier:v1', 'brisk'));
  await page.route('**/api/quiz', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: { available: true } });
      return;
    }
    await route.fulfill({ json: QUIZ });
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

test('the front door is one roll and the rules of a round', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Read fast/ })).toBeVisible();
  await expect(page.locator('.roll-action')).toHaveText(/Roll/);
  await expect(page.locator('.home-rules li')).toHaveCount(4);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  if (testInfo.project.name === 'mobile') {
    expect(await page.evaluate(() => {
      const lead = document.querySelector('.home-lead')!.getBoundingClientRect();
      const marquee = document.querySelector('.marquee-housing')!.getBoundingClientRect();
      const roll = document.querySelector('.roll-action')!.getBoundingClientRect();
      const center = (bounds: DOMRect) => bounds.left + bounds.width / 2;
      return Math.max(Math.abs(center(lead) - center(marquee)), Math.abs(center(lead) - center(roll)));
    })).toBeLessThanOrEqual(1);
  }
  expect(errors).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('home.png'), fullPage: true });
});

test('rolling uses one serial, identified Wikipedia request before extraction', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('en.wikipedia.org/w/api.php') || request.url().includes('/api/extract')) {
      requests.push(request.url());
    }
  });
  await page.goto('/');
  const wikipediaRequest = page.waitForRequest((request) => request.url().includes('en.wikipedia.org/w/api.php'));
  await page.locator('.roll-action').click();
  const request = await wikipediaRequest;
  const url = new URL(request.url());
  expect(url.searchParams.get('generator')).toBe('random');
  expect(url.searchParams.get('grnnamespace')).toBe('0');
  expect(url.searchParams.get('maxlag')).toBe('5');
  expect(request.headers()['api-user-agent']).toContain('github.com/adhvfed/speed-read');
  await expect(page.locator('.bet-workspace')).toBeVisible({ timeout: 8_000 });
  // Exactly one selection call, and the article fetch strictly after it.
  expect(requests.filter((item) => item.includes('en.wikipedia.org'))).toHaveLength(1);
  expect(requests.findIndex((item) => item.includes('en.wikipedia.org')))
    .toBeLessThan(requests.findIndex((item) => item.includes('/api/extract')));
});

test('the bet screen quotes the stake and takes a speed from the keyboard', async ({ page }, testInfo) => {
  await page.goto('/');
  await rollToBetScreen(page);
  await expect(page.locator('.bet-header h1')).toHaveText(WIKIPEDIA_ARTICLE.title);
  await expect(page.locator('.tier-option')).toHaveCount(6);
  await expect(page.locator('.bet-start')).toHaveText('Start 300 wpm');
  await expect(page.locator('.bet-ladder-head')).toContainText('1,800');

  await page.keyboard.press('5');
  await expect(page.locator('.tier-option.selected .tier-name')).toHaveText('Blitz');
  await expect(page.locator('.bet-start')).toHaveText('Start 600 wpm');
  await expect(page.locator('.bet-ladder-head')).toContainText('3,600');
  await page.screenshot({ path: testInfo.outputPath('bet.png'), fullPage: true });

  // The chosen tier survives a reroll, because it is the player's standing bet.
  await page.keyboard.press('2');
  await expect(page.locator('.bet-start')).toHaveText('Start 300 wpm');
});

test('the committed speed is locked once the round starts', async ({ page }, testInfo) => {
  await page.goto('/');
  await rollToBetScreen(page);
  await page.keyboard.press('4');
  await page.locator('.bet-start').click();
  await expect(page.locator('.reader-shell')).toBeVisible();
  await expect(page.locator('.committed-speed strong')).toHaveText('500');

  // No pace controls exist, and the arrow keys that used to change pace do not.
  await expect(page.getByRole('button', { name: 'Slower' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Faster' })).toHaveCount(0);
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.committed-speed strong')).toHaveText('500');
  await page.screenshot({ path: testInfo.outputPath('reader.png') });
});

test('space holds the boundary and escape abandons the round', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('wikispreed:tier:v1', 'reckless'));
  await page.goto('/');
  await rollToBetScreen(page);
  await page.locator('.bet-start').click();
  const active = page.locator('.reading-line.active');
  await expect(active).toBeVisible();

  await page.keyboard.press('Space');
  await expect(page.locator('.reader-shell')).toHaveClass(/timer-paused/);
  // Sample the held line only once the measure has settled, so a re-wrap is
  // not mistaken for the boundary advancing.
  await page.waitForTimeout(400);
  const held = await active.textContent();
  await page.waitForTimeout(2_000);
  await expect(active).toHaveText(held ?? '');

  await page.keyboard.press('Space');
  await expect(page.locator('.reader-shell')).not.toHaveClass(/timer-paused/);
  await expect(active).not.toHaveText(held ?? '', { timeout: 4_000 });

  await page.keyboard.press('Escape');
  await expect(page.locator('.roll-action')).toBeVisible();
  // An abandoned round scores nothing.
  expect(await page.evaluate(() => localStorage.getItem('wikispreed:rounds:v1'))).toBeNull();
});

test('the reading window stays covered and within a comfortable measure', async ({ page }, testInfo) => {
  await page.goto('/?demo=reader');
  const active = page.locator('.reading-line.active');
  await expect(active).toBeVisible();
  await expect(page.locator('.reading-line.window-visible')).toHaveCount(3);
  await expect(page.getByRole('progressbar', { name: 'Article progress' })).toBeVisible();

  expect(await page.evaluate(() => {
    const lines = [...document.querySelectorAll<HTMLElement>('.reading-line')];
    const activeIndex = lines.findIndex((line) => line.classList.contains('active'));
    const hidden = lines[activeIndex + 3];
    if (!hidden) return true;
    const bounds = hidden.getBoundingClientRect();
    const future = document.querySelector('.reading-future-curtain')!.getBoundingClientRect();
    return hidden.getAttribute('aria-hidden') === 'true'
      && getComputedStyle(hidden).color === 'rgba(0, 0, 0, 0)'
      && future.top <= bounds.top;
  })).toBe(true);

  await expect.poll(() => page.evaluate(() => {
    const curtain = document.querySelector('.reading-curtain')!.getBoundingClientRect();
    const line = document.querySelector('.reading-line.active')!.getBoundingClientRect();
    return Math.abs(curtain.bottom - line.top);
  })).toBeLessThanOrEqual(5);

  expect(await page.evaluate(() => {
    const marker = document.querySelector('.reading-progress-marker')!.getBoundingClientRect();
    const line = document.querySelector('.reading-line.active')!.getBoundingClientRect();
    return Math.abs(marker.bottom - line.top);
  })).toBeLessThanOrEqual(5);
  await page.screenshot({ path: testInfo.outputPath('reader-progress.png'), fullPage: true });
});

test('manual reader scrolling remains under the player’s control', async ({ page }) => {
  await page.goto('/?demo=reader');
  await page.keyboard.press('Space');
  await page.evaluate(() => window.scrollBy({ top: 160, behavior: 'auto' }));
  const manuallyScrolledTo = await page.evaluate(() => window.scrollY);
  expect(manuallyScrolledTo).toBeGreaterThan(50);
  await page.waitForTimeout(250);
  expect(await page.evaluate(() => window.scrollY)).toBe(manuallyScrolledTo);
});

test('a reading line stays within the comfortable measure', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'The measure cap only binds where the viewport is wider than it.');
  await page.goto('/?demo=reader');
  await expect(page.locator('.reading-line.active')).toBeVisible();
  const longest = await page.evaluate(() => Math.max(
    ...[...document.querySelectorAll('.reading-line')].map((line) => (line.textContent ?? '').trim().length),
  ));
  expect(longest).toBeLessThanOrEqual(78);
  expect(longest).toBeGreaterThanOrEqual(50);
});

test('keyboard focus follows a focused reading line when the boundary advances', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('wikispreed:tier:v1', 'reckless'));
  await page.goto('/?demo=reader');
  const active = page.locator('.reading-line.active');
  await active.focus();
  const firstLabel = await active.getAttribute('aria-label');
  await expect(active).not.toHaveAttribute('aria-label', firstLabel ?? '', { timeout: 4_000 });
  await expect.poll(() => page.evaluate(() => (
    document.activeElement?.classList.contains('reading-line') && document.activeElement?.getAttribute('aria-current')
  ))).toBe('true');
});

test('a finished round is scored, banked, and restorable from its hash', async ({ page }, testInfo) => {
  await page.goto('/');
  await rollToBetScreen(page);
  await page.keyboard.press('2'); // Brisk, 300 wpm
  await playRound(page);

  await expect(page.locator('.quiz-round-meta')).toContainText('Recall', { timeout: 8_000 });
  await expect(page.locator('.quiz-question')).toHaveCount(1);
  await expect(page.locator('.quiz-question legend')).toContainText('Grounded question 1?');
  await expect(page.getByRole('button', { name: 'Next question' })).toHaveCount(0);
  await page.waitForTimeout(350);
  await page.screenshot({ path: testInfo.outputPath('quiz.png'), fullPage: true });
  await answerAll(page);

  // Submitting ends on question four; the answer key is a fresh review pass.
  await expect(page.locator('.quiz-question legend')).toContainText('Grounded question 1?');
  await expect(page.locator('.quiz-back')).toBeDisabled();
  // 4 correct x 300 wpm = 1200, x1.5 for the clean sweep = 1800. No streak yet.
  await expect(page.locator('.scoreboard')).toContainText('Clean sweep');
  await expect(page.locator('.score-reel')).toHaveAttribute('aria-label', '1,800', { timeout: 4_000 });
  await expect(page.locator('.round-summary')).toContainText('Streak 1');
  await expect(page.locator('.round-standing .rank-points')).toHaveAttribute('aria-label', '1,800');
  await page.screenshot({ path: testInfo.outputPath('scored.png'), fullPage: true });

  await expect.poll(() => page.evaluate(() => location.hash)).toMatch(/^#score\//);
  await page.reload();
  await expect(page.getByRole('heading', { name: '4 of 4' })).toBeVisible();
  await expect(page.locator('.quiz-question input[type="radio"]:checked')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Again 300 wpm' }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Change speed' })).toBeVisible();
  await page.getByRole('button', { name: 'Again 300 wpm' }).click();
  await expect(page.getByRole('main', { name: 'Rolling an article' })).toBeVisible();
  await expect(page.locator('.reader-shell')).toBeVisible({ timeout: 8_000 });
  await expect(page.locator('.committed-speed strong')).toHaveText('300');
});

test('a failed round pays less and resets the streak', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'The scoring path is covered once.');
  await page.goto('/');
  await rollToBetScreen(page);
  await page.keyboard.press('2');
  await playRound(page);
  await expect(page.locator('.quiz-round-meta')).toContainText('Recall', { timeout: 8_000 });
  // Every second choice is wrong, so this scores zero of four.
  await answerAll(page, 1);
  await expect(page.locator('.scoreboard')).toContainText('Failed');
  await expect(page.locator('.score-reel')).toHaveAttribute('aria-label', '0', { timeout: 4_000 });
  await expect(page.locator('.round-summary')).toContainText('Streak reset');
});

test('progress reports the comprehension curve and the round log', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'The scoring path is covered once.');
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Record' })).toBeVisible();
  await page.getByRole('button', { name: 'Record' }).click();
  await expect(page.getByRole('heading', { name: 'No rounds yet' })).toBeVisible();

  await page.getByRole('button', { name: 'Roll an article' }).click();
  await expect(page.locator('.bet-workspace')).toBeVisible({ timeout: 8_000 });
  await page.keyboard.press('2');
  await playRound(page);
  await expect(page.locator('.quiz-round-meta')).toContainText('Recall', { timeout: 8_000 });
  await answerAll(page);
  await page.locator('.round-next').getByRole('button', { name: 'Record' }).click();

  await expect(page.getByRole('heading', { name: 'Record' })).toBeVisible();
  await expect(page.locator('.curve-row')).toHaveCount(6);
  await expect(page.locator('.curve-row', { hasText: 'Brisk' })).toContainText('100%');
  await expect(page.locator('.curve-row.untested')).toHaveCount(5);
  await expect(page.locator('.round-row')).toHaveCount(1);
  await expect(page.locator('.round-result .clean')).toHaveText('4/4');
  await page.screenshot({ path: testInfo.outputPath('progress.png'), fullPage: true });

  await page.getByRole('button', { name: 'Review' }).click();
  await expect(page.getByRole('heading', { name: '4 of 4' })).toBeVisible();
});

test('an unknown saved-article hash falls back to the front door', async ({ page }) => {
  await page.goto('/#round/abcdef0123456789');
  await expect(page.getByRole('heading', { name: /Read fast/ })).toBeVisible();
  await expect.poll(() => page.evaluate(() => location.hash)).toBe('');
});

test('a rolled article can be returned to from its hash', async ({ page }) => {
  await page.goto('/');
  await rollToBetScreen(page);
  await expect.poll(() => page.evaluate(() => location.hash)).toMatch(/^#round\/[a-f0-9]{16,64}$/);
  await page.reload();
  // A round cannot resume mid-clock, so a saved article returns to its bet.
  await expect(page.locator('.bet-workspace')).toBeVisible();
  await expect(page.locator('.bet-header h1')).toHaveText(WIKIPEDIA_ARTICLE.title);
});

test('touch controls replace keyboard controls on mobile', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'Mobile-only control transformation.');
  await page.goto('/?demo=reader');
  const dock = page.locator('.mobile-reader-controls');
  await expect(dock).toBeVisible();
  // Pace is committed before the round, so the dock carries three controls.
  await expect(dock.locator('.reader-control')).toHaveCount(3);
  await expect(dock.getByRole('button', { name: 'Next' })).toBeVisible();
  await expect(page.locator('.mobile-status-progress')).toHaveText('0%');
  expect(await page.locator('.countdown-bar').evaluate((element) => {
    const origin = Number.parseFloat(getComputedStyle(element).transformOrigin);
    return Math.abs(origin - (element as HTMLElement).offsetWidth);
  })).toBeLessThanOrEqual(1);
  const firstText = await page.locator('.reading-line.active').textContent();
  await dock.getByRole('button', { name: 'Next' }).click();
  await expect(page.locator('.reading-line.active')).not.toHaveText(firstText ?? '');
  await expect(page.locator('.mobile-status-progress')).not.toHaveText('0%');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await page.screenshot({ path: testInfo.outputPath('reader-mobile.png') });
});

test('rounds cannot be scored when recall checks are unavailable', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'Covered once.');
  await page.unroute('**/api/quiz');
  await page.route('**/api/quiz', async (route) => route.fulfill({ json: { available: false } }));
  await page.goto('/');
  await expect(page.getByText('Scoring offline')).toBeVisible();
  await rollToBetScreen(page);
  await playRound(page);
  await expect(page.getByRole('heading', { name: 'No score' })).toBeVisible();
});
