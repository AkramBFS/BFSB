import React, { useState, useRef, useEffect, useCallback } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from './ui/Accordion';
import {
  StudyBookIcon,
  SummarizeIcon,
  QuizHelpIcon,
  CloseIcon,
  RetryIcon,
  CopyIcon,
  InsertNoteIcon,
} from './Icons';
import {
  generateNoteSummary,
  generateNoteQuiz,
  AI_MODEL_OPTIONS,
} from '../lib/aiService';
import { NOTE_FONT_FAMILIES } from '../lib/noteDocument';
import { useToast } from './ToastContext';

/**
 * Reusable Markdown + KaTeX renderer matching the app's note/chat typography.
 */
function StudyMarkdown({ children, fontFamily, compact = false }) {
  return (
    <div
      dir="auto"
      className={compact ? 'chat-markdown-body' : 'study-hub-markdown space-y-2.5'}
      style={{
        fontFamily: fontFamily || 'var(--note-font)',
        color: 'var(--tx)',
      }}
    >
      <ReactMarkdown
        remarkPlugins={[remarkMath]}
        rehypePlugins={[
          [rehypeKatex, { throwOnError: false, errorColor: '#e4968a', strict: 'ignore' }],
        ]}
        components={{
          h1: ({ children: c }) => (
            <h3 className="text-[17px] font-medium text-[var(--tx)] mt-3 mb-1.5">{c}</h3>
          ),
          h2: ({ children: c }) => (
            <h3 className="text-[16px] font-medium text-[var(--tx)] mt-3 mb-1.5">{c}</h3>
          ),
          h3: ({ children: c }) => (
            <h4 className="text-[14.5px] font-semibold text-[var(--tx)] mt-3 mb-1">{c}</h4>
          ),
          p: ({ children: c }) => (
            <p className="text-[14px] leading-[1.6] my-1.5 text-[var(--tx)]">{c}</p>
          ),
          ul: ({ children: c }) => (
            <ul className="list-disc pl-5 my-2 space-y-1.5 text-[14px] leading-[1.6]">{c}</ul>
          ),
          ol: ({ children: c }) => (
            <ol className="list-decimal pl-5 my-2 space-y-1.5 text-[14px] leading-[1.6]">
              {c}
            </ol>
          ),
          li: ({ children: c }) => <li dir="auto">{c}</li>,
        }}
      >
        {String(children || '')}
      </ReactMarkdown>
    </div>
  );
}

/**
 * Pulsing skeleton placeholders tailored to the incoming shape
 * (3 executive bullets + formula block for Summary; 3 accordion question rows for Quiz).
 */
