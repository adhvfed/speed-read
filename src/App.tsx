/**
 * THESIS: WikiSpreed is a wager. You roll an article, bet a reading speed you
 * cannot change, and find out from a recall check whether the bet was good.
 * OWN-WORLD: Cool white and mineral-blue planes, one cobalt reading edge, and
 * scoreboards built from tabular numerals rather than badges and confetti.
 * STORY: Roll, commit, read under a locked clock, see what stayed, score, again.
 */
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { getStoredArticle, storeArticle } from './lib/articleStore';
import { extractArticle, generateQuiz, isQuizAvailable, randomWikipediaArticles } from './lib/api';
import { scoreQuiz } from './lib/quiz';
import { parseHashRoute, roundHash, scoreHash } from './lib/routes';
import {
  DEFAULT_TIER_ID,
  SPEED_TIERS,
  bestCleanSpeed,
  bestStreak,
  currentStreak,
  estimatedSeconds,
  formatClock,
  rankFor,
  recordForWpm,
  reliableCeiling,
  scoreRound,
  cleanSweepPayout,
  speedMultiplier,
  tierById,
  tierColorVar,
  tierForWpm,
  tierRecords,
  totalPoints,
} from './lib/game';
import type { ScoreBreakdown, SpeedTier } from './lib/game';
import { SAMPLE_ARTICLE, countWords, fallbackWrap, roundExcerpt, wrapParagraphs } from './lib/text';
import { loadPreferredTier, loadRounds, saveRound, savePreferredTier } from './lib/storage';
import { readingScrollDelta } from './lib/viewport';
import type { ArticleContent, GameRound, ReadingLine } from './types';

type View = 'home' | 'rolling' | 'bet' | 'reader' | 'round' | 'progress' | 'loading';
type QuizStatus = 'idle' | 'loading' | 'error';

type PendingRound = Omit<GameRound, 'correct' | 'questions' | 'score' | 'passed' | 'cleanSweep' | 'streakBefore'>;

