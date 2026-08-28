/**
 * THESIS: Wikipedia roulette turns speed practice into a repeatable roll-read-recall loop; it refuses both generic import-first tooling and casino chrome.
 * OWN-WORLD: Cool white and mineral-blue planes, one broad cobalt roll field, a geometric die, one cobalt reading edge, and flat evidence rows.
 * STORY: Roll one useful article, read it at a chosen pace, see what stayed, then roll again with better evidence for the next speed.
 * FIRST VIEWPORT: Exact benefit copy leads into a dominant cobalt Wikipedia roll; one combined link-or-text field remains visibly secondary.
 * FORM: Information and wayfinding, with Wikipedia first and own-source second; Sutnar lineage, Catalog v1, seed random-e169e3b7c3a22bbf.
 */
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { getStoredArticle, storeArticle } from './lib/articleStore';
import { extractArticle, generateQuiz, generateTitle, isQuizAvailable, randomWikipediaArticle } from './lib/api';
import { scoreQuiz } from './lib/quiz';
import { parseHashRoute, quizHash, readerHash } from './lib/routes';
import { inferReadingSource } from './lib/source';
import { accuracyBySpeed } from './lib/stats';
import {
  SAMPLE_ARTICLE,
  countWords,
  fallbackWrap,
  pastedTextToArticle,
  wrapParagraphs,
} from './lib/text';
import { loadLocalPace, loadLocalSessions, saveLocalPace, saveLocalSession } from './lib/storage';
import { readingScrollDelta } from './lib/viewport';
import type { ArticleContent, CompletedSession, ReadingLine, ReadingQuiz } from './types';

type View = 'home' | 'reader' | 'history' | 'quiz' | 'loading' | 'rolling';
type SourceType = CompletedSession['sourceType'];
type QuizStatus = 'idle' | 'loading' | 'error';