function StudyHubSkeleton({ mode = 'summary' }) {
  if (mode === 'quiz') {
    return (
      <div
        role="status"
        aria-live="polite"
        aria-label="Generating active-recall quiz"
        className="space-y-3 py-2"
      >
        <div className="flex items-center gap-2 text-[12px] text-[var(--mu)] mb-1">
          <span
            className="w-2 h-2 rounded-full animate-pulse"
            style={{ backgroundColor: 'var(--accent)' }}
          />
          <span>Generating 3 active-recall questions from your notes...</span>
        </div>
        {[1, 2, 3].map((idx) => (
          <div
            key={idx}
            className="p-3.5 rounded-[6px] border animate-pulse space-y-2"
            style={{
              backgroundColor: 'var(--bg)',
              borderColor: 'var(--bd2)',
            }}
          >
            <div className="flex items-center justify-between gap-3">
              <div
                className="h-3.5 rounded-[4px] w-3/4"
                style={{ backgroundColor: 'var(--rz)' }}
              />
              <div
                className="h-3.5 w-4 rounded-[3px] shrink-0"
                style={{ backgroundColor: 'var(--rz)' }}
              />
            </div>
            <div
              className="h-3 rounded-[4px] w-1/2"
              style={{ backgroundColor: 'var(--rz)' }}
            />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Summarizing notes and extracting formulas"
      className="space-y-4 py-2"
    >
      <div className="flex items-center gap-2 text-[12px] text-[var(--mu)]">
        <span
          className="w-2 h-2 rounded-full animate-pulse"
          style={{ backgroundColor: 'var(--accent)' }}
        />
        <span>Distilling executive summary and key formulas...</span>
      </div>

      {/* 3 bullet point skeletons */}
      <div className="space-y-3 animate-pulse">
        {[1, 2, 3].map((idx) => (
          <div key={idx} className="flex items-start gap-2.5">
            <span
              className="w-1.5 h-1.5 rounded-full mt-2 shrink-0"
              style={{ backgroundColor: 'var(--mu)' }}
            />
            <div className="flex-1 space-y-1.5">
              <div
                className="h-3.5 rounded-[4px] w-full"
                style={{ backgroundColor: 'var(--rz)' }}
              />
              <div
                className="h-3.5 rounded-[4px] w-4/5"
                style={{ backgroundColor: 'var(--rz)' }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Key formulas block skeleton */}
      <div
        className="p-4 rounded-[6px] border animate-pulse space-y-2.5 mt-4"
        style={{
          backgroundColor: 'var(--rz)',
          borderColor: 'var(--bd)',
        }}
      >
        <div
          className="h-3.5 rounded-[4px] w-1/3"
          style={{ backgroundColor: 'var(--pn)' }}
        />
        <div
          className="h-8 rounded-[4px] w-5/6 mx-auto"
          style={{ backgroundColor: 'var(--pn)' }}
        />
      </div>
    </div>
  );
}

/**
 * AI Study Hub Slide-Over Drawer (Summary + Active-Recall Quiz powered by Gemma 4).
 *
 * State management:
 * - Tracks `summaryResult`, `quizResult` (list of Q&A items), and `loadingAction` (`'summary' | 'quiz' | null`)
 *   scoped by `activeTab.id` so switching between note tabs never displays stale results belonging to a different note,
 *   while switching back and forth preserves results generated during the session.
 * - Cancels in-flight requests automatically via `AbortController` if the user closes the panel, switches tabs,
 *   or cancels.
 * - Guards against duplicate concurrent clicks while `isLoading` is true.
 */
export function StudyHubDrawer({
  open,
  onOpenChange,
  activeTab,
  aiModel,
  noteFont = 'Newsreader',
  onInsertIntoNote,
  onOpenAiSettings,
}) {
  const { showToast } = useToast();

  // Per-tab session cache: tabId -> { summary, quiz, lastView, errorState, expandedQuizItems }
  const [resultsByTabId, setResultsByTabId] = useState({});
  const [loadingAction, setLoadingAction] = useState(null); // 'summary' | 'quiz' | null

  const abortControllerRef = useRef(null);
  const requestIdRef = useRef(0);

  const tabId = activeTab?.id || 'default';
  const currentTabData = resultsByTabId[tabId] || {
    summary: null,
    quiz: null,
    lastView: 'summary',
    errorState: null,
    expandedQuizItems: [],
  };

  const summaryResult = currentTabData.summary;
  const quizResult = currentTabData.quiz;
  const activeView = currentTabData.lastView || 'summary';
  const errorState = currentTabData.errorState || null;
  const expandedQuizItems = currentTabData.expandedQuizItems || [];
  const isLoading = Boolean(loadingAction);

  const updateCurrentTabData = useCallback(
    (patch) => {
      setResultsByTabId((prev) => ({
        ...prev,
        [tabId]: {
          summary: null,
          quiz: null,
          lastView: 'summary',
          errorState: null,
          expandedQuizItems: [],
          ...(prev[tabId] || {}),
          ...patch,
        },
      }));
    },
    [tabId]
  );

  const setActiveView = useCallback(
    (view) => updateCurrentTabData({ lastView: view }),
    [updateCurrentTabData]
  );

  const setErrorState = useCallback(
    (err) => updateCurrentTabData({ errorState: err }),
    [updateCurrentTabData]
  );

  const setExpandedQuizItems = useCallback(
    (items) => updateCurrentTabData({ expandedQuizItems: items }),
    [updateCurrentTabData]
  );

  const activeFontFamily =
    NOTE_FONT_FAMILIES[noteFont] || NOTE_FONT_FAMILIES.Newsreader;

  const activeModelMeta =
    AI_MODEL_OPTIONS.find((m) => m.id === aiModel) || {
      id: aiModel,
      badge: aiModel?.startsWith('gemma') ? 'Gemma 4' : 'Gemini',
    };

  const abortActiveController = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    requestIdRef.current += 1;
  }, []);

  const cancelInFlightRequest = useCallback(() => {
    abortActiveController();
    setLoadingAction(null);
  }, [abortActiveController]);

  // Synchronize with external AbortController if the user switches note tabs or closes the Study Hub
  useEffect(() => {
    if (!open) {
      abortActiveController();
    }
  }, [open, abortActiveController]);

  useEffect(() => {
    return () => {
      abortActiveController();
    };
  }, [tabId, abortActiveController]);

  const handleSummarize = useCallback(async () => {
    if (isLoading) return; // Guard against duplicate concurrent requests

    abortActiveController();
    const currentReqId = ++requestIdRef.current;
    const controller = new AbortController();
    abortControllerRef.current = controller;

    updateCurrentTabData({ lastView: 'summary', errorState: null });
    setLoadingAction('summary');

    const snapshotTabId = tabId;
    const snapshotContent = activeTab?.content || '';
    const snapshotTitle = activeTab?.title || 'Untitled note';

    try {
      const summaryMarkdown = await generateNoteSummary({
        noteContent: snapshotContent,
        noteTitle: snapshotTitle,
        model: aiModel,
        signal: controller.signal,
      });

      if (requestIdRef.current !== currentReqId) return;

      setResultsByTabId((prev) => ({
        ...prev,
        [snapshotTabId]: {
          ...(prev[snapshotTabId] || {}),
          summary: summaryMarkdown,
          lastView: 'summary',
          errorState: null,
        },
      }));
    } catch (err) {
      if (requestIdRef.current !== currentReqId || err?.code === 'ABORTED') {
        return;
      }
      setResultsByTabId((prev) => ({
        ...prev,
        [snapshotTabId]: {
          ...(prev[snapshotTabId] || {}),
          errorState: {
            message:
              err?.userMessage ||
              err?.message ||
              'Could not generate the note summary. Please try again.',
            code: err?.code || 'ERROR',
            retryAction: 'summary',
          },
        },
      }));
    } finally {
      if (requestIdRef.current === currentReqId) {
        setLoadingAction(null);
        abortControllerRef.current = null;
      }
    }
  }, [
    abortActiveController,
    activeTab?.content,
    activeTab?.title,
    aiModel,
    isLoading,
    tabId,
    updateCurrentTabData,
  ]);

  const handleQuizMe = useCallback(async () => {
    if (isLoading) return; // Guard against duplicate concurrent requests

    abortActiveController();
    const currentReqId = ++requestIdRef.current;
    const controller = new AbortController();
    abortControllerRef.current = controller;

    // Ensure all answers start collapsed for active recall
    updateCurrentTabData({
      lastView: 'quiz',
      errorState: null,
      expandedQuizItems: [],
    });
    setLoadingAction('quiz');

    const snapshotTabId = tabId;
    const snapshotContent = activeTab?.content || '';
    const snapshotTitle = activeTab?.title || 'Untitled note';

    try {
      const quizItems = await generateNoteQuiz({
        noteContent: snapshotContent,
        noteTitle: snapshotTitle,
        model: aiModel,
        signal: controller.signal,
      });

      if (requestIdRef.current !== currentReqId) return;

      setResultsByTabId((prev) => ({
        ...prev,
        [snapshotTabId]: {
          ...(prev[snapshotTabId] || {}),
          quiz: quizItems,
          lastView: 'quiz',
          errorState: null,
          expandedQuizItems: [],
        },
      }));
    } catch (err) {
      if (requestIdRef.current !== currentReqId || err?.code === 'ABORTED') {
        return;
      }
      setResultsByTabId((prev) => ({
        ...prev,
        [snapshotTabId]: {
          ...(prev[snapshotTabId] || {}),
          errorState: {
            message:
              err?.userMessage ||
              err?.message ||
              'Could not generate the quiz from your notes. Please try again.',
            code: err?.code || 'ERROR',
            retryAction: 'quiz',
          },
        },
      }));
    } finally {
      if (requestIdRef.current === currentReqId) {
        setLoadingAction(null);
        abortControllerRef.current = null;
      }
    }
  }, [
    abortActiveController,
    activeTab?.content,
    activeTab?.title,
    aiModel,
    isLoading,
    tabId,
    updateCurrentTabData,
  ]);

  const handleCopySummary = async () => {
    if (!summaryResult) return;
    try {
      await navigator.clipboard.writeText(summaryResult);
      showToast('Copied summary to clipboard');
    } catch {
      showToast('Could not copy summary', 'error');
    }
  };

  const handleInsertSummary = () => {
    if (!summaryResult || !onInsertIntoNote) return;
    onInsertIntoNote(`\n## Executive Summary\n\n${summaryResult}\n`);
    showToast('Inserted summary into note');
  };

  const displayedMode =
    loadingAction ||
    errorState?.retryAction ||
    (activeView === 'quiz' && quizResult
      ? 'quiz'
      : activeView === 'summary' && summaryResult
      ? 'summary'
      : quizResult && !summaryResult
      ? 'quiz'
      : 'summary');

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          cancelInFlightRequest();
        }
        onOpenChange?.(nextOpen);
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay
          className="fixed inset-0 z-40 bg-black/45 transition-opacity no-print"
          style={{ backdropFilter: 'blur(1px)' }}
        />
        <Dialog.Content
          id="study-hub-drawer"
          aria-describedby="study-hub-desc"
          className="fixed right-0 top-0 bottom-0 z-50 w-[92vw] max-w-[460px] flex flex-col border-l focus:outline-none no-print"
          style={{
            backgroundColor: 'var(--pn)',
            color: 'var(--tx)',
            borderColor: 'var(--bd2)',
          }}
        >
          {/* 1. Drawer Header */}
          <div
            className="flex items-center justify-between px-5 py-3.5 border-b select-none shrink-0"
            style={{ borderColor: 'var(--bd)', backgroundColor: 'var(--bg)' }}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <StudyBookIcon size={17} className="text-[var(--accent-text)] shrink-0" />
              <div className="min-w-0">
                <Dialog.Title
                  className="text-[17px] font-medium m-0 leading-tight"
                  style={{ fontFamily: 'var(--font-serif)' }}
                >
                  Study Hub
                </Dialog.Title>
                <p
                  id="study-hub-desc"
                  className="text-[11.5px] text-[var(--mu)] m-0 truncate"
                >
                  Active note: <span className="text-[var(--tx)] font-medium">{activeTab?.title || 'Untitled'}</span>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {onOpenAiSettings && (
                <button
                  type="button"
                  onClick={() => onOpenAiSettings('ai')}
                  title={`Powered by ${aiModel} (click to configure)`}
                  className="px-2 py-0.5 text-[11px] font-medium rounded-[4px] cursor-pointer hover:border-[var(--accent)] transition-colors"
                  style={{
                    backgroundColor: 'var(--rz)',
                    color: 'var(--mu)',
                    border: '1px solid var(--bd2)',
                  }}
                >
                  {activeModelMeta.badge}
                </button>
              )}

              <Dialog.Close asChild>
                <button
                  type="button"
                  aria-label="Close Study Hub"
                  className="w-[30px] h-[30px] rounded-[6px] flex items-center justify-center text-[var(--mu)] hover:text-[var(--tx)] hover:bg-[var(--rz)] cursor-pointer"
                >
                  <CloseIcon size={14} />
                </button>
              </Dialog.Close>
            </div>
          </div>

          {/* 2. Primary Action Buttons ("Summarize Notes" & "Quiz Me") */}
          <div
            className="px-5 py-3.5 border-b flex items-center gap-2.5 shrink-0 select-none"
            style={{ borderColor: 'var(--bd)', backgroundColor: 'var(--pn)' }}
          >
            <button
              id="study-hub-summarize-btn"
              type="button"
              disabled={isLoading}
              aria-busy={loadingAction === 'summary'}
              onClick={handleSummarize}
              className="flex-1 inline-flex items-center justify-center gap-2 h-[36px] px-3.5 rounded-[6px] text-[13px] font-medium transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                backgroundColor:
                  displayedMode === 'summary' && (summaryResult || loadingAction === 'summary')
                    ? 'var(--rz)'
                    : 'var(--bg)',
                color: 'var(--tx)',
                border:
                  displayedMode === 'summary' && (summaryResult || loadingAction === 'summary')
                    ? '1px solid var(--accent)'
                    : '1px solid var(--bd2)',
              }}
            >
              <SummarizeIcon size={15} className="text-[var(--accent-text)] shrink-0" />
              <span>
                {loadingAction === 'summary' ? 'Summarizing...' : 'Summarize Notes'}
              </span>
            </button>

            <button
              id="study-hub-quiz-btn"
              type="button"
              disabled={isLoading}
              aria-busy={loadingAction === 'quiz'}
              onClick={handleQuizMe}
              className="flex-1 inline-flex items-center justify-center gap-2 h-[36px] px-3.5 rounded-[6px] text-[13px] font-medium transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                backgroundColor:
                  displayedMode === 'quiz' && (quizResult || loadingAction === 'quiz')
                    ? 'var(--rz)'
                    : 'var(--bg)',
                color: 'var(--tx)',
                border:
                  displayedMode === 'quiz' && (quizResult || loadingAction === 'quiz')
                    ? '1px solid var(--accent)'
                    : '1px solid var(--bd2)',
              }}
            >
              <QuizHelpIcon size={15} className="text-[var(--accent-text)] shrink-0" />
              <span>{loadingAction === 'quiz' ? 'Quizzing...' : 'Quiz Me'}</span>
            </button>
          </div>

          {/* Quick view switcher if BOTH a summary and a quiz have already been generated for this note */}
          {!isLoading && !errorState && summaryResult && quizResult && (
            <div
              className="px-5 py-2 border-b flex items-center justify-between text-[12px] select-none shrink-0"
              style={{ borderColor: 'var(--bd)', backgroundColor: 'var(--bg)' }}
            >
              <span className="text-[var(--mu)]">Saved for this note:</span>
              <div className="inline-flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setActiveView('summary')}
                  className={`px-2 py-0.5 rounded-[4px] cursor-pointer ${
                    displayedMode === 'summary'
                      ? 'font-medium text-[var(--tx)] bg-[var(--rz)]'
                      : 'text-[var(--mu)] hover:text-[var(--tx)]'
                  }`}
                >
                  Summary
                </button>
                <button
                  type="button"
                  onClick={() => setActiveView('quiz')}
                  className={`px-2 py-0.5 rounded-[4px] cursor-pointer ${
                    displayedMode === 'quiz'
                      ? 'font-medium text-[var(--tx)] bg-[var(--rz)]'
                      : 'text-[var(--mu)] hover:text-[var(--tx)]'
                  }`}
                >
                  Quiz (3)
                </button>
              </div>
            </div>
          )}

          {/* 3. Result Area (Loading Skeletons / Error Banner / Summary View / Interactive Quiz Accordion / Empty State) */}
          <div className="flex-1 overflow-y-auto p-5">
            {isLoading ? (
              <StudyHubSkeleton mode={loadingAction} />
            ) : errorState ? (
              <div
                role="alert"
                className="p-4 rounded-[8px] border space-y-3"
                style={{
                  backgroundColor: 'var(--callout-bg)',
                  borderColor: 'var(--bd2)',
                  color: 'var(--tx)',
                }}
              >
                <div className="text-[13.5px] leading-relaxed">{errorState.message}</div>
                <div className="flex items-center gap-2 flex-wrap">
                  {errorState.code !== 'EMPTY_NOTES' && (
                    <button
                      type="button"
                      onClick={() => {
                        if (errorState.retryAction === 'quiz') {
                          handleQuizMe();
                        } else {
                          handleSummarize();
                        }
                      }}
                      className="inline-flex items-center gap-1.5 h-[30px] px-3 rounded-[6px] text-[12px] font-medium cursor-pointer"
                      style={{
                        backgroundColor: 'var(--rz)',
                        color: 'var(--tx)',
                        border: '1px solid var(--bd2)',
                      }}
                    >
                      <RetryIcon size={12} />
                      <span>Retry</span>
                    </button>
                  )}

                  {(errorState.code === 'MISSING_KEY' || errorState.code === 'INVALID_KEY') &&
                    onOpenAiSettings && (
                      <button
                        type="button"
                        onClick={() => onOpenAiSettings('ai')}
                        className="h-[30px] px-3 rounded-[6px] text-[12px] font-semibold cursor-pointer"
                        style={{
                          backgroundColor: 'var(--accent)',
                          color: 'var(--on-accent)',
                        }}
                      >
                        Configure API key
                      </button>
                    )}

                  <button
                    type="button"
                    onClick={() => setErrorState(null)}
                    className="h-[30px] px-2.5 text-[12px] text-[var(--mu)] hover:text-[var(--tx)] cursor-pointer"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            ) : displayedMode === 'summary' && summaryResult ? (
              <div id="study-hub-summary-view" className="space-y-4">
                <div className="flex items-center justify-between gap-2 pb-2 border-b" style={{ borderColor: 'var(--bd)' }}>
                  <span className="text-[11.5px] font-semibold uppercase tracking-wider text-[var(--mu)]">
                    Executive Summary &amp; Key Formulas
                  </span>
                  <div className="flex items-center gap-2.5 text-[11.5px] text-[var(--mu)]">
                    <button
                      type="button"
                      onClick={handleCopySummary}
                      className="inline-flex items-center gap-1 hover:text-[var(--tx)] cursor-pointer"
                    >
                      <CopyIcon size={12} />
                      <span>Copy</span>
                    </button>
                    {onInsertIntoNote && (
                      <button
                        type="button"
                        onClick={handleInsertSummary}
                        className="inline-flex items-center gap-1 hover:text-[var(--tx)] cursor-pointer"
                      >
                        <InsertNoteIcon size={12} />
                        <span>Insert in note</span>
                      </button>
                    )}
                  </div>
                </div>

                <StudyMarkdown fontFamily={activeFontFamily}>
                  {summaryResult}
                </StudyMarkdown>
              </div>
            ) : displayedMode === 'quiz' && quizResult && quizResult.length > 0 ? (
              <div id="study-hub-quiz-view" className="space-y-3.5">
                <div
                  className="flex items-center justify-between gap-2 pb-2 border-b"
                  style={{ borderColor: 'var(--bd)' }}
                >
                  <span className="text-[11.5px] font-semibold uppercase tracking-wider text-[var(--mu)]">
                    Active-Recall Quiz ({quizResult.length} questions)
                  </span>
                  <span className="text-[11.5px] text-[var(--mu)]">
                    Click a question to reveal answer
                  </span>
                </div>

                <Accordion
                  type="multiple"
                  value={expandedQuizItems}
                  onValueChange={setExpandedQuizItems}
                  className="space-y-2.5"
                >
                  {quizResult.map((item, idx) => (
                    <AccordionItem key={item.id || idx} value={item.id || `item-${idx}`}>
                      <AccordionTrigger>
                        <div className="flex items-baseline gap-2.5">
                          <span
                            className="text-[11.5px] font-mono font-semibold shrink-0 tabular-nums px-1.5 py-0.5 rounded-[4px]"
                            style={{
                              backgroundColor: 'var(--rz)',
                              color: 'var(--accent-text)',
                            }}
                          >
                            Q{idx + 1}
                          </span>
                          <div className="flex-1 min-w-0">
                            <StudyMarkdown fontFamily={activeFontFamily} compact>
                              {item.question}
                            </StudyMarkdown>
                          </div>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="space-y-1">
                          <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--accent-text)]">
                            Answer
                          </div>
                          <StudyMarkdown fontFamily={activeFontFamily} compact>
                            {item.answer}
                          </StudyMarkdown>
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </div>
            ) : (
              /* Calm Empty State before generation */
              <div
                id="study-hub-empty-state"
                className="h-full min-h-[260px] flex flex-col items-center justify-center text-center px-4 select-none"
              >
                <div
                  className="w-10 h-10 rounded-[8px] flex items-center justify-center mb-3 border"
                  style={{
                    backgroundColor: 'var(--rz)',
                    borderColor: 'var(--bd2)',
                    color: 'var(--accent-text)',
                  }}
                >
                  <StudyBookIcon size={18} />
                </div>
                <h3
                  className="text-[16px] font-medium text-[var(--tx)] m-0 mb-1.5"
                  style={{ fontFamily: 'var(--font-serif)' }}
                >
                  Turn your notes into study material
                </h3>
                <p className="text-[13px] text-[var(--mu)] max-w-[320px] leading-relaxed m-0">
                  Choose <strong>Summarize Notes</strong> for a three-bullet executive summary with
                  key formulas, or <strong>Quiz Me</strong> for an interactive three-question
                  active-recall check.
                </p>
              </div>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