/** Fewer words than this makes a thin round and a thin recall check. */
const MIN_ROUND_WORDS = 300;
/** Caps a round at roughly four minutes at the slowest tier. */
const MAX_ROUND_WORDS = 900;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function makeId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `round-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function prefersReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

/** Counts a score up so the reveal has a beat to it. Static under reduced motion. */
function useCountUp(target: number, durationMs = 900): number {
  const [value, setValue] = useState(() => (prefersReducedMotion() ? target : 0));

  useEffect(() => {
    if (prefersReducedMotion()) {
      setValue(target);
      return;
    }
    let frame = 0;
    const startedAt = performance.now();
    const step = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / durationMs);
      // Ease out so the number decelerates into its final value.
      setValue(Math.round(target * (1 - (1 - progress) ** 3)));
      if (progress < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [durationMs, target]);

  return value;
}

function Arrow({ direction }: { direction: 'left' | 'right' | 'up' | 'down' }) {
  const rotations = { left: 180, right: 0, up: -90, down: 90 } as const;
  return (
    <svg
      aria-hidden="true"
      className="icon"
      viewBox="0 0 24 24"
      style={{ transform: `rotate(${rotations[direction]}deg)` }}
    >
      <path d="M5 12h13M13 6l6 6-6 6" />
    </svg>
  );
}

function PauseIcon({ paused }: { paused: boolean }) {
  return (
    <svg aria-hidden="true" className="icon" viewBox="0 0 24 24">
      {paused ? <path d="M7 4l13 8-13 8z" fill="currentColor" stroke="none" /> : <path d="M8 4v16M16 4v16" />}
    </svg>
  );
}

function DiceIcon() {
  return (
    <svg className="dice-icon" viewBox="0 0 36 36" aria-hidden="true">
      <rect x="3" y="3" width="30" height="30" rx="5" />
      <circle cx="11" cy="11" r="2.1" />
      <circle cx="25" cy="11" r="2.1" />
      <circle cx="18" cy="18" r="2.1" />
      <circle cx="11" cy="25" r="2.1" />
      <circle cx="25" cy="25" r="2.1" />
    </svg>
  );
}

function DieFace({ value, className }: { value: number; className: string }) {
  return (
    <span className={`die-face ${className}`} data-value={value}>
      {Array.from({ length: 9 }, (_, index) => <i key={index} />)}
    </span>
  );
}

function RollingDie() {
  const [frontFace, setFrontFace] = useState(5);

  useEffect(() => {
    const timer = window.setInterval(() => setFrontFace((value) => value % 6 + 1), 420);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="die-scene" aria-hidden="true">
      <div className="rolling-die">
        <DieFace className="die-front" value={frontFace} />
        <DieFace className="die-back" value={2} />
        <DieFace className="die-right" value={3} />
        <DieFace className="die-left" value={4} />
        <DieFace className="die-top" value={1} />
        <DieFace className="die-bottom" value={6} />
      </div>
    </div>
  );
}

function Wordmark({ onClick }: { onClick?: () => void }) {
  return (
    <button className="wordmark" onClick={onClick} type="button" aria-label="WikiSpreed home">
      <span className="wordmark-mark" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      <span>WikiSpreed</span>
    </button>
  );
}

interface PlayerStanding {
  points: number;
  rank: ReturnType<typeof rankFor>;
  streak: number;
  rounds: number;
  bestClean: number | null;
}

function usePlayerStanding(rounds: GameRound[]): PlayerStanding {
  return useMemo(() => {
    const points = totalPoints(rounds);
    return {
      points,
      rank: rankFor(points),
      streak: currentStreak(rounds),
      rounds: rounds.length,
      bestClean: bestCleanSpeed(rounds),
    };
  }, [rounds]);
}

function RankBar({ standing, compact = false }: { standing: PlayerStanding; compact?: boolean }) {
  const { rank } = standing;
  return (
    <div className={`rank-bar${compact ? ' compact' : ''}`}>
      <div className="rank-bar-head">
        <strong>{rank.current.name}</strong>
        <span>{standing.points.toLocaleString()} pts</span>
      </div>
      <div className="rank-track" role="presentation">
        <i style={{ '--rank-fraction': `${rank.fraction * 100}%` } as CSSProperties} />
      </div>
      <p>
        {rank.next
          ? `${rank.pointsNeeded.toLocaleString()} to ${rank.next.name}`
          : 'Top rank reached'}
      </p>
    </div>
  );
}

function Shell({
  view,
  standing,
  onNavigate,
  children,
}: {
  view: View;
  standing: PlayerStanding;
  onNavigate: (view: View) => void;
  children: ReactNode;
}) {
  return (
    <div className="app-shell">
      <aside className="utility-shell">
        <Wordmark onClick={() => onNavigate('home')} />
        <nav className="primary-nav" aria-label="Primary">
          <button className={view === 'home' ? 'active' : ''} type="button" onClick={() => onNavigate('home')}>
            Play
          </button>
          <button className={view === 'progress' ? 'active' : ''} type="button" onClick={() => onNavigate('progress')}>
            Progress
          </button>
        </nav>
        {standing.rounds > 0 && (
          <div className="shell-standing">
            <RankBar standing={standing} compact />
            {standing.streak > 0 && (
              <p className="shell-streak"><b>{standing.streak}</b> round streak</p>
            )}
          </div>
        )}
        <p className="local-storage-note">Scores stay in this browser.</p>
      </aside>
      <div className="mobile-app-bar">
        <Wordmark onClick={() => onNavigate('home')} />
        <button className="mobile-progress-link" type="button" onClick={() => onNavigate('progress')}>
          {standing.rounds > 0 ? `${standing.points.toLocaleString()} pts` : 'Progress'}
        </button>
      </div>
      {children}
    </div>
  );
}

function Home({
  standing,
  rounds,
  onRoll,
  rollError,
  quizAvailable,
}: {
  standing: PlayerStanding;
  rounds: GameRound[];
  onRoll: () => void;
  rollError: string;
  quizAvailable: boolean | null;
}) {
  const ceiling = useMemo(() => reliableCeiling(rounds), [rounds]);
  const returning = standing.rounds > 0;

  return (
    <main className="workspace home-workspace">
      <section className="home-lead">
        <p className="eyebrow">Wikipedia speed-reading</p>
        <h1>Read fast.<br />Prove you got it.</h1>
        <button className="roll-action" type="button" onClick={onRoll}>
          <DiceIcon />
          <span>Roll</span>
          <Arrow direction="right" />
        </button>
        {rollError && <p className="form-error roll-error" role="alert">{rollError}</p>}
        {quizAvailable === false && (
          <p className="home-notice" role="status">Scoring is offline. You can still read.</p>
        )}
      </section>

      {returning ? (
        <section className="home-standing" aria-label="Your standing">
          <RankBar standing={standing} />
          <div className="standing-grid">
            <div><span>Streak</span><strong>{standing.streak}</strong></div>
            <div>
              <span>Best clean</span>
              <strong>{standing.bestClean ?? '0'}</strong><small>wpm</small>
            </div>
            <div><span>Rounds</span><strong>{standing.rounds}</strong></div>
          </div>
          {ceiling && (
            <p className="standing-note">
              Reliable at <b>{ceiling.tier.name}</b>. Go faster.
            </p>
          )}
        </section>
      ) : (
        <section className="home-rules" aria-label="How a round works">
          <ol>
            <li><b>Roll</b> an article</li>
            <li><b>Bet</b> a speed</li>
            <li><b>Read</b> it, locked</li>
            <li><b>Answer</b> four questions</li>
          </ol>
        </section>
      )}
    </main>
  );
}

function RollTransition({ title }: { title: string }) {
  return (
    <main className="workspace roll-workspace" aria-live="polite" aria-label="Rolling an article">
      <RollingDie />
      <div className="roll-copy">
        <p className="eyebrow">Rolling</p>
        <h1>{title || 'Choosing an article…'}</h1>
        <p>{title ? 'Cleaning it up…' : 'No peeking.'}</p>
      </div>
    </main>
  );
}

function BetScreen({
  article,
  rounds,
  selectedTier,
  onSelectTier,
  onStart,
  onReroll,
}: {
  article: ArticleContent;
  rounds: GameRound[];
  selectedTier: SpeedTier;
  onSelectTier: (tier: SpeedTier) => void;
  onStart: () => void;
  onReroll: () => void;
}) {
  const words = useMemo(() => countWords(article.paragraphs), [article.paragraphs]);
  const startRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const frame = requestAnimationFrame(() => startRef.current?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const handleKeys = (event: KeyboardEvent) => {
      const index = Number(event.key) - 1;
      if (Number.isInteger(index) && index >= 0 && index < SPEED_TIERS.length) {
        event.preventDefault();
        onSelectTier(SPEED_TIERS[index]);
        return;
      }
      const current = SPEED_TIERS.findIndex((tier) => tier.id === selectedTier.id);
      if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
        event.preventDefault();
        onSelectTier(SPEED_TIERS[Math.min(SPEED_TIERS.length - 1, current + 1)]);
      }
      if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
        event.preventDefault();
        onSelectTier(SPEED_TIERS[Math.max(0, current - 1)]);
      }
    };
    window.addEventListener('keydown', handleKeys);
    return () => window.removeEventListener('keydown', handleKeys);
  }, [onSelectTier, selectedTier.id]);

  return (
    <main className="workspace bet-workspace" aria-labelledby="bet-title">
      <header className="bet-header">
        <p className="eyebrow">Your article</p>
        <h1 id="bet-title" data-length={article.title.length > 44 ? 'long' : article.title.length > 24 ? 'medium' : 'short'}>
          {article.title}
        </h1>
        <p className="bet-meta">{words.toLocaleString()} words</p>
      </header>

      <section className="bet-ladder" aria-label="Choose your speed">
        <div className="bet-ladder-head">
          <h2>Bet a speed</h2>
          <p>4/4 pays <b>{cleanSweepPayout(selectedTier.wpm).toLocaleString()}</b></p>
        </div>
        <ul>
          {SPEED_TIERS.map((tier, index) => {
            const record = recordForWpm(rounds, tier.wpm);
            const selected = tier.id === selectedTier.id;
            const risky = record !== undefined && record.rounds > 0 && record.accuracy !== null && record.accuracy < 50;
            return (
              <li key={tier.id}>
                <button
                  type="button"
                  aria-pressed={selected}
                  className={`tier-option${selected ? ' selected' : ''}`}
                  style={{ '--tier-color': tierColorVar(tier) } as CSSProperties}
                  onClick={() => onSelectTier(tier)}
                  onDoubleClick={onStart}
                >
                  <kbd aria-hidden="true">{index + 1}</kbd>
                  <span className="tier-name">{tier.name}</span>
                  <span className="tier-wpm"><b>{tier.wpm}</b> wpm</span>
                  <span className="tier-multiplier">×{speedMultiplier(tier.wpm).toFixed(1)}</span>
                  <span className="tier-clock">{formatClock(estimatedSeconds(words, tier.wpm))}</span>
                  <span className={`tier-record${risky ? ' risky' : ''}`}>
                    {record && record.rounds > 0 ? `${record.accuracy}%` : 'new'}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <footer className="bet-actions" style={{ '--tier-color': tierColorVar(selectedTier) } as CSSProperties}>
        <button ref={startRef} className="primary-button bet-start" type="button" onClick={onStart}>
          Start · {selectedTier.wpm} wpm
        </button>
        <button className="quiet-button" type="button" onClick={onReroll}>Reroll</button>
      </footer>
    </main>
  );
}

function findActiveLine(lines: ReadingLine[], activeWord: number): number {
  if (lines.length === 0) return 0;
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if (activeWord >= lines[index].startWord) return index;
  }
  return 0;
}

/**
 * The comfortable measure for continuous reading. A `ch` unit is the width of
 * a zero, which is far wider than an average letter, so a `72ch` column
 * actually sets about ninety-four characters. The measure is derived from the
 * article's own text instead, which stays correct across fonts and languages.
 */
const TARGET_CHARACTERS = 68;

function readingMeasure(sample: string, available: number, measure: (text: string) => number): number {
  if (!sample) return available;
  const averageCharacter = measure(sample) / sample.length;
  if (!Number.isFinite(averageCharacter) || averageCharacter <= 0) return available;
  return Math.min(available, Math.round(TARGET_CHARACTERS * averageCharacter));
}

function useWrappedLines(paragraphs: string[]) {
  const copyRef = useRef<HTMLDivElement>(null);
  const [lines, setLines] = useState<ReadingLine[]>(() => fallbackWrap(paragraphs));

  useLayoutEffect(() => {
    const element = copyRef.current;
    const stage = element?.parentElement;
    if (!element || !stage) return;
    let frame = 0;
    let lastAvailable = -1;

    const update = (force = false) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const styles = getComputedStyle(element);
        const stageStyles = getComputedStyle(stage);
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        if (!context) return;
        context.font = `${styles.fontWeight} ${styles.fontSize} ${styles.fontFamily}`;
        const available = stage.clientWidth
          - Number.parseFloat(stageStyles.paddingLeft)
          - Number.parseFloat(stageStyles.paddingRight)
          - Number.parseFloat(styles.marginLeft)
          - Number.parseFloat(styles.marginRight);
        if (!force && available === lastAvailable) return;
        lastAvailable = available;
        if (available <= 0) return;

        const sample = paragraphs.join(' ').slice(0, 600);
        const width = readingMeasure(sample, available, (value) => context.measureText(value).width);
        element.style.width = `${width}px`;
        const next = wrapParagraphs(paragraphs, width, (value) => context.measureText(value).width);
        if (next.length > 0) setLines(next);
      });
    };

    // The stage is observed rather than the copy, because the copy's own width
    // is the output of this measurement and observing it would loop.
    const observer = new ResizeObserver(() => update());
    observer.observe(stage);
    void document.fonts.ready.then(() => update(true));
    update(true);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [paragraphs]);

  return { copyRef, lines };
}

function Countdown({ duration, identity }: { duration: number; identity: string }) {
  const style = { '--line-duration': `${duration}s` } as CSSProperties;
  return (
    <span className="countdown" key={identity} style={style} aria-label={`Line pace timer: ${duration.toFixed(1)} seconds`}>
      <svg viewBox="0 0 44 44" aria-hidden="true">
        <circle className="countdown-limit" cx="22" cy="22" r="17" pathLength="100" />
        <circle className="countdown-meter" cx="22" cy="22" r="17" pathLength="100" />
      </svg>
    </span>
  );
}

function ReaderControl({
  label,
  keyLabel,
  direction,
  onClick,
  disabled,
  className = '',
}: {
  label: string;
  keyLabel: string;
  direction: 'left' | 'right' | 'up' | 'down';
  onClick: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button className={`reader-control ${className}`} type="button" onClick={onClick} disabled={disabled}>
      <Arrow direction={direction} />
      <span>{label}</span>
      {keyLabel && <kbd>{keyLabel}</kbd>}
    </button>
  );
}

function Reader({
  article,
  articleId,
  committedWpm,
  storedLocally,
  onAbandon,
  onFinish,
}: {
  article: ArticleContent;
  articleId: string;
  committedWpm: number;
  storedLocally: boolean;
  onAbandon: () => void;
  onFinish: (round: PendingRound) => void | Promise<void>;
}) {
  const { copyRef, lines } = useWrappedLines(article.paragraphs);
  const [activeWord, setActiveWord] = useState(0);
  const [startedAt] = useState(() => new Date());
  const [curtainHeight, setCurtainHeight] = useState(0);
  const [futureCurtainTop, setFutureCurtainTop] = useState(0);
  const [timerRevision, setTimerRevision] = useState(0);
  const [documentPaused, setDocumentPaused] = useState(() => document.hidden);
  const [userPaused, setUserPaused] = useState(false);
  const activeElement = useRef<HTMLButtonElement>(null);
  const visibleEndElement = useRef<HTMLButtonElement>(null);
  const readerStage = useRef<HTMLDivElement>(null);
  const finished = useRef(false);
  const activeIndex = findActiveLine(lines, activeWord);
  const visibleEndIndex = Math.min(activeIndex + 2, Math.max(0, lines.length - 1));
  const activeLine = lines[activeIndex];
  const previousActiveIndex = useRef<number | null>(null);
  const pausedAt = useRef<number | null>(null);
  const pausedDuration = useRef(0);
  const totalWords = countWords(article.paragraphs);
  const tier = tierForWpm(committedWpm);
  const lineDuration = activeLine ? clamp((activeLine.text.split(/\s+/).length / committedWpm) * 60, 0.9, 12) : 2;
  const progress = lines.length > 1 ? Math.round((activeIndex / (lines.length - 1)) * 100) : 0;
  const wordsLeft = Math.max(0, totalWords - (activeLine?.startWord ?? 0));

  useLayoutEffect(() => {
    let frame = 0;
    if (activeElement.current && visibleEndElement.current && readerStage.current) {
      const readingLineHadFocus = document.activeElement?.classList.contains('reading-line');
      const activeTop = activeElement.current.getBoundingClientRect().top;
      const visibleEndBottom = visibleEndElement.current.getBoundingClientRect().bottom;
      const stageBounds = readerStage.current.getBoundingClientRect();
      const stageTop = stageBounds.top;
      setCurtainHeight(Math.max(0, activeTop - stageTop));
      setFutureCurtainTop(Math.max(0, visibleEndBottom - stageTop));
      if (readingLineHadFocus && document.activeElement !== activeElement.current) {
        activeElement.current.focus({ preventScroll: true });
      }

      const previous = previousActiveIndex.current;
      const direction = previous === null ? 0 : Math.sign(activeIndex - previous) as -1 | 0 | 1;
      previousActiveIndex.current = activeIndex;
      frame = requestAnimationFrame(() => {
        const element = activeElement.current;
        if (!element) return;
        const line = element.getBoundingClientRect();
        const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
        const mobile = window.matchMedia('(max-width: 760px)').matches;
        const topInset = mobile ? 56 : 24;
        const mobileDock = mobile
          ? document.querySelector<HTMLElement>('.mobile-reader-controls')
          : null;
        const bottomInset = mobile ? Math.ceil(mobileDock?.getBoundingClientRect().height ?? 76) : 72;
        let delta = readingScrollDelta({
          direction,
          lineTop: line.top,
          lineBottom: line.bottom,
          viewportHeight,
          mobile,
          topInset,
          bottomInset,
        });
        if (previous === null && (line.top < topInset || line.bottom > viewportHeight - bottomInset)) {
          delta = line.top - (mobile ? topInset + 24 : viewportHeight * 0.38);
        }
        if (Math.abs(delta) > 1) window.scrollBy({ top: delta, left: 0, behavior: 'auto' });
      });
    }
    return () => cancelAnimationFrame(frame);
  }, [activeIndex, lines, visibleEndIndex]);

  const selectLine = useCallback((startWord: number) => {
    setActiveWord(startWord);
    setTimerRevision((value) => value + 1);
  }, []);

  const moveLine = useCallback((delta: number) => {
    const next = clamp(activeIndex + delta, 0, Math.max(0, lines.length - 1));
    if (lines[next]) selectLine(lines[next].startWord);
  }, [activeIndex, lines, selectLine]);

  const finish = useCallback(() => {
    if (finished.current) return;
    finished.current = true;
    const completedAt = new Date();
    const pendingPause = pausedAt.current ? completedAt.getTime() - pausedAt.current : 0;
    const milliseconds = completedAt.getTime() - startedAt.getTime() - pausedDuration.current - pendingPause;
    void onFinish({
      id: makeId(),
      title: article.title,
      sourceUrl: article.sourceUrl,
      wordCount: totalWords,
      committedWpm,
      startedAt: startedAt.toISOString(),
      completedAt: completedAt.toISOString(),
      durationSeconds: Math.max(1, Math.round(milliseconds / 1000)),
      ...(storedLocally ? { articleId } : {}),
    });
  }, [article.sourceUrl, article.title, articleId, committedWpm, onFinish, startedAt, storedLocally, totalWords]);

  useEffect(() => {
    const handleVisibility = () => setDocumentPaused(document.hidden);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);

  const clockStopped = documentPaused || userPaused;

  // One accounting for every reason the clock stops, so a hidden tab and a
  // deliberate pause cannot double-count or cancel each other out.
  useEffect(() => {
    if (clockStopped) {
      if (pausedAt.current === null) pausedAt.current = Date.now();
      return;
    }
    if (pausedAt.current !== null) {
      pausedDuration.current += Date.now() - pausedAt.current;
      pausedAt.current = null;
      setTimerRevision((value) => value + 1);
    }
  }, [clockStopped]);

  const togglePause = useCallback(() => setUserPaused((value) => !value), []);

  useEffect(() => {
    if (!activeLine || clockStopped) return;
    const timer = window.setTimeout(() => {
      if (activeIndex === lines.length - 1) finish();
      else moveLine(1);
    }, lineDuration * 1_000);
    return () => window.clearTimeout(timer);
  }, [activeIndex, activeLine, clockStopped, finish, lineDuration, lines.length, moveLine, timerRevision]);

  useEffect(() => {
    const handleKeys = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches('input, textarea, [contenteditable="true"]')) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        onAbandon();
        return;
      }
      if (event.key === ' ') {
        event.preventDefault();
        togglePause();
        return;
      }
      if (!['ArrowUp', 'ArrowDown'].includes(event.key)) return;
      event.preventDefault();
      if (event.key === 'ArrowUp') moveLine(-1);
      if (event.key === 'ArrowDown') {
        if (activeIndex === lines.length - 1) finish();
        else moveLine(1);
      }
    };
    window.addEventListener('keydown', handleKeys);
    return () => window.removeEventListener('keydown', handleKeys);
  }, [activeIndex, finish, lines.length, moveLine, onAbandon, togglePause]);

  const atEnd = activeIndex === lines.length - 1;
  const nextAction = atEnd ? finish : () => moveLine(1);

  return (
    <div
      className={`reader-shell${clockStopped ? ' timer-paused' : ''}`}
      style={{ '--tier-color': tierColorVar(tier) } as CSSProperties}
    >
      <aside className="reader-utility">
        <Wordmark onClick={onAbandon} />
        <div className="reader-source">
          <p className="measurement-label">Reading</p>
          <h1>
            {article.sourceUrl ? (
              <a href={article.sourceUrl} target="_blank" rel="noreferrer">{article.title}</a>
            ) : article.title}
          </h1>
        </div>
        <div className="committed-speed">
          <span className="measurement-label">Locked</span>
          <strong>{committedWpm}</strong><small>wpm</small>
          <em>{tier.name} · ×{speedMultiplier(committedWpm).toFixed(1)}</em>
        </div>
        <div className="reader-progress">
          <div className="reader-progress-track" aria-hidden="true">
            <i style={{ '--read-fraction': `${progress}%` } as CSSProperties} />
          </div>
          <p><b>{progress}%</b> · {formatClock(estimatedSeconds(wordsLeft, committedWpm))} left</p>
        </div>
        <div className="desktop-reader-controls">
          <ReaderControl label="Previous line" keyLabel="↑" direction="up" onClick={() => moveLine(-1)} disabled={activeIndex === 0} />
          <ReaderControl label={atEnd ? 'Finish round' : 'Next line'} keyLabel="↓" direction="down" onClick={nextAction} />
          <button className="reader-control pause-control" type="button" onClick={togglePause} aria-pressed={userPaused}>
            <PauseIcon paused={userPaused} />
            <span>{userPaused ? 'Resume' : 'Pause'}</span>
            <kbd>Space</kbd>
          </button>
        </div>
        <div className="reader-utility-footer">
          <button className="quiet-button" type="button" onClick={onAbandon}>Quit</button>
          <span>{userPaused ? 'Paused' : 'Speed locked'}</span>
        </div>
      </aside>

      <main className="reader-main" aria-label={`Reading ${article.title}`}>
        <div className="mobile-reader-status">
          <button type="button" onClick={onAbandon} aria-label="Abandon round">×</button>
          <span><b>{committedWpm}</b> wpm</span>
          <span><b>{progress}</b>%</span>
        </div>
        <div className="reader-stage" ref={readerStage}>
          <div className="reading-curtain" style={{ height: curtainHeight }} aria-hidden="true">
            <span>{progress}% read</span>
          </div>
          <div className="reading-future-curtain" style={{ top: futureCurtainTop }} aria-hidden="true" />
          <div className="reader-copy" ref={copyRef}>
            {lines.map((line, index) => {
              const active = index === activeIndex;
              const visible = index >= activeIndex && index <= visibleEndIndex;
              return (
                <button
                  key={line.id}
                  ref={(element) => {
                    if (active) activeElement.current = element;
                    if (index === visibleEndIndex) visibleEndElement.current = element;
                  }}
                  type="button"
                  className={`reading-line${active ? ' active' : ''}${visible ? ' window-visible' : ''}${line.paragraphStart ? ' paragraph-start' : ''}`}
                  onClick={() => selectLine(line.startWord)}
                  tabIndex={active && visible ? 0 : -1}
                  aria-hidden={!visible}
                  aria-current={active ? 'true' : undefined}
                  aria-label={`${active ? 'Current line: ' : 'Move to line: '}${line.text}`}
                >
                  {active && <Countdown duration={lineDuration} identity={`${line.id}-${timerRevision}`} />}
                  {line.text}
                </button>
              );
            })}
            <div className="article-end">
              <span>End of article</span>
              {atEnd && <button className="primary-button" type="button" onClick={finish}>Finish round</button>}
            </div>
          </div>
        </div>
      </main>

      <div className="mobile-reader-controls" aria-label="Reading controls">
        <ReaderControl label="Previous" keyLabel="" direction="up" onClick={() => moveLine(-1)} disabled={activeIndex === 0} />
        <button className="reader-control" type="button" onClick={togglePause} aria-pressed={userPaused}>
          <PauseIcon paused={userPaused} />
          <span>{userPaused ? 'Resume' : 'Pause'}</span>
        </button>
        <ReaderControl label={atEnd ? 'Finish' : 'Next'} keyLabel="" direction="down" onClick={nextAction} />
      </div>
    </div>
  );
}

function Scoreboard({ breakdown, wpm, correct, questions }: {
  breakdown: ScoreBreakdown;
  wpm: number;
  correct: number;
  questions: number;
}) {
  const total = useCountUp(breakdown.total);
  return (
    <div className={`scoreboard${breakdown.passed ? ' passed' : ' failed'}`}>
      <p className="section-label">
        {breakdown.passed ? (breakdown.cleanSweep ? 'Clean sweep' : 'Round passed') : 'Round failed'}
      </p>
      <dl className="score-tally">
        <div>
          <dt>{correct} correct × {wpm} wpm</dt>
          <dd>{breakdown.base.toLocaleString()}</dd>
        </div>
        {breakdown.cleanSweep && (
          <div className="score-bonus">
            <dt>Clean sweep <em>×1.5</em></dt>
            <dd>+{breakdown.cleanSweepBonus.toLocaleString()}</dd>
          </div>
        )}
        {breakdown.streak > 0 && (
          <div className="score-bonus">
            <dt>Streak {breakdown.streak} <em>×{breakdown.streakMultiplier.toFixed(1)}</em></dt>
            <dd>+{breakdown.streakBonus.toLocaleString()}</dd>
          </div>
        )}
        <div className="score-total">
          <dt>Round score</dt>
          <dd>{total.toLocaleString()}</dd>
        </div>
      </dl>
      {!breakdown.passed && (
        <p className="score-note">Under three of {questions}. Streak resets.</p>
      )}
    </div>
  );
}

function RoundView({
  round,
  roundNumber,
  newBest,
  standing,
  status,
  error,
  onRetry,
  onPlayAgain,
  onChangeSpeed,
  onProgress,
  onSubmit,
}: {
  round: GameRound;
  roundNumber: number;
  newBest: boolean;
  standing: PlayerStanding;
  status: QuizStatus;
  error: string;
  onRetry: () => void;
  onPlayAgain: () => void;
  onChangeSpeed: () => void;
  onProgress: () => void;
  onSubmit: (answers: number[]) => void;
}) {
  const quiz = round.quiz;
  const submitted = round.quizAnswers !== undefined;
  const [answers, setAnswers] = useState<Record<number, number>>(() => Object.fromEntries(
    (round.quizAnswers ?? []).map((answer, index) => [index, answer]),
  ));
  const [questionIndex, setQuestionIndex] = useState(0);
  const [questionDirection, setQuestionDirection] = useState<'forward' | 'back'>('forward');
  const answeredCount = Object.keys(answers).length;

  const breakdown = useMemo(
    () => (submitted
      ? scoreRound({ correct: round.correct, total: round.questions, wpm: round.committedWpm, streak: round.streakBefore })
      : null),
    [round.committedWpm, round.correct, round.questions, round.streakBefore, submitted],
  );

  if (status === 'loading') {
    return (
      <main className="workspace round-workspace round-pending" aria-live="polite">
        <p className="section-label">Round complete</p>
        <h1>Writing your recall check…</h1>
        <p>Four questions, drawn only from the article you just read.</p>
        <div className="quiz-loading-lines" aria-hidden="true"><i /><i /><i /><i /></div>
      </main>
    );
  }

  if (status === 'error' || !quiz) {
    return (
      <main className="workspace round-workspace round-pending">
        <p className="section-label">Round complete</p>
        <h1>This round could not be scored.</h1>
        <p className="quiz-error" role="alert">{error || 'The recall check could not be created.'}</p>
        <div className="quiz-actions">
          {status === 'error' && <button className="primary-button" type="button" onClick={onRetry}>Try again</button>}
          <button className="quiet-button" type="button" onClick={onChangeSpeed}>Roll another article</button>
          <button className="quiet-button" type="button" onClick={onProgress}>See progress</button>
        </div>
      </main>
    );
  }

  const submit = () => {
    if (answeredCount !== quiz.questions.length) return;
    onSubmit(quiz.questions.map((_, index) => answers[index]));
    window.scrollTo({ top: 0, behavior: 'auto' });
  };

  const showQuestion = (nextIndex: number) => {
    setQuestionDirection(nextIndex > questionIndex ? 'forward' : 'back');
    setQuestionIndex(nextIndex);
  };

  const advance = () => {
    if (answers[questionIndex] === undefined) return;
    if (questionIndex === quiz.questions.length - 1) {
      submit();
      return;
    }
    showQuestion(questionIndex + 1);
  };

  const question = quiz.questions[questionIndex];

  return (
    <main className="workspace round-workspace">
      <header className="round-header">
        <div>
          <p className="section-label">
            Round {roundNumber} · {tierForWpm(round.committedWpm).name} · {round.committedWpm} wpm
          </p>
          <h1>{submitted ? 'Here’s what stayed.' : 'What stayed with you?'}</h1>
          {submitted ? (
            <p className="round-summary">
              {round.passed ? `Streak ${round.streakBefore + 1}` : 'Streak reset'}
              {newBest && <em> · New best</em>}
            </p>
          ) : (
            <p>Three of four to pass.</p>
          )}
        </div>
        {submitted && breakdown ? (
          <Scoreboard
            breakdown={breakdown}
            wpm={round.committedWpm}
            correct={round.correct}
            questions={round.questions}
          />
        ) : (
          <div className="quiz-measure" aria-live="polite">
            <span>Question</span>
            <strong>{questionIndex + 1}</strong>
            <small>/ {quiz.questions.length}</small>
          </div>
        )}
      </header>

      {submitted && (
        <section className="round-standing" aria-label="Your standing">
          <RankBar standing={standing} />
          <div className="round-next">
            <button className="primary-button" type="button" onClick={onPlayAgain}>
              Play again · {round.committedWpm} wpm
            </button>
            <button className="quiet-button" type="button" onClick={onChangeSpeed}>Change speed</button>
            <button className="quiet-button" type="button" onClick={onProgress}>See progress</button>
          </div>
        </section>
      )}

      <form className="quiz-form" onSubmit={(event) => { event.preventDefault(); submit(); }}>
        <div className="quiz-progress" aria-label={`Question ${questionIndex + 1} of ${quiz.questions.length}`}>
          {quiz.questions.map((item, index) => (
            <i
              key={item.prompt}
              className={`${index === questionIndex ? 'active' : ''}${answers[index] !== undefined ? ' answered' : ''}`}
              aria-hidden="true"
            />
          ))}
        </div>
        <div className={`quiz-question-stage ${questionDirection}`} key={`${submitted ? 'review' : 'quiz'}-${questionIndex}`}>
          <fieldset className="quiz-question" disabled={submitted}>
            <legend><span>{String(questionIndex + 1).padStart(2, '0')}</span>{question.prompt}</legend>
            <div className="quiz-choices">
              {question.choices.map((choice, choiceIndex) => {
                const selected = answers[questionIndex] === choiceIndex;
                const correct = submitted && choiceIndex === question.correctIndex;
                const incorrect = submitted && selected && !correct;
                return (
                  <label className={`${correct ? 'correct' : ''}${incorrect ? ' incorrect' : ''}`} key={`${choiceIndex}-${choice}`}>
                    <input
                      type="radio"
                      name={`question-${questionIndex}`}
                      value={choiceIndex}
                      checked={selected}
                      onChange={() => setAnswers((current) => ({ ...current, [questionIndex]: choiceIndex }))}
                    />
                    <span>{choice}</span>
                    {correct && <b>Correct answer</b>}
                    {incorrect && <b>Your answer</b>}
                  </label>
                );
              })}
            </div>
            {submitted && <p className="quiz-explanation">{question.explanation}</p>}
          </fieldset>
        </div>

        <footer className="quiz-footer">
          <button
            className="quiet-button quiz-back"
            type="button"
            onClick={() => showQuestion(questionIndex - 1)}
            disabled={questionIndex === 0}
          >
            <Arrow direction="left" /> Previous
          </button>
          <div className="quiz-actions">
            {!submitted ? (
              <button className="primary-button" type="button" onClick={advance} disabled={answers[questionIndex] === undefined}>
                {questionIndex === quiz.questions.length - 1 ? 'See my score' : 'Next question'}
                {questionIndex < quiz.questions.length - 1 && <Arrow direction="right" />}
              </button>
            ) : questionIndex < quiz.questions.length - 1 ? (
              <button className="primary-button" type="button" onClick={() => showQuestion(questionIndex + 1)}>
                Next answer <Arrow direction="right" />
              </button>
            ) : null}
          </div>
        </footer>
      </form>
    </main>
  );
}

function Progress({
  rounds,
  standing,
  onRoll,
  onReview,
}: {
  rounds: GameRound[];
  standing: PlayerStanding;
  onRoll: () => void;
  onReview: (round: GameRound) => void;
}) {
  const ordered = useMemo(
    () => [...rounds].sort((a, b) => b.completedAt.localeCompare(a.completedAt)),
    [rounds],
  );
  const records = useMemo(() => tierRecords(rounds), [rounds]);
  const ceiling = useMemo(() => reliableCeiling(rounds), [rounds]);
  const best = useMemo(() => bestStreak(rounds), [rounds]);

  return (
    <main className="workspace progress-workspace">
      <header className="progress-header">
        <div>
          <p className="eyebrow">Progress</p>
          <h1>{ordered.length === 0 ? 'Nothing played yet.' : 'Your speed record.'}</h1>
        </div>
        {ordered.length > 0 && (
          <button className="primary-button" type="button" onClick={onRoll}>Roll next article</button>
        )}
      </header>

      {ordered.length === 0 ? (
        <section className="progress-empty">
          <span className="empty-boundary" aria-hidden="true"><i /><i /><i /></span>
          <h2>Your first round is one roll away.</h2>
          <p>Play a couple of rounds and this shows where you break.</p>
          <button className="primary-button" type="button" onClick={onRoll}>Roll an article</button>
        </section>
      ) : (
        <>
          <section className="progress-standing" aria-label="Standing">
            <RankBar standing={standing} />
            <div className="standing-grid wide">
              <div><span>Rounds</span><strong>{standing.rounds}</strong></div>
              <div><span>Streak</span><strong>{standing.streak}</strong></div>
              <div><span>Best streak</span><strong>{best}</strong></div>
              <div>
                <span>Best clean speed</span>
                <strong>{standing.bestClean ?? 'none yet'}</strong>
                {standing.bestClean !== null && <small>wpm</small>}
              </div>
            </div>
          </section>

          <section className="curve" aria-labelledby="curve-title">
            <header>
              <h2 id="curve-title">Comprehension curve</h2>
              <p>
                {ceiling ? `Reliable to ${ceiling.tier.name}` : 'Two rounds at a tier to count'}
              </p>
            </header>
            <div className="curve-table">
              {records.map((record) => {
                const isCeiling = ceiling?.tier.id === record.tier.id;
                return (
                  <div
                    className={`curve-row${record.rounds === 0 ? ' untested' : ''}${isCeiling ? ' ceiling' : ''}`}
                    key={record.tier.id}
                    style={{ '--tier-color': tierColorVar(record.tier) } as CSSProperties}
                  >
                    <span className="curve-tier">{record.tier.name}</span>
                    <span className="curve-wpm">{record.tier.wpm}</span>
                    <div className="curve-bar" aria-hidden="true">
                      <i style={{ '--curve-width': `${record.accuracy ?? 0}%` } as CSSProperties} />
                    </div>
                    <strong>{record.accuracy === null ? 'n/a' : `${record.accuracy}%`}</strong>
                    <small>
                      {record.rounds === 0
                        ? 'new'
                        : `${record.correct}/${record.questions} · ${record.rounds}r${record.cleanSweeps > 0 ? ` · ${record.cleanSweeps} clean` : ''}`}
                    </small>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="round-log" aria-labelledby="round-log-title">
            <h2 id="round-log-title">Round log</h2>
            <div className="round-list">
              {ordered.map((round, index) => (
                <article className={`round-row${round.passed ? '' : ' failed'}`} key={round.id}>
                  <div className="round-index">{String(ordered.length - index).padStart(2, '0')}</div>
                  <div className="round-title">
                    <h3>
                      {round.sourceUrl ? (
                        <a href={round.sourceUrl} target="_blank" rel="noreferrer">{round.title}</a>
                      ) : round.title}
                    </h3>
                    <p>{new Date(round.completedAt).toLocaleDateString(undefined, { dateStyle: 'medium' })}</p>
                  </div>
                  <div className="round-speed"><b>{round.committedWpm}</b><small>wpm</small></div>
                  <div className="round-result">
                    <span className={round.cleanSweep ? 'clean' : round.passed ? '' : 'miss'}>
                      {round.correct}/{round.questions}
                    </span>
                  </div>
                  <div className="round-score">{round.score.toLocaleString()}</div>
                  <div className="round-actions">
                    {round.quiz && (
                      <button className="quiet-button" type="button" onClick={() => onReview(round)}>Review</button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </section>
        </>
      )}
    </main>
  );
}

export default function App() {
  const demo = new URLSearchParams(window.location.search).get('demo') === 'reader';
  const initialRoute = parseHashRoute(window.location.hash);
  const [view, setView] = useState<View>(
    demo ? 'reader' : initialRoute.view === 'round' ? 'loading' : initialRoute.view === 'score' ? 'round' : initialRoute.view,
  );
  const [article, setArticle] = useState<ArticleContent | null>(demo ? SAMPLE_ARTICLE : null);
  const [articleId, setArticleId] = useState<string | null>(demo ? 'demo-reader' : null);
  const [storedLocally, setStoredLocally] = useState(false);
  const [readerInstance, setReaderInstance] = useState(0);
  const [rounds, setRounds] = useState<GameRound[]>(() => loadRounds());
  const [tierId, setTierId] = useState(() => loadPreferredTier(DEFAULT_TIER_ID));
  const [activeRoundId, setActiveRoundId] = useState<string | null>(
    initialRoute.view === 'score' ? initialRoute.roundId : null,
  );
  const [quizStatus, setQuizStatus] = useState<QuizStatus>('idle');
  const [quizError, setQuizError] = useState('');
  const [quizAvailable, setQuizAvailable] = useState<boolean | null>(null);
  const [rollError, setRollError] = useState('');
  const [rollingTitle, setRollingTitle] = useState('');
  const rollInFlight = useRef(false);
  const rollGeneration = useRef(0);
  const rollAbort = useRef<AbortController | null>(null);

  const standing = usePlayerStanding(rounds);
  const selectedTier = tierById(tierId);

  const setRoute = useCallback((hash: string, mode: 'push' | 'replace' = 'push') => {
    const url = `${window.location.pathname}${window.location.search}${hash}`;
    window.history[mode === 'push' ? 'pushState' : 'replaceState'](null, '', url);
  }, []);

  const selectTier = useCallback((tier: SpeedTier) => {
    setTierId(tier.id);
    savePreferredTier(tier.id);
  }, []);

  useEffect(() => {
    let current = true;
    void isQuizAvailable().then((available) => {
      if (current) setQuizAvailable(available);
    });
    return () => { current = false; };
  }, []);

  useEffect(() => {
    if (demo) return;
    let generation = 0;
    const restoreRoute = async () => {
      const currentGeneration = ++generation;
      const route = parseHashRoute(window.location.hash);
      if (route.view === 'home' || route.view === 'progress') {
        setView(route.view);
        setArticle(null);
        setArticleId(null);
        setActiveRoundId(null);
        if (route.view === 'home' && window.location.hash) setRoute('', 'replace');
        return;
      }
      if (route.view === 'score') {
        const stored = loadRounds();
        const found = stored.find((round) => round.id === route.roundId);
        if (!found?.quiz) {
          setRoute('#progress', 'replace');
          setView('progress');
          return;
        }
        setRounds(stored);
        setArticle(null);
        setArticleId(null);
        setActiveRoundId(found.id);
        setQuizStatus('idle');
        setQuizError('');
        setView('round');
        return;
      }
      // A round in progress cannot be resumed meaningfully once its clock has
      // run, so a saved article always returns to the bet screen.
      setView('loading');
      const stored = await getStoredArticle(route.articleId);
      if (currentGeneration !== generation) return;
      if (!stored) {
        setRoute('', 'replace');
        setArticle(null);
        setArticleId(null);
        setView('home');
        return;
      }
      setArticle(stored.article);
      setArticleId(stored.id);
      setStoredLocally(true);
      setView('bet');
      window.scrollTo({ top: 0, behavior: 'auto' });
    };
    const handleRoute = () => void restoreRoute();
    void restoreRoute();
    window.addEventListener('popstate', handleRoute);
    window.addEventListener('hashchange', handleRoute);
    return () => {
      generation += 1;
      window.removeEventListener('popstate', handleRoute);
      window.removeEventListener('hashchange', handleRoute);
    };
  }, [demo, setRoute]);

  const rollArticle = async (startImmediately = false) => {
    if (rollInFlight.current) return;
    rollInFlight.current = true;
    const generation = ++rollGeneration.current;
    const controller = new AbortController();
    rollAbort.current = controller;
    let timedOut = false;
    const timeout = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 20_000);
    setRollError('');
    setRollingTitle('');
    setArticle(null);
    setArticleId(null);
    setActiveRoundId(null);
    setView('rolling');
    setRoute('');
    window.scrollTo({ top: 0, behavior: 'auto' });

    try {
      const [selectionResult] = await Promise.allSettled([
        randomWikipediaArticles(undefined, fetch, controller.signal),
        new Promise((resolve) => window.setTimeout(resolve, 1_100)),
      ]);
      if (selectionResult.status === 'rejected') throw selectionResult.reason;
      if (generation !== rollGeneration.current) return;

      // One API call supplies several candidates. Table-heavy articles render
      // almost no prose once furniture is stripped, so each is prepared in turn
      // until one is long enough to play. Preparation stays strictly serial.
      let nextArticle: ArticleContent | null = null;
      for (const selection of selectionResult.value) {
        if (generation !== rollGeneration.current) return;
        setRollingTitle(selection.title);
        const extracted = await extractArticle(selection.url, controller.signal).catch(() => null);
        if (!extracted) continue;
        const paragraphs = roundExcerpt(extracted.paragraphs, MAX_ROUND_WORDS);
        if (countWords(paragraphs) < MIN_ROUND_WORDS) continue;
        nextArticle = {
          ...extracted,
          paragraphs,
          title: selection.title,
          siteName: 'Wikipedia',
          sourceUrl: selection.url,
        };
        break;
      }
      if (!nextArticle) {
        throw new Error('Every article that came up was too thin to play. Roll again.');
      }
      if (generation !== rollGeneration.current) return;
      window.clearTimeout(timeout);
      const stored = await storeArticle(nextArticle, 'wikipedia');
      if (generation !== rollGeneration.current) return;
      setArticle(nextArticle);
      setArticleId(stored.id);
      setStoredLocally(stored.saved);
      if (startImmediately) setReaderInstance((value) => value + 1);
      setView(startImmediately ? 'reader' : 'bet');
      setRoute(roundHash(stored.id));
      window.scrollTo({ top: 0, behavior: 'auto' });
    } catch (error) {
      if (generation !== rollGeneration.current) return;
      setRollError(timedOut
        ? 'The roll took too long. Check your connection and roll again.'
        : error instanceof Error ? error.message : 'The roll did not land. Try again.');
      setView('home');
    } finally {
      window.clearTimeout(timeout);
      if (rollAbort.current === controller) rollAbort.current = null;
      if (generation === rollGeneration.current) rollInFlight.current = false;
    }
  };

  const navigate = (nextView: View) => {
    if (nextView === 'reader' || nextView === 'loading' || nextView === 'bet') return;
    rollAbort.current?.abort();
    rollAbort.current = null;
    rollGeneration.current += 1;
    rollInFlight.current = false;
    setRollingTitle('');
    setView(nextView);
    setArticle(null);
    setArticleId(null);
    setActiveRoundId(null);
    setQuizStatus('idle');
    setQuizError('');
    setRoute(nextView === 'progress' ? '#progress' : '');
    window.scrollTo({ top: 0, behavior: 'auto' });
  };

  const beginRound = () => {
    setReaderInstance((value) => value + 1);
    setView('reader');
    window.scrollTo({ top: 0, behavior: 'auto' });
  };

  const persistRound = (round: GameRound) => {
    saveRound(round);
    setRounds((current) => [round, ...current.filter((item) => item.id !== round.id)]);
  };

  const finishRound = async (partial: PendingRound) => {
    const round: GameRound = {
      ...partial,
      correct: 0,
      questions: 0,
      score: 0,
      passed: false,
      cleanSweep: false,
      streakBefore: currentStreak(rounds),
    };
    persistRound(round);
    setActiveRoundId(round.id);
    setRoute(scoreHash(round.id));
    window.scrollTo({ top: 0, behavior: 'auto' });

    const available = quizAvailable ?? await isQuizAvailable();
    setQuizAvailable(available);
    if (!available || !article) {
      setQuizStatus('error');
      setQuizError('Recall checks are unavailable right now, so this round cannot be scored.');
      setView('round');
      return;
    }
    setQuizStatus('loading');
    setQuizError('');
    setView('round');
    try {
      const quiz = await generateQuiz(article);
      persistRound({ ...round, quiz });
      setQuizStatus('idle');
    } catch (error) {
      setQuizStatus('error');
      setQuizError(error instanceof Error ? error.message : 'The recall check could not be created. Try again.');
    }
  };

  const retryQuiz = async () => {
    const round = rounds.find((candidate) => candidate.id === activeRoundId);
    if (!round) {
      navigate('progress');
      return;
    }
    let source = article;
    if (!source && round.articleId) source = (await getStoredArticle(round.articleId))?.article ?? null;
    if (!source) {
      setQuizStatus('error');
      setQuizError('That article is no longer stored in this browser, so the round cannot be scored.');
      return;
    }
    setQuizStatus('loading');
    setQuizError('');
    try {
      const quiz = await generateQuiz(source);
      persistRound({ ...round, quiz });
      setQuizStatus('idle');
    } catch (error) {
      setQuizStatus('error');
      setQuizError(error instanceof Error ? error.message : 'The recall check could not be created. Try again.');
    }
  };

  const submitAnswers = (answers: number[]) => {
    const round = rounds.find((candidate) => candidate.id === activeRoundId);
    if (!round?.quiz) return;
    const correct = scoreQuiz(round.quiz, Object.fromEntries(answers.map((answer, index) => [index, answer])));
    const questions = round.quiz.questions.length;
    const breakdown = scoreRound({
      correct,
      total: questions,
      wpm: round.committedWpm,
      streak: round.streakBefore,
    });
    persistRound({
      ...round,
      quizAnswers: answers,
      correct,
      questions,
      score: breakdown.total,
      passed: breakdown.passed,
      cleanSweep: breakdown.cleanSweep,
    });
  };

  const reviewRound = (round: GameRound) => {
    if (!round.quiz) return;
    setActiveRoundId(round.id);
    setQuizStatus('idle');
    setQuizError('');
    setArticle(null);
    setArticleId(null);
    setView('round');
    setRoute(scoreHash(round.id));
    window.scrollTo({ top: 0, behavior: 'auto' });
  };

  if (view === 'reader' && article && articleId) {
    return (
      <Reader
        key={`${articleId}-${readerInstance}`}
        article={article}
        articleId={articleId}
        committedWpm={selectedTier.wpm}
        storedLocally={storedLocally}
        onAbandon={() => navigate('home')}
        onFinish={finishRound}
      />
    );
  }

  const activeRound = activeRoundId ? rounds.find((round) => round.id === activeRoundId) : undefined;

  return (
    <Shell view={view} standing={standing} onNavigate={navigate}>
      {view === 'progress' ? (
        <Progress
          rounds={rounds}
          standing={standing}
          onRoll={() => void rollArticle()}
          onReview={reviewRound}
        />
      ) : view === 'round' && activeRound ? (
        <RoundView
          key={activeRound.id}
          round={activeRound}
          roundNumber={rounds.length - rounds.findIndex((item) => item.id === activeRound.id)}
          newBest={activeRound.cleanSweep && activeRound.committedWpm === standing.bestClean
            && !rounds.some((item) => item.id !== activeRound.id && item.cleanSweep && item.committedWpm >= activeRound.committedWpm)}
          standing={standing}
          status={quizStatus}
          error={quizError}
          onRetry={() => void retryQuiz()}
          onPlayAgain={() => void rollArticle(true)}
          onChangeSpeed={() => void rollArticle()}
          onProgress={() => navigate('progress')}
          onSubmit={submitAnswers}
        />
      ) : view === 'bet' && article ? (
        <BetScreen
          article={article}
          rounds={rounds}
          selectedTier={selectedTier}
          onSelectTier={selectTier}
          onStart={beginRound}
          onReroll={() => void rollArticle()}
        />
      ) : view === 'rolling' ? (
        <RollTransition title={rollingTitle} />
      ) : view === 'loading' ? (
        <main className="workspace restore-workspace" aria-live="polite">
          <p className="section-label">Saved locally</p>
          <h1>Restoring your article…</h1>
        </main>
      ) : (
        <Home
          standing={standing}
          rounds={rounds}
          onRoll={() => void rollArticle()}
          rollError={rollError}
          quizAvailable={quizAvailable}
        />
      )}
    </Shell>
  );
}