const MIN_WPM = 100;
const MAX_WPM = 800;
const WPM_STEP = 25;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function makeId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `session-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return minutes > 0 ? `${minutes}m ${remainder}s` : `${remainder}s`;
}

function sessionSpeed(session: CompletedSession): number {
  return session.measuredWpm ?? session.endWpm;
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
    <button className="wordmark" onClick={onClick} type="button" aria-label="speed-read home">
      <span className="wordmark-mark" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      <span>speed-read</span>
    </button>
  );
}

function Shell({
  view,
  onNavigate,
  children,
}: {
  view: View;
  onNavigate: (view: View) => void;
  children: ReactNode;
}) {
  return (
    <div className="app-shell">
      <aside className="utility-shell">
        <Wordmark onClick={() => onNavigate('home')} />
        <p className="tagline">Roll. Read.<br />See what stayed.</p>
        <nav className="primary-nav" aria-label="Primary">
          <button className={view === 'home' ? 'active' : ''} type="button" onClick={() => onNavigate('home')}>
            Wikipedia roulette
          </button>
          <button className={view === 'history' ? 'active' : ''} type="button" onClick={() => onNavigate('history')}>
            Stats &amp; history
          </button>
        </nav>
        <p className="local-storage-note">Progress stays in this browser.</p>
      </aside>
      <div className="mobile-app-bar">
        <Wordmark onClick={() => onNavigate('home')} />
        <button className="mobile-progress-link" type="button" onClick={() => onNavigate('history')}>Stats</button>
      </div>
      {children}
    </div>
  );
}

function Intake({
  onStart,
  onRoll,
  rouletteError,
}: {
  onStart: (article: ArticleContent, sourceType: SourceType) => Promise<void>;
  onRoll: () => void;
  rouletteError: string;
}) {
  const [source, setSource] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const prepare = async () => {
    setError('');
    const inferred = inferReadingSource(source);
    if (inferred.kind === 'invalid') {
      setError(inferred.message);
      return;
    }

    if (inferred.kind === 'text') {
      let article = pastedTextToArticle(inferred.text);
      if (countWords(article.paragraphs) < 20) {
        setError('Add a little more text—about one short paragraph is enough to begin.');
        return;
      }
      setLoading(true);
      try {
        if (article.title === 'Pasted text') {
          const generatedTitle = await generateTitle(article.paragraphs).catch(() => null);
          if (generatedTitle) article = { ...article, title: generatedTitle };
        }
        await onStart(article, 'text');
      } finally {
        setLoading(false);
      }
      return;
    }

    setLoading(true);
    try {
      const article = await extractArticle(inferred.url);
      if (countWords(article.paragraphs) < 20) throw new Error('The page did not contain enough useful reading text.');
      await onStart(article, 'url');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'That page could not be prepared. Paste its text instead.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="workspace intake-workspace">
      <section className="intake-copy" aria-labelledby="intake-title">
        <p className="section-label">Wikipedia roulette</p>
        <h1 id="intake-title">Improve your speed reading</h1>
        <p>Paste the link or text you want to read, gradually increase your reading speed when you become better.</p>
        <p>Each run has an automatic quiz about the content at the end.</p>
      </section>

      <section className="intake-form" aria-label="Prepare a reading">
        <div className="roulette-launch">
          <div className="roulette-intro">
            <div>
              <p className="section-label">Your next read</p>
              <h2>Let Wikipedia decide.</h2>
            </div>
            <p>A random article from English Wikipedia, cleared of everything you do not need to read.</p>
          </div>
          <button className="roulette-button" type="button" onClick={onRoll} disabled={loading}>
            <DiceIcon />
            <span>Roll Wikipedia</span>
            <Arrow direction="right" />
          </button>
          {rouletteError && <p className="form-error roulette-error" role="alert">{rouletteError}</p>}
        </div>

        <div className="own-source">
          <div className="source-divider"><span>Or choose your own</span></div>
          <label className="field-label">
            Link or text
            <textarea
              value={source}
              onChange={(event) => setSource(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) void prepare();
              }}
              placeholder="Paste a link or the text itself…"
              rows={5}
              aria-invalid={Boolean(error)}
            />
          </label>
          <div className="form-actions">
            <button className="quiet-button source-submit" type="button" onClick={() => void prepare()} disabled={loading}>
              {loading ? 'Preparing your reading…' : 'Prepare reading'}
            </button>
            <span>⌘ Enter</span>
          </div>
          {error && <p className="form-error" role="alert">{error}</p>}
          {loading && (
            <div className="extracting-lines" aria-hidden="true">
              <i /><i /><i />
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

function RollTransition({ title }: { title: string }) {
  return (
    <main className="workspace roll-workspace" aria-live="polite" aria-label="Choosing a Wikipedia article">
      <RollingDie />
      <div className="roll-copy">
        <p className="section-label">Wikipedia roulette</p>
        <h1>{title || 'Rolling English Wikipedia…'}</h1>
        <p>{title ? 'The article is chosen. Removing page clutter now.' : 'One article. No peeking.'}</p>
      </div>
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

function useWrappedLines(paragraphs: string[]) {
  const copyRef = useRef<HTMLDivElement>(null);
  const [lines, setLines] = useState<ReadingLine[]>(() => fallbackWrap(paragraphs));

  useLayoutEffect(() => {
    const element = copyRef.current;
    if (!element) return;
    let frame = 0;

    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const styles = getComputedStyle(element);
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        if (!context) return;
        context.font = `${styles.fontWeight} ${styles.fontSize} ${styles.fontFamily}`;
        const width = element.clientWidth;
        const next = wrapParagraphs(paragraphs, width, (value) => context.measureText(value).width);
        if (next.length > 0) setLines(next);
      });
    };

    const observer = new ResizeObserver(update);
    observer.observe(element);
    void document.fonts.ready.then(update);
    update();

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
      <kbd>{keyLabel}</kbd>
    </button>
  );
}

function Reader({
  article,
  articleId,
  sourceType,
  storedLocally,
  initialWord,
  initiallyRunning = false,
  onExit,
  onFinish,
  onPositionChange,
}: {
  article: ArticleContent;
  articleId: string;
  sourceType: SourceType;
  storedLocally: boolean;
  initialWord: number;
  initiallyRunning?: boolean;
  onExit: () => void;
  onFinish: (session: CompletedSession) => void | Promise<void>;
  onPositionChange: (word: number) => void;
}) {
  const { copyRef, lines } = useWrappedLines(article.paragraphs);
  const [activeWord, setActiveWord] = useState(() => Math.max(0, initialWord));
  const [wpm, setWpm] = useState(() => clamp(loadLocalPace(), MIN_WPM, MAX_WPM));
  const [startWpm, setStartWpm] = useState(wpm);
  const [startWord, setStartWord] = useState(activeWord);
  const [startedAt, setStartedAt] = useState<Date | null>(() => initiallyRunning ? new Date() : null);
  const [running, setRunning] = useState(initiallyRunning);
  const [curtainHeight, setCurtainHeight] = useState(0);
  const [futureCurtainTop, setFutureCurtainTop] = useState(0);
  const [timerRevision, setTimerRevision] = useState(0);
  const [documentPaused, setDocumentPaused] = useState(() => document.hidden);
  const activeElement = useRef<HTMLButtonElement>(null);
  const visibleEndElement = useRef<HTMLButtonElement>(null);
  const readerStage = useRef<HTMLDivElement>(null);
  const startButton = useRef<HTMLButtonElement>(null);
  const finished = useRef(false);
  const activeIndex = findActiveLine(lines, activeWord);
  const visibleEndIndex = Math.min(activeIndex + 2, Math.max(0, lines.length - 1));
  const activeLine = lines[activeIndex];
  const previousActiveIndex = useRef<number | null>(null);
  const pausedAt = useRef<number | null>(null);
  const pausedDuration = useRef(0);
  const totalWords = countWords(article.paragraphs);
  const passedWords = activeLine?.startWord ?? 0;
  const elapsedMilliseconds = startedAt
    ? Date.now() - startedAt.getTime() - pausedDuration.current - (pausedAt.current ? Date.now() - pausedAt.current : 0)
    : 0;
  const actualSeconds = Math.max(1, Math.round(elapsedMilliseconds / 1000));
  const actualWpm = Math.round((Math.max(0, passedWords - startWord) / actualSeconds) * 60);
  const lineDuration = activeLine ? clamp((activeLine.text.split(/\s+/).length / wpm) * 60, 0.9, 12) : 2;

  useEffect(() => {
    if (initiallyRunning) return;
    const frame = requestAnimationFrame(() => {
      startButton.current?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [initiallyRunning]);

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

  useEffect(() => {
    if (activeLine) onPositionChange(activeLine.startWord);
  }, [activeLine, onPositionChange]);

  useEffect(() => {
    saveLocalPace(wpm);
  }, [wpm]);

  const adjustPace = useCallback((delta: number) => {
    setWpm((value) => clamp(value + delta, MIN_WPM, MAX_WPM));
  }, []);

  const selectLine = useCallback((startWord: number) => {
    setActiveWord(startWord);
    setTimerRevision((value) => value + 1);
  }, []);

  const moveLine = useCallback((delta: number) => {
    const next = clamp(activeIndex + delta, 0, Math.max(0, lines.length - 1));
    if (lines[next]) selectLine(lines[next].startWord);
  }, [activeIndex, lines, selectLine]);

  const begin = useCallback(() => {
    const now = new Date();
    finished.current = false;
    pausedAt.current = document.hidden ? now.getTime() : null;
    pausedDuration.current = 0;
    setStartWpm(wpm);
    setStartWord(activeLine?.startWord ?? activeWord);
    setStartedAt(now);
    setRunning(true);
    setTimerRevision((value) => value + 1);
    requestAnimationFrame(() => activeElement.current?.focus({ preventScroll: true }));
  }, [activeLine, activeWord, wpm]);

  const finish = useCallback(() => {
    if (finished.current || !startedAt) return;
    finished.current = true;
    const completedAt = new Date();
    const pendingPause = pausedAt.current ? completedAt.getTime() - pausedAt.current : 0;
    const durationMilliseconds = completedAt.getTime() - startedAt.getTime() - pausedDuration.current - pendingPause;
    const durationSeconds = Math.max(1, Math.round(durationMilliseconds / 1000));
    const completedWords = Math.max(0, totalWords - startWord);
    onFinish({
      id: makeId(),
      title: article.title,
      sourceUrl: article.sourceUrl,
      sourceType,
      wordCount: completedWords,
      startedAt: startedAt.toISOString(),
      completedAt: completedAt.toISOString(),
      durationSeconds,
      startWpm,
      endWpm: wpm,
      ...(completedWords > 0 ? { measuredWpm: Math.max(1, Math.round((completedWords / durationSeconds) * 60)) } : {}),
      totalLines: lines.length,
      ...(storedLocally ? { articleId } : {}),
    });
  }, [article.sourceUrl, article.title, articleId, lines.length, onFinish, sourceType, startWord, startWpm, startedAt, storedLocally, totalWords, wpm]);

  useEffect(() => {
    const handleVisibility = () => {
      const now = Date.now();
      if (document.hidden) {
        if (running && pausedAt.current === null) pausedAt.current = now;
        setDocumentPaused(true);
      } else {
        if (pausedAt.current !== null) pausedDuration.current += now - pausedAt.current;
        pausedAt.current = null;
        setDocumentPaused(false);
        if (running) setTimerRevision((value) => value + 1);
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [running]);

  useEffect(() => {
    if (!activeLine || !running || documentPaused) return;
    const timer = window.setTimeout(() => {
      if (activeIndex === lines.length - 1) finish();
      else moveLine(1);
    }, lineDuration * 1_000);
    return () => window.clearTimeout(timer);
  }, [activeIndex, activeLine, documentPaused, finish, lineDuration, lines.length, moveLine, running, timerRevision]);

  useEffect(() => {
    const handleKeys = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches('input, textarea, [contenteditable="true"]')) return;
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
      event.preventDefault();
      if (event.key === 'ArrowLeft') adjustPace(-WPM_STEP);
      if (event.key === 'ArrowRight') adjustPace(WPM_STEP);
      if (event.key === 'ArrowUp' && running) moveLine(-1);
      if (event.key === 'ArrowDown') {
        if (!running) return;
        if (activeIndex === lines.length - 1) finish();
        else moveLine(1);
      }
    };
    window.addEventListener('keydown', handleKeys);
    return () => window.removeEventListener('keydown', handleKeys);
  }, [activeIndex, adjustPace, finish, lines.length, moveLine, running]);

  const atEnd = activeIndex === lines.length - 1;
  const nextLabel = atEnd ? (running ? 'Finish read' : 'Last line') : 'Next line';
  const nextAction = atEnd ? finish : () => moveLine(1);
  const paceDelta = wpm - startWpm;
  const timerStopped = !running || documentPaused;

  return (
    <div className={`reader-shell${timerStopped ? ' timer-paused' : ''}`}>
      <aside className="reader-utility">
        <Wordmark onClick={onExit} />
        <div className="reader-source">
          <p className="measurement-label">Source</p>
          <h1>
            {article.sourceUrl ? (
              <a href={article.sourceUrl} target="_blank" rel="noreferrer">{article.title}</a>
            ) : article.title}
          </h1>
          {(article.byline || article.siteName) && (
            <p>{[article.byline, article.siteName].filter(Boolean).join(' · ')}</p>
          )}
        </div>
        <div className="reader-measurements" aria-label="Reading measurements">
          <div>
            <span className="measurement-label">Pace</span>
            <strong>{wpm}</strong><small>wpm</small>
          </div>
          <div>
            <span className="measurement-label">Line</span>
            <strong>{activeIndex + 1}</strong><small>/ {lines.length}</small>
          </div>
        </div>
        <p className="live-evidence">
          {!running ? 'Ready · timer begins when you start' : paceDelta === 0 ? 'Starting pace' : `${paceDelta > 0 ? '+' : ''}${paceDelta} wpm from start`}
          {running && passedWords - startWord > 8 && actualSeconds >= 15 && actualWpm > 0 ? <span> · {actualWpm} actual</span> : null}
        </p>
        <div className="desktop-reader-controls">
          <ReaderControl label="Slower" keyLabel="←" direction="left" onClick={() => adjustPace(-WPM_STEP)} disabled={wpm === MIN_WPM} />
          <ReaderControl label="Faster" keyLabel="→" direction="right" onClick={() => adjustPace(WPM_STEP)} disabled={wpm === MAX_WPM} />
          <ReaderControl label="Previous line" keyLabel="↑" direction="up" onClick={() => moveLine(-1)} disabled={!running || activeIndex === 0} />
          <ReaderControl label={nextLabel} keyLabel="↓" direction="down" onClick={nextAction} disabled={!running} />
        </div>
        <div className="reader-utility-footer">
          <button className="quiet-button" type="button" onClick={onExit}>Leave reading</button>
          <span>{storedLocally ? 'Text and progress save locally' : 'Temporary read · storage unavailable'}</span>
        </div>
      </aside>

      <main className="reader-main" aria-label={`Reading ${article.title}`}>
        <div className="mobile-reader-status">
          <button type="button" onClick={onExit} aria-label="Leave reading">×</button>
          <span><b>{wpm}</b> wpm</span>
          <span><b>{activeIndex + 1}</b> / {lines.length}</span>
        </div>
        <div className="reader-stage" ref={readerStage}>
          <div className="reading-curtain" style={{ height: curtainHeight }} aria-hidden="true">
            <span>read</span>
          </div>
          <div className="reading-future-curtain" style={{ top: futureCurtainTop }} aria-hidden="true" />
          <div className="reader-copy" ref={copyRef}>
            {lines.map((line, index) => {
              const active = index === activeIndex;
              const visible = running && index >= activeIndex && index <= visibleEndIndex;
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
                  {active && <Countdown duration={lineDuration} identity={`${line.id}-${wpm}-${timerRevision}-${running}`} />}
                  {line.text}
                </button>
              );
            })}
            <div className="article-end">
              <span>End of text</span>
              {article.sourceUrl && (
                <a href={article.sourceUrl} target="_blank" rel="noreferrer">Open original source</a>
              )}
              {atEnd && running && (
                <button className="primary-button" type="button" onClick={finish}>Finish and save</button>
              )}
            </div>
          </div>
          {!running && (
            <section className="reader-start-gate" aria-labelledby="reader-start-title">
              <div>
                <p>Ready to read</p>
                <h2 id="reader-start-title">{article.title}</h2>
                <button ref={startButton} className="reader-start-orb" type="button" onClick={begin} aria-label="Start reading">
                  Start
                </button>
                <span>{wpm} wpm · {lines.length} lines</span>
              </div>
            </section>
          )}
        </div>
      </main>

      {running && (
        <div className="mobile-reader-controls" aria-label="Reading controls">
          <ReaderControl className="pace-control" label="Slower" keyLabel="" direction="left" onClick={() => adjustPace(-WPM_STEP)} disabled={wpm === MIN_WPM} />
          <ReaderControl className="pace-control" label="Faster" keyLabel="" direction="right" onClick={() => adjustPace(WPM_STEP)} disabled={wpm === MAX_WPM} />
          <ReaderControl label="Previous" keyLabel="" direction="up" onClick={() => moveLine(-1)} disabled={activeIndex === 0} />
          <ReaderControl label={atEnd ? 'Finish' : 'Next'} keyLabel="" direction="down" onClick={nextAction} />
        </div>
      )}
    </div>
  );
}

function Quiz({
  session,
  quiz,
  status,
  error,
  onRetry,
  onProgress,
  onRollNext,
  onComplete,
}: {
  session: CompletedSession;
  quiz?: ReadingQuiz;
  status: QuizStatus;
  error: string;
  onRetry: () => void;
  onProgress: () => void;
  onRollNext: () => void;
  onComplete: (answers: number[], score: number, total: number) => void;
}) {
  const [answers, setAnswers] = useState<Record<number, number>>(() => Object.fromEntries(
    (session.quizAnswers ?? []).map((answer, index) => [index, answer]),
  ));
  const [submitted, setSubmitted] = useState(() => session.quizScore !== undefined && session.quizAnswers !== undefined);
  const answeredCount = Object.keys(answers).length;
  const score = session.quizScore ?? (submitted && quiz ? scoreQuiz(quiz, answers) : null);

  if (status === 'loading') {
    return (
      <main className="workspace quiz-workspace quiz-pending" aria-live="polite">
        <p className="section-label">Read complete</p>
        <h1>Making your recall check…</h1>
        <p>GPT-5.6 Luna is turning the reading into four grounded questions.</p>
        <div className="quiz-loading-lines" aria-hidden="true"><i /><i /><i /><i /></div>
      </main>
    );
  }

  if (status === 'error' || !quiz) {
    return (
      <main className="workspace quiz-workspace quiz-pending">
        <p className="section-label">Read complete</p>
        <h1>Your reading is saved.</h1>
        <p className="quiz-error" role="alert">{error || 'The quiz could not be restored.'}</p>
        <div className="quiz-actions">
          {status === 'error' && <button className="primary-button" type="button" onClick={onRetry}>Try the quiz again</button>}
          <button className="quiet-button" type="button" onClick={onRollNext}>Roll another article</button>
          <button className="quiet-button" type="button" onClick={onProgress}>See stats</button>
        </div>
      </main>
    );
  }

  const submit = () => {
    if (answeredCount !== quiz.questions.length) return;
    const nextScore = scoreQuiz(quiz, answers);
    const orderedAnswers = quiz.questions.map((_, index) => answers[index]);
    setSubmitted(true);
    onComplete(orderedAnswers, nextScore, quiz.questions.length);
    window.scrollTo({ top: 0, behavior: 'auto' });
  };

  return (
    <main className="workspace quiz-workspace">
      <header className="quiz-header">
        <div>
          <p className="section-label">Recall check · {session.title}</p>
          <h1>{submitted ? 'Here’s what stayed.' : 'What stayed with you?'}</h1>
          <p>{submitted ? 'Review the grounded answer for each question.' : 'Four questions from the text, created only after you finished reading.'}</p>
        </div>
        <div className="quiz-result-column">
          <div className="quiz-measure" aria-live="polite">
            <span>{submitted ? 'Score' : 'Answered'}</span>
            <strong>{submitted ? score : answeredCount}</strong>
            <small>/ {quiz.questions.length}</small>
          </div>
          {submitted && (
            <button className="primary-button quiz-next-button" type="button" onClick={onRollNext}>
              Roll next article
            </button>
          )}
        </div>
      </header>

      <form className="quiz-form" onSubmit={(event) => { event.preventDefault(); submit(); }}>
        {quiz.questions.map((question, questionIndex) => (
          <fieldset className="quiz-question" key={question.prompt} disabled={submitted}>
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
        ))}

        <footer className="quiz-footer">
          <p>Generated by GPT-5.6 Luna from this reading. Your score stays in this browser.</p>
          <div className="quiz-actions">
            {!submitted && (
              <button className="primary-button" type="submit" disabled={answeredCount !== quiz.questions.length}>
                Check my answers
              </button>
            )}
            {submitted && <button className="primary-button" type="button" onClick={onRollNext}>Roll another article</button>}
            <button className="quiet-button" type="button" onClick={onProgress}>See stats</button>
          </div>
        </footer>
      </form>
    </main>
  );
}

function History({
  sessions,
  onNewRead,
  onRoll,
  onRerun,
  onQuiz,
  rerunError,
}: {
  sessions: CompletedSession[];
  onNewRead: () => void;
  onRoll: () => void;
  onRerun: (session: CompletedSession) => void;
  onQuiz: (session: CompletedSession) => void;
  rerunError: string;
}) {
  const ordered = [...sessions].sort((a, b) => b.completedAt.localeCompare(a.completedAt));
  const latest = ordered[0];
  const first = ordered.at(-1);
  const paceChange = latest && first ? sessionSpeed(latest) - sessionSpeed(first) : 0;
  const totalWords = ordered.reduce((sum, session) => sum + session.wordCount, 0);
  const scored = ordered.filter((session) => session.quizScore !== undefined && Boolean(session.quizTotal));
  const correctAnswers = scored.reduce((sum, session) => sum + (session.quizScore ?? 0), 0);
  const totalAnswers = scored.reduce((sum, session) => sum + (session.quizTotal ?? 0), 0);
  const overallAccuracy = totalAnswers ? Math.round((correctAnswers / totalAnswers) * 100) : null;
  const accuracyBands = accuracyBySpeed(ordered);

  return (
    <main className="workspace history-workspace">
      <header className="history-header">
        <div>
          <p className="section-label">Stats &amp; history</p>
          <h1>Your Wikipedia trail.</h1>
          <p>Every completed reading and quiz score, saved in this browser.</p>
        </div>
        <div className="history-header-actions">
          <button className="primary-button" type="button" onClick={onRoll}>Roll a new article</button>
          <button className="quiet-button" type="button" onClick={onNewRead}>Use your own text</button>
        </div>
      </header>
      {rerunError && <p className="form-error history-error" role="alert">{rerunError}</p>}

      {ordered.length === 0 ? (
        <section className="history-empty">
          <span className="empty-boundary" aria-hidden="true" />
          <h2>Your first article is one roll away.</h2>
          <p>Finish it and its pace, quiz score, and title will appear here.</p>
          <button className="primary-button" type="button" onClick={onRoll}>Roll Wikipedia</button>
        </section>
      ) : (
        <>
          <section className="summary-strip" aria-label="Progress summary">
            <div><span>Articles read</span><strong>{ordered.length}</strong></div>
            <div><span>Quiz accuracy</span><strong>{overallAccuracy ?? '—'}</strong>{overallAccuracy !== null && <small>%</small>}</div>
            <div><span>Latest speed</span><strong>{sessionSpeed(latest)}</strong><small>wpm</small></div>
          </section>
          <section className="accuracy-history" aria-labelledby="accuracy-history-title">
            <header>
              <h2 id="accuracy-history-title">Recall by speed</h2>
              <p>
                {totalWords.toLocaleString()} words read
                {ordered.length > 1 ? ` · ${paceChange > 0 ? '+' : ''}${paceChange} wpm since your first finish` : ''}
                {' · '}quiz scores grouped by measured reading speed
              </p>
            </header>
            {accuracyBands.length ? (
              <div className="accuracy-table">
                {accuracyBands.map((band) => (
                  <div className="accuracy-row" key={band.minWpm}>
                    <span>{band.label} wpm</span>
                    <div aria-hidden="true"><i style={{ '--accuracy-width': `${band.accuracy}%` } as CSSProperties} /></div>
                    <strong>{band.accuracy}%</strong>
                    <small>{band.correct}/{band.total} correct · {band.reads} {band.reads === 1 ? 'quiz' : 'quizzes'}</small>
                  </div>
                ))}
              </div>
            ) : (
              <p className="accuracy-empty">Complete a quiz to see how recall changes at different speeds.</p>
            )}
          </section>
          <section className="session-history" aria-labelledby="session-history-title">
            <h2 id="session-history-title">Article log</h2>
            <div className="session-list">
              {ordered.map((session, index) => {
                const speed = sessionSpeed(session);
                const maxPace = Math.max(...ordered.map(sessionSpeed), 1);
                return (
                  <article className="session-row" key={session.id}>
                    <div className="session-index">{String(ordered.length - index).padStart(2, '0')}</div>
                    <div className="session-title">
                      <h3>
                        {session.sourceUrl ? (
                          <a href={session.sourceUrl} target="_blank" rel="noreferrer">{session.title}</a>
                        ) : session.title}
                      </h3>
                      <p>
                        {new Date(session.completedAt).toLocaleDateString(undefined, { dateStyle: 'medium' })}
                        {session.sourceType === 'wikipedia' ? ' · Wikipedia' : ''}
                      </p>
                    </div>
                    <div className="session-pace">
                      <span style={{ '--pace-width': `${(speed / maxPace) * 100}%` } as CSSProperties} />
                      <strong>{speed}</strong><small>wpm</small>
                    </div>
                    <div className="session-detail">
                      <span>
                        {session.wordCount.toLocaleString()} words · {formatDuration(session.durationSeconds)}
                        {session.quizScore !== undefined && session.quizTotal ? ` · Quiz ${session.quizScore}/${session.quizTotal}` : ''}
                      </span>
                      {session.quiz && (
                        <button className="quiet-button" type="button" onClick={() => onQuiz(session)}>Review quiz</button>
                      )}
                      {session.articleId && (
                        <button className="quiet-button" type="button" onClick={() => onRerun(session)}>Read again</button>
                      )}
                    </div>
                  </article>
                );
              })}
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
  const [view, setView] = useState<View>(demo ? 'reader' : initialRoute.view === 'reader' ? 'loading' : initialRoute.view);
  const [article, setArticle] = useState<ArticleContent | null>(demo ? SAMPLE_ARTICLE : null);
  const [articleId, setArticleId] = useState<string | null>(demo ? 'demo-reader' : null);
  const [initialWord, setInitialWord] = useState(initialRoute.view === 'reader' ? initialRoute.word : 0);
  const [storedLocally, setStoredLocally] = useState(false);
  const [readerInstance, setReaderInstance] = useState(0);
  const [sourceType, setSourceType] = useState<SourceType>('sample');
  const [sessions, setSessions] = useState<CompletedSession[]>(() => loadLocalSessions());
  const [rerunError, setRerunError] = useState('');
  const [quizSessionId, setQuizSessionId] = useState<string | null>(initialRoute.view === 'quiz' ? initialRoute.sessionId : null);
  const [quizStatus, setQuizStatus] = useState<QuizStatus>('idle');
  const [quizError, setQuizError] = useState('');
  const [quizAvailability, setQuizAvailability] = useState<boolean | null>(null);
  const [rouletteError, setRouletteError] = useState('');
  const [rollingTitle, setRollingTitle] = useState('');
  const rollInFlight = useRef(false);
  const rollGeneration = useRef(0);
  const rollAbort = useRef<AbortController | null>(null);

  const setRoute = useCallback((hash: string, mode: 'push' | 'replace' = 'push') => {
    const url = `${window.location.pathname}${window.location.search}${hash}`;
    window.history[mode === 'push' ? 'pushState' : 'replaceState'](null, '', url);
  }, []);

  const loadReader = useCallback((
    nextArticle: ArticleContent,
    nextArticleId: string,
    nextSourceType: SourceType,
    word: number,
    saved: boolean,
  ) => {
    setArticle(nextArticle);
    setArticleId(nextArticleId);
    setSourceType(nextSourceType);
    setInitialWord(word);
    setStoredLocally(saved);
    setReaderInstance((value) => value + 1);
    setRerunError('');
    setQuizSessionId(null);
    setQuizStatus('idle');
    setQuizError('');
    setView('reader');
  }, []);

  useEffect(() => {
    let current = true;
    void isQuizAvailable().then((available) => {
      if (current) setQuizAvailability(available);
    });
    return () => { current = false; };
  }, []);

  useEffect(() => {
    if (demo) return;
    let generation = 0;
    const restoreRoute = async () => {
      const currentGeneration = ++generation;
      const route = parseHashRoute(window.location.hash);
      if (route.view === 'home') {
        setView('home');
        setArticle(null);
        setArticleId(null);
        setQuizSessionId(null);
        if (window.location.hash) setRoute('', 'replace');
        return;
      }
      if (route.view === 'history') {
        setView('history');
        setArticle(null);
        setArticleId(null);
        setQuizSessionId(null);
        return;
      }
      if (route.view === 'quiz') {
        const storedSessions = loadLocalSessions();
        const storedSession = storedSessions.find((session) => session.id === route.sessionId);
        if (!storedSession?.quiz) {
          setRoute('#progress', 'replace');
          setArticle(null);
          setArticleId(null);
          setQuizSessionId(null);
          setView('history');
          return;
        }
        setSessions(storedSessions);
        setArticle(null);
        setArticleId(null);
        setQuizSessionId(storedSession.id);
        setQuizStatus('idle');
        setQuizError('');
        setView('quiz');
        return;
      }
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
      loadReader(stored.article, stored.id, stored.sourceType, route.word, true);
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
  }, [demo, loadReader, setRoute]);

  const start = async (
    nextArticle: ArticleContent,
    nextSourceType: SourceType,
    stillCurrent?: () => boolean,
  ) => {
    setRouletteError('');
    const stored = await storeArticle(nextArticle, nextSourceType);
    if (stillCurrent && !stillCurrent()) return;
    loadReader(nextArticle, stored.id, nextSourceType, 0, stored.saved);
    setRoute(readerHash(stored.id, 0));
    window.scrollTo({ top: 0, behavior: 'auto' });
  };

  const rollWikipedia = async () => {
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
    setRouletteError('');
    setRollingTitle('');
    setArticle(null);
    setArticleId(null);
    setQuizSessionId(null);
    setView('rolling');
    setRoute('');
    window.scrollTo({ top: 0, behavior: 'auto' });

    try {
      const [selectionResult] = await Promise.allSettled([
        randomWikipediaArticle(fetch, controller.signal),
        new Promise((resolve) => window.setTimeout(resolve, 1_100)),
      ]);
      if (selectionResult.status === 'rejected') throw selectionResult.reason;
      if (generation !== rollGeneration.current) return;
      const selection = selectionResult.value;
      setRollingTitle(selection.title);
      const extracted = await extractArticle(selection.url, controller.signal);
      const nextArticle = {
        ...extracted,
        title: selection.title,
        siteName: 'Wikipedia',
        sourceUrl: selection.url,
      };
      if (countWords(nextArticle.paragraphs) < 20) {
        throw new Error('That article was too short for a useful run. Roll again.');
      }
      if (generation !== rollGeneration.current) return;
      window.clearTimeout(timeout);
      await start(nextArticle, 'wikipedia', () => generation === rollGeneration.current);
    } catch (error) {
      if (generation !== rollGeneration.current) return;
      setRouletteError(timedOut
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
    if (nextView === 'reader' || nextView === 'loading') return;
    rollAbort.current?.abort();
    rollAbort.current = null;
    rollGeneration.current += 1;
    rollInFlight.current = false;
    setRollingTitle('');
    setView(nextView);
    setArticle(null);
    setArticleId(null);
    setRerunError('');
    setQuizSessionId(null);
    setQuizStatus('idle');
    setQuizError('');
    setRoute(nextView === 'history' ? '#progress' : '');
    window.scrollTo({ top: 0, behavior: 'auto' });
  };

  const updatePosition = useCallback((word: number) => {
    if (!articleId || demo) return;
    setRoute(readerHash(articleId, word), 'replace');
  }, [articleId, demo, setRoute]);

  const rerun = async (session: CompletedSession) => {
    if (!session.articleId) return;
    const stored = await getStoredArticle(session.articleId);
    if (!stored) {
      setRerunError('That text has been pruned from local storage. Import or paste it again to reread it.');
      return;
    }
    loadReader(stored.article, stored.id, stored.sourceType, 0, true);
    setRoute(readerHash(stored.id, 0));
    window.scrollTo({ top: 0, behavior: 'auto' });
  };

  const exitReader = () => {
    navigate('home');
  };

  const saveSession = (session: CompletedSession) => {
    saveLocalSession(session);
    setSessions((current) => [session, ...current.filter((item) => item.id !== session.id)]);
  };

  const createSessionQuiz = async (session: CompletedSession, source: ArticleContent) => {
    setQuizSessionId(session.id);
    setQuizStatus('loading');
    setQuizError('');
    setView('quiz');
    setRoute(quizHash(session.id));
    window.scrollTo({ top: 0, behavior: 'auto' });
    try {
      const quiz = await generateQuiz(source);
      const updated = { ...session, quiz };
      saveSession(updated);
      setQuizStatus('idle');
    } catch (error) {
      setQuizStatus('error');
      setQuizError(error instanceof Error ? error.message : 'The quiz could not be created right now. Try again.');
    }
  };

  const finish = async (session: CompletedSession) => {
    saveSession(session);
    const available = quizAvailability ?? await isQuizAvailable();
    setQuizAvailability(available);
    if (!available || !article) {
      navigate('history');
      return;
    }
    await createSessionQuiz(session, article);
  };

  const retryQuiz = async () => {
    const session = sessions.find((candidate) => candidate.id === quizSessionId);
    if (!session) {
      navigate('history');
      return;
    }
    let source = article;
    if (!source && session.articleId) source = (await getStoredArticle(session.articleId))?.article ?? null;
    if (!source) {
      setQuizStatus('error');
      setQuizError('That reading is no longer stored in this browser, so the quiz cannot be retried.');
      return;
    }
    await createSessionQuiz(session, source);
  };

  const openQuiz = (session: CompletedSession) => {
    if (!session.quiz) return;
    setQuizSessionId(session.id);
    setQuizStatus('idle');
    setQuizError('');
    setArticle(null);
    setArticleId(null);
    setView('quiz');
    setRoute(quizHash(session.id));
    window.scrollTo({ top: 0, behavior: 'auto' });
  };

  const completeQuiz = (answers: number[], score: number, total: number) => {
    const session = sessions.find((candidate) => candidate.id === quizSessionId);
    if (!session) return;
    saveSession({ ...session, quizAnswers: answers, quizScore: score, quizTotal: total });
  };

  if (view === 'reader' && article && articleId) {
    return (
      <Reader
        key={`${articleId}-${readerInstance}`}
        article={article}
        articleId={articleId}
        sourceType={sourceType}
        storedLocally={storedLocally}
        initialWord={initialWord}
        initiallyRunning={demo}
        onExit={exitReader}
        onFinish={finish}
        onPositionChange={updatePosition}
      />
    );
  }

  const quizSession = quizSessionId ? sessions.find((session) => session.id === quizSessionId) : undefined;

  return (
    <Shell view={view} onNavigate={navigate}>
      {view === 'history' ? (
        <History
          sessions={sessions}
          onNewRead={() => navigate('home')}
          onRoll={() => void rollWikipedia()}
          onRerun={(session) => void rerun(session)}
          onQuiz={openQuiz}
          rerunError={rerunError}
        />
      ) : view === 'quiz' && quizSession ? (
        <Quiz
          key={quizSession.id}
          session={quizSession}
          quiz={quizSession.quiz}
          status={quizStatus}
          error={quizError}
          onRetry={() => void retryQuiz()}
          onProgress={() => navigate('history')}
          onRollNext={() => void rollWikipedia()}
          onComplete={completeQuiz}
        />
      ) : view === 'rolling' ? (
        <RollTransition title={rollingTitle} />
      ) : view === 'loading' ? (
        <main className="workspace restore-workspace" aria-live="polite">
          <p className="section-label">Saved locally</p>
          <h1>Restoring your text…</h1>
        </main>
      ) : (
        <Intake onStart={start} onRoll={() => void rollWikipedia()} rouletteError={rouletteError} />
      )}
    </Shell>
  );
}
