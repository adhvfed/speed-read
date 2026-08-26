/**
 * THESIS: A stable page is crossed by one moving reading boundary; the design refuses continuous auto-scroll and dashboard chrome.
 * OWN-WORLD: Cool white and mineral-blue planes, one cobalt live edge, square regions, compact 6px controls, and one circular countdown.
 * STORY: Import useful text, place the boundary, read at a chosen pace, then compare the completed session with your own history.
 * FIRST VIEWPORT: A quiet utility column holds source and measurement; an opaque curtain ends at the selected line in the dominant reading field.
 * FORM: Split Utility, chosen from the fifth grounded direction and the second approved composition; seed dd95217d, study E.
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
import { extractArticle, generateQuiz, isQuizAvailable } from './lib/api';
import { scoreQuiz } from './lib/quiz';
import { parseHashRoute, quizHash, readerHash } from './lib/routes';
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

type View = 'home' | 'reader' | 'history' | 'quiz' | 'loading';
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
        <p className="tagline">The text stays put.<br />You set the pace.</p>
        <nav className="primary-nav" aria-label="Primary">
          <button className={view === 'home' ? 'active' : ''} type="button" onClick={() => onNavigate('home')}>
            New read
          </button>
          <button className={view === 'history' ? 'active' : ''} type="button" onClick={() => onNavigate('history')}>
            Progress
          </button>
        </nav>
        <p className="local-storage-note">Progress stays in this browser.</p>
      </aside>
      <div className="mobile-app-bar">
        <Wordmark onClick={() => onNavigate('home')} />
        <button className="mobile-progress-link" type="button" onClick={() => onNavigate('history')}>Progress</button>
      </div>
      {children}
    </div>
  );
}

function Intake({ onStart }: { onStart: (article: ArticleContent, sourceType: SourceType) => Promise<void> }) {
  const [mode, setMode] = useState<'link' | 'text'>('link');
  const [url, setUrl] = useState('');
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const prepare = async () => {
    setError('');
    if (mode === 'text') {
      const article = pastedTextToArticle(text);
      if (countWords(article.paragraphs) < 20) {
        setError('Add a little more text—about one short paragraph is enough to begin.');
        return;
      }
      setLoading(true);
      try {
        await onStart(article, 'text');
      } finally {
        setLoading(false);
      }
      return;
    }

    let parsed: URL;
    try {
      parsed = new URL(url);
      if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('protocol');
    } catch {
      setError('Enter a complete public link, including https://.');
      return;
    }

    setLoading(true);
    try {
      const article = await extractArticle(parsed.toString());
      if (countWords(article.paragraphs) < 20) throw new Error('The page did not contain enough useful reading text.');
      await onStart(article, 'url');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'That page could not be prepared. Try pasting its text instead.');
    } finally {
      setLoading(false);
    }
  };

  const startSample = async () => {
    setError('');
    setLoading(true);
    try {
      await onStart(SAMPLE_ARTICLE, 'sample');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="workspace intake-workspace">
      <section className="intake-copy" aria-labelledby="intake-title">
        <p className="section-label">New reading</p>
        <h1 id="intake-title">Bring the text.<br />Keep your place.</h1>
        <p>
          Read one line at a time without chasing a moving page. You choose when to start; the boundary advances,
          and the viewport moves only when that boundary reaches its edge.
        </p>
        <div className="control-key-map" aria-label="Keyboard controls">
          <span><kbd>←</kbd><kbd>→</kbd> pace</span>
          <span><kbd>↑</kbd><kbd>↓</kbd> line</span>
        </div>
      </section>

      <section className="intake-form" aria-label="Prepare a reading">
        <div className="mode-tabs" role="tablist" aria-label="Source type">
          <button role="tab" aria-selected={mode === 'link'} type="button" onClick={() => { setMode('link'); setError(''); }}>
            From a link
          </button>
          <button role="tab" aria-selected={mode === 'text'} type="button" onClick={() => { setMode('text'); setError(''); }}>
            Paste text
          </button>
        </div>

        {mode === 'link' ? (
          <label className="field-label">
            Public article link
            <input
              type="url"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              onKeyDown={(event) => { if (event.key === 'Enter') void prepare(); }}
              placeholder="https://example.com/article"
              autoComplete="url"
              aria-invalid={Boolean(error)}
            />
          </label>
        ) : (
          <label className="field-label">
            Text to read
            <textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="Paste an article, essay, or notes…"
              rows={10}
              aria-invalid={Boolean(error)}
            />
          </label>
        )}

        <div className="form-actions">
          <button className="primary-button" type="button" onClick={() => void prepare()} disabled={loading}>
            {loading ? (mode === 'link' ? 'Removing page clutter…' : 'Saving locally…') : 'Prepare text'}
          </button>
          <button className="quiet-button" type="button" onClick={() => void startSample()} disabled={loading}>
            Try the sample
          </button>
        </div>
        {error && <p className="form-error" role="alert">{error}</p>}
        {loading && (
          <div className="extracting-lines" aria-hidden="true">
            <i /><i /><i />
          </div>
        )}
        <p className="privacy-note">Links are fetched only to extract readable text. Prepared text and progress are stored locally in this browser and pruned automatically.</p>
      </section>
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
  const [timerRevision, setTimerRevision] = useState(0);
  const [documentPaused, setDocumentPaused] = useState(() => document.hidden);
  const activeElement = useRef<HTMLButtonElement>(null);
  const readerStage = useRef<HTMLDivElement>(null);
  const finished = useRef(false);
  const activeIndex = findActiveLine(lines, activeWord);
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

  useLayoutEffect(() => {
    let frame = 0;
    if (activeElement.current && readerStage.current) {
      const readingLineHadFocus = document.activeElement?.classList.contains('reading-line');
      const activeTop = activeElement.current.getBoundingClientRect().top;
      const stageTop = readerStage.current.getBoundingClientRect().top;
      setCurtainHeight(Math.max(0, activeTop - stageTop));
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
          ? document.querySelector<HTMLElement>('.mobile-reader-controls, .mobile-reader-start')
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
  }, [activeIndex, lines]);

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
  }, [activeLine, activeWord, wpm]);

  const finish = useCallback(() => {
    if (finished.current || !startedAt) return;
    finished.current = true;
    const completedAt = new Date();
    const pendingPause = pausedAt.current ? completedAt.getTime() - pausedAt.current : 0;
    const durationMilliseconds = completedAt.getTime() - startedAt.getTime() - pausedDuration.current - pendingPause;
    onFinish({
      id: makeId(),
      title: article.title,
      sourceUrl: article.sourceUrl,
      sourceType,
      wordCount: Math.max(0, totalWords - startWord),
      startedAt: startedAt.toISOString(),
      completedAt: completedAt.toISOString(),
      durationSeconds: Math.max(1, Math.round(durationMilliseconds / 1000)),
      startWpm,
      endWpm: wpm,
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
      if (event.key === 'ArrowUp') moveLine(-1);
      if (event.key === 'ArrowDown') {
        if (activeIndex === lines.length - 1 && running) finish();
        else moveLine(1);
      }
    };
    window.addEventListener('keydown', handleKeys);
    return () => window.removeEventListener('keydown', handleKeys);
  }, [activeIndex, adjustPace, finish, lines.length, moveLine]);

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
          <h1>{article.title}</h1>
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
        {!running && (
          <button className="primary-button reader-start-button" type="button" onClick={begin}>Start reading</button>
        )}
        <div className="desktop-reader-controls">
          <ReaderControl label="Slower" keyLabel="←" direction="left" onClick={() => adjustPace(-WPM_STEP)} disabled={wpm === MIN_WPM} />
          <ReaderControl label="Faster" keyLabel="→" direction="right" onClick={() => adjustPace(WPM_STEP)} disabled={wpm === MAX_WPM} />
          <ReaderControl label="Previous line" keyLabel="↑" direction="up" onClick={() => moveLine(-1)} disabled={activeIndex === 0} />
          <ReaderControl label={nextLabel} keyLabel="↓" direction="down" onClick={nextAction} disabled={atEnd && !running} />
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
          <div className="reader-copy" ref={copyRef}>
            {lines.map((line, index) => {
              const active = index === activeIndex;
              return (
                <button
                  key={line.id}
                  ref={active ? activeElement : undefined}
                  type="button"
                  className={`reading-line${active ? ' active' : ''}${line.paragraphStart ? ' paragraph-start' : ''}`}
                  onClick={() => selectLine(line.startWord)}
                  tabIndex={active ? 0 : -1}
                  aria-current={active ? 'true' : undefined}
                  aria-label={`${active ? 'Current line: ' : 'Move to line: '}${line.text}`}
                >
                  {active && <Countdown duration={lineDuration} identity={`${line.id}-${wpm}-${timerRevision}-${running}`} />}
                  {line.text}
                </button>
              );
            })}
            <div className="article-end" aria-hidden={activeIndex !== lines.length - 1}>
              <span>End of text</span>
              {atEnd && running && (
                <button className="primary-button" type="button" onClick={finish}>Finish and save</button>
              )}
            </div>
          </div>
        </div>
      </main>

      {!running ? (
        <div className="mobile-reader-start">
          <span>Line {activeIndex + 1} · {wpm} wpm</span>
          <button className="primary-button" type="button" onClick={begin}>Start reading</button>
        </div>
      ) : (
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
  onComplete,
}: {
  session: CompletedSession;
  quiz?: ReadingQuiz;
  status: QuizStatus;
  error: string;
  onRetry: () => void;
  onProgress: () => void;
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
          <button className="quiet-button" type="button" onClick={onProgress}>See progress</button>
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
        <div className="quiz-measure" aria-live="polite">
          <span>{submitted ? 'Result' : 'Answered'}</span>
          <strong>{submitted ? score : answeredCount}</strong>
          <small>/ {quiz.questions.length}</small>
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
          <p>Generated by GPT-5.6 Luna from this reading. The source is not retained by speed-read.</p>
          <div className="quiz-actions">
            {!submitted && (
              <button className="primary-button" type="submit" disabled={answeredCount !== quiz.questions.length}>
                Check my answers
              </button>
            )}
            <button className="quiet-button" type="button" onClick={onProgress}>See progress</button>
          </div>
        </footer>
      </form>
    </main>
  );
}

function History({
  sessions,
  onNewRead,
  onRerun,
  onQuiz,
  rerunError,
}: {
  sessions: CompletedSession[];
  onNewRead: () => void;
  onRerun: (session: CompletedSession) => void;
  onQuiz: (session: CompletedSession) => void;
  rerunError: string;
}) {
  const ordered = [...sessions].sort((a, b) => b.completedAt.localeCompare(a.completedAt));
  const latest = ordered[0];
  const first = ordered.at(-1);
  const paceChange = latest && first ? latest.endWpm - first.endWpm : 0;
  const totalWords = ordered.reduce((sum, session) => sum + session.wordCount, 0);

  return (
    <main className="workspace history-workspace">
      <header className="history-header">
        <div>
          <p className="section-label">Your progress</p>
          <h1>Reading, measured honestly.</h1>
          <p>Completed reads saved in this browser.</p>
        </div>
        <button className="primary-button" type="button" onClick={onNewRead}>Start a new read</button>
      </header>
      {rerunError && <p className="form-error history-error" role="alert">{rerunError}</p>}

      {ordered.length === 0 ? (
        <section className="history-empty">
          <span className="empty-boundary" aria-hidden="true" />
          <h2>No completed reads yet.</h2>
          <p>Finish one text and its pace, duration, and word count will appear here.</p>
          <button className="quiet-button" type="button" onClick={onNewRead}>Start a new read</button>
        </section>
      ) : (
        <>
          <section className="summary-strip" aria-label="Progress summary">
            <div><span>Latest pace</span><strong>{latest.endWpm}</strong><small>wpm</small></div>
            <div><span>Change</span><strong>{paceChange > 0 ? '+' : ''}{paceChange}</strong><small>wpm</small></div>
            <div><span>Words read</span><strong>{totalWords.toLocaleString()}</strong></div>
          </section>
          <section className="session-history" aria-labelledby="session-history-title">
            <h2 id="session-history-title">Completed reads</h2>
            <div className="session-list">
              {ordered.map((session, index) => {
                const maxPace = Math.max(...ordered.map((item) => item.endWpm), 1);
                return (
                  <article className="session-row" key={session.id}>
                    <div className="session-index">{String(ordered.length - index).padStart(2, '0')}</div>
                    <div className="session-title">
                      <h3>{session.title}</h3>
                      <p>{new Date(session.completedAt).toLocaleDateString(undefined, { dateStyle: 'medium' })}</p>
                    </div>
                    <div className="session-pace">
                      <span style={{ '--pace-width': `${(session.endWpm / maxPace) * 100}%` } as CSSProperties} />
                      <strong>{session.endWpm}</strong><small>wpm</small>
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

  const start = async (nextArticle: ArticleContent, nextSourceType: SourceType) => {
    const stored = await storeArticle(nextArticle, nextSourceType);
    loadReader(nextArticle, stored.id, nextSourceType, 0, stored.saved);
    setRoute(readerHash(stored.id, 0));
    window.scrollTo({ top: 0, behavior: 'auto' });
  };

  const navigate = (nextView: View) => {
    if (nextView === 'reader' || nextView === 'loading') return;
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
          onComplete={completeQuiz}
        />
      ) : view === 'loading' ? (
        <main className="workspace restore-workspace" aria-live="polite">
          <p className="section-label">Saved locally</p>
          <h1>Restoring your text…</h1>
        </main>
      ) : (
        <Intake onStart={start} />
      )}
    </Shell>
  );
}
