import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import {
  ImageIcon,
  SendArrowIcon,
  CloseIcon,
  CopyIcon,
  InsertNoteIcon,
  RetryIcon,
  TrashIcon,
  UploadIcon,
} from './Icons';
import { askStudyAssistant, AI_MODEL_OPTIONS } from '../lib/aiService';
import { compressImageDataUrl } from '../lib/storage';
import { useToast } from './ToastContext';

let msgCounter = 1;
function nextMessageId() {
  msgCounter += 1;
  return `msg-${Date.now()}-${msgCounter}`;
}

export function ChatDock({
  messages = [],
  onAddMessage,
  onRemoveMessage,
  onClearMessages,
  onInsertReplyToNote,
  onInspectFrame,
  onOpenAiSettings,
  frames = [],
  aiModel,
  externalAttachedFrame = null,
  onClearExternalAttachedFrame,
  currentTimeStr = '00:00',
}) {
  const [inputText, setInputText] = useState('');
  const [attachedFrame, setAttachedFrame] = useState(null);
  const [prevExternalFrame, setPrevExternalFrame] = useState(null);
  const [isSending, setIsSending] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  const messagesEndRef = useRef(null);
  const abortControllerRef = useRef(null);
  const chatImageInputRef = useRef(null);
  const inputRef = useRef(null);
  const { showToast } = useToast();

  // Accept frame attached from the FramesTray "Send to chat" button
  if (externalAttachedFrame && externalAttachedFrame !== prevExternalFrame) {
    setPrevExternalFrame(externalAttachedFrame);
    setAttachedFrame(externalAttachedFrame);
  }

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, isSending]);

  const activeModelMeta =
    AI_MODEL_OPTIONS.find((m) => m.id === aiModel) || {
      id: aiModel,
      badge: aiModel?.startsWith('gemma') ? 'Gemma 4' : 'Gemini',
    };

  const executeChatTurn = async ({ promptText, frameObj, existingHistory }) => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setIsSending(true);

    try {
      const replyText = await askStudyAssistant({
        history: existingHistory,
        text: promptText,
        imageBase64: frameObj?.base64 || null,
        model: aiModel,
        signal: controller.signal,
      });

      onAddMessage({
        id: nextMessageId(),
        sender: 'assistant',
        text: replyText,
      });
    } catch (err) {
      if (err?.code === 'ABORTED') {
        onAddMessage({
          id: nextMessageId(),
          sender: 'assistant',
          text: 'Response stopped.',
          interrupted: true,
        });
      } else {
        onAddMessage({
          id: nextMessageId(),
          sender: 'assistant',
          text: err?.userMessage || 'Could not reach the model. Check your connection or API key.',
          error: true,
          errorCode: err?.code || 'ERROR',
          retryPayload: {
            promptText,
            frameObj,
          },
        });
      }
    } finally {
      setIsSending(false);
      abortControllerRef.current = null;
    }
  };

  const handleSend = async (e, overrideText = null) => {
    e?.preventDefault();
    if (isSending) return;

    const text = (overrideText !== null ? overrideText : inputText).trim();
    if (!text && !attachedFrame) return;

    const frameToSend = attachedFrame;
    const userMsg = {
      id: nextMessageId(),
      sender: 'user',
      text: text || 'Explain the math and concepts shown in this frame.',
      frameId: frameToSend?.id || null,
      frameChip: frameToSend ? `Frame ${frameToSend.timestamp || currentTimeStr}` : null,
      imageDataUrl: frameToSend?.dataUrl || null,
      imageBase64: frameToSend?.base64 || null,
    };

    const historySnapshot = [...messages];
    onAddMessage(userMsg);
    if (overrideText === null) setInputText('');
    setAttachedFrame(null);
    if (onClearExternalAttachedFrame) onClearExternalAttachedFrame();

    await executeChatTurn({
      promptText: userMsg.text,
      frameObj: frameToSend,
      existingHistory: historySnapshot,
    });
  };

  const handleStopResponse = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  const handleRetryTurn = async (errMsgObj) => {
    if (!errMsgObj?.retryPayload) return;
    if (onRemoveMessage) {
      onRemoveMessage(errMsgObj.id);
    }
    const cleanHistory = messages.filter((m) => m.id !== errMsgObj.id);
    await executeChatTurn({
      promptText: errMsgObj.retryPayload.promptText,
      frameObj: errMsgObj.retryPayload.frameObj,
      existingHistory: cleanHistory.slice(0, -1),
    });
  };

  const handleCopyReply = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      showToast('Copied reply to clipboard');
    } catch {
      showToast('Could not copy to clipboard', 'error');
    }
  };

  const handleInsertReply = (fullText) => {
    if (!onInsertReplyToNote) return;
    // Check if the user highlighted a specific portion of the assistant reply
    let textToInsert = fullText;
    if (typeof window !== 'undefined' && window.getSelection) {
      const sel = window.getSelection()?.toString()?.trim();
      if (sel && fullText.includes(sel)) {
        textToInsert = sel;
      }
    }
    onInsertReplyToNote(textToInsert);
    showToast('Inserted reply at note cursor');
  };

  const handleUploadChatImage = (e) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const compressed = await compressImageDataUrl(reader.result);
        setAttachedFrame({
          id: `chat-img-${Date.now()}`,
          timestamp: currentTimeStr || '00:00',
          label: file.name.slice(0, 12),
          caption: file.name,
          dataUrl: compressed.dataUrl,
          base64: compressed.base64,
        });
        showToast('Attached image to message');
        inputRef.current?.focus();
      } catch {
        showToast('Could not attach image.', 'error');
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleOpenMessageFrame = (msg) => {
    if (!onInspectFrame) return;
    const matched = frames.find((f) => f.id === msg.frameId || `Frame ${f.timestamp}` === msg.frameChip);
    if (matched) {
      onInspectFrame(matched);
      return;
    }
    if (msg.imageDataUrl || msg.imageBase64) {
      onInspectFrame({
        id: msg.frameId || msg.id,
        timestamp: (msg.frameChip || '').replace(/^Frame\s+/i, '') || '00:00',
        caption: msg.frameChip || 'Attached image',
        dataUrl:
          msg.imageDataUrl ||
          (msg.imageBase64 ? `data:image/jpeg;base64,${msg.imageBase64}` : null),
        base64: msg.imageBase64,
      });
    }
  };

  return (
    <section
      id="chat-dock"
      aria-label="Lecture AI assistant chat"
      className="h-[245px] rounded-[8px] flex flex-col justify-between overflow-hidden p-3.5 transition-colors border"
      style={{
        backgroundColor: 'var(--pn)',
        borderColor: 'var(--bd)',
      }}
    >
      {/* 1. Header */}
      <div
        className="flex items-center justify-between pb-2 mb-1 border-b select-none"
        style={{ borderColor: 'var(--bd)' }}
      >
        <h2 className="text-[13px] font-medium text-[var(--tx)] m-0">Ask about this lecture</h2>

        <div className="flex items-center gap-2">
          {messages.length > 0 && (
            <>
              {!confirmClear ? (
                <button
                  type="button"
                  onClick={() => setConfirmClear(true)}
                  aria-label="Clear conversation history"
                  className="inline-flex items-center gap-1 text-[11px] text-[var(--mu)] hover:text-[var(--tx)] px-1.5 py-0.5 rounded-[4px] cursor-pointer"
                >
                  <TrashIcon size={11} />
                  <span>Clear</span>
                </button>
              ) : (
                <div className="flex items-center gap-1 text-[11px]">
                  <button
                    type="button"
                    onClick={() => {
                      onClearMessages();
                      setConfirmClear(false);
                      showToast('Cleared conversation');
                    }}
                    className="px-1.5 py-0.5 rounded-[4px] font-medium text-rose-400 hover:underline cursor-pointer"
                  >
                    Confirm clear
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmClear(false)}
                    className="px-1 py-0.5 text-[var(--mu)] cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </>
          )}

          <button
            type="button"
            onClick={() => onOpenAiSettings && onOpenAiSettings('ai')}
            title={`Active model: ${aiModel} (Click to configure model or API key)`}
            className="px-2 py-0.5 text-[11px] font-medium rounded-[4px] tracking-tight cursor-pointer hover:border-[var(--accent)] transition-colors"
            style={{
              backgroundColor: 'var(--rz)',
              color: 'var(--mu)',
              border: '1px solid var(--bd2)',
            }}
          >
            {activeModelMeta.badge}
          </button>
        </div>
      </div>

      {/* 2. Messages List or Calm Empty State */}
      <div className="flex-1 overflow-y-auto space-y-2.5 pr-1 py-1 text-[13px]">
        {messages.length === 0 && !isSending ? (
          <div className="h-full flex flex-col justify-center text-[12.5px] text-[var(--mu)]">
            <p className="m-0">
              Ask a question about the lecture or attach a captured frame for step-by-step math explanations.
            </p>
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}
            >
              {msg.sender === 'user' ? (
                <div
                  dir="auto"
                  className="max-w-[85%] px-3 py-1.5 rounded-[6px] flex items-center gap-2 flex-wrap"
                  style={{
                    backgroundColor: 'var(--rz)',
                    color: 'var(--tx)',
                    border: '1px solid var(--bd2)',
                  }}
                >
                  {msg.frameChip && (
                    <button
                      type="button"
                      onClick={() => handleOpenMessageFrame(msg)}
                      title="Click to view full captured frame"
                      className="px-1.5 py-0.5 text-[10.5px] font-medium rounded-[4px] shrink-0 tabular-nums cursor-pointer hover:opacity-90"
                      style={{
                        backgroundColor: 'rgba(15, 14, 12, 0.88)',
                        color: '#f2eee6',
                        border: '1px solid rgba(255, 248, 235, 0.18)',
                      }}
                    >
                      {msg.frameChip}
                    </button>
                  )}
                  <span>{msg.text}</span>
                </div>
              ) : (
                <div className="w-full max-w-[96%] py-1 text-[var(--tx)] leading-relaxed group">
                  {msg.error ? (
                    <div
                      role="alert"
                      className="p-2.5 rounded-[6px] flex items-center justify-between gap-3 flex-wrap text-[12.5px]"
                      style={{
                        backgroundColor: 'var(--callout-bg)',
                        border: '1px solid var(--bd2)',
                      }}
                    >
                      <span>{msg.text}</span>
                      <div className="flex items-center gap-2 shrink-0">
                        {(msg.errorCode === 'MISSING_KEY' || msg.errorCode === 'INVALID_KEY') &&
                          onOpenAiSettings && (
                            <button
                              type="button"
                              onClick={() => onOpenAiSettings('ai')}
                              className="px-2.5 py-1 rounded-[4px] text-[11.5px] font-semibold cursor-pointer"
                              style={{
                                backgroundColor: 'var(--accent)',
                                color: 'var(--on-accent)',
                              }}
                            >
                              Set API key
                            </button>
                          )}
                        {msg.retryPayload && (
                          <button
                            type="button"
                            onClick={() => handleRetryTurn(msg)}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-[4px] text-[11.5px] font-medium cursor-pointer"
                            style={{
                              backgroundColor: 'var(--rz)',
                              border: '1px solid var(--bd2)',
                            }}
                          >
                            <RetryIcon size={11} />
                            <span>Retry</span>
                          </button>
                        )}
                      </div>
                    </div>
                  ) : (
                    <>
                      <div dir="auto" className="chat-markdown-body space-y-1.5">
                        <ReactMarkdown
                          remarkPlugins={[remarkMath]}
                          rehypePlugins={[
                            [
                              rehypeKatex,
                              { throwOnError: false, errorColor: '#d98a86', strict: 'ignore' },
                            ],
                          ]}
                        >
                          {msg.text}
                        </ReactMarkdown>
                      </div>

                      {!msg.interrupted && (
                        <div className="flex items-center gap-3 mt-1 text-[11px] text-[var(--mu)] opacity-80 group-hover:opacity-100 transition-opacity select-none">
                          <button
                            type="button"
                            onClick={() => handleCopyReply(msg.text)}
                            className="inline-flex items-center gap-1 hover:text-[var(--tx)] cursor-pointer"
                          >
                            <CopyIcon size={11} />
                            <span>Copy</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleInsertReply(msg.text)}
                            title="Insert reply (or highlighted selection) at note cursor"
                            className="inline-flex items-center gap-1 hover:text-[var(--tx)] cursor-pointer"
                          >
                            <InsertNoteIcon size={11} />
                            <span>Insert in note</span>
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          ))
        )}

        {isSending && (
          <div
            role="status"
            aria-live="polite"
            className="flex items-center justify-between gap-2 text-[var(--mu)] text-[12px] py-1"
          >
            <div className="flex items-center gap-1.5">
              <span
                className="w-1.5 h-1.5 rounded-full animate-pulse"
                style={{ backgroundColor: 'var(--accent)' }}
              />
              <span>
                {attachedFrame
                  ? 'Model is analyzing the frame and math...'
                  : 'Model is preparing an answer...'}
              </span>
            </div>
            <button
              type="button"
              onClick={handleStopResponse}
              className="px-2 py-0.5 rounded-[4px] text-[11px] font-medium text-[var(--tx)] cursor-pointer"
              style={{
                backgroundColor: 'var(--rz)',
                border: '1px solid var(--bd2)',
              }}
            >
              Stop
            </button>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* 3. Input Row */}
      <form onSubmit={(e) => handleSend(e)} className="pt-2 flex items-center gap-2">
        <input
          ref={chatImageInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleUploadChatImage}
        />

        {/* Attach Frame / Image Dropdown Menu */}
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button
              type="button"
              aria-label="Attach captured lecture frame or image"
              className="flex items-center justify-center w-[34px] h-[34px] rounded-[6px] text-[var(--mu)] hover:text-[var(--tx)] hover:bg-[var(--rz)] transition-colors shrink-0 cursor-pointer"
              style={{
                border: '1px solid var(--bd2)',
              }}
            >
              <ImageIcon size={15} />
            </button>
          </DropdownMenu.Trigger>

          <DropdownMenu.Portal>
            <DropdownMenu.Content
              align="start"
              side="top"
              sideOffset={6}
              className="z-50 min-w-[200px] p-1 rounded-[6px] text-[12.5px]"
              style={{
                backgroundColor: 'var(--rz)',
                color: 'var(--tx)',
                border: '1px solid var(--bd2)',
              }}
            >
              <DropdownMenu.Item
                onSelect={() => chatImageInputRef.current?.click()}
                className="flex items-center gap-2 px-2.5 py-1.5 rounded-[4px] cursor-pointer outline-none hover:bg-[var(--pn)] focus:bg-[var(--pn)] font-medium"
              >
                <UploadIcon size={13} />
                <span>Upload image from computer...</span>
              </DropdownMenu.Item>

              <div
                className="px-2.5 pt-2 pb-1 text-[10.5px] font-semibold text-[var(--mu)] uppercase tracking-wider border-t mt-1"
                style={{ borderColor: 'var(--bd)' }}
              >
                Captured frames ({frames.length})
              </div>
              {frames.length === 0 ? (
                <div className="px-2.5 py-1.5 text-[11.5px] text-[var(--mu)]">
                  Capture a frame from the video first
                </div>
              ) : (
                frames.slice(0, 8).map((frame) => (
                  <DropdownMenu.Item
                    key={frame.id}
                    onSelect={() => {
                      setAttachedFrame(frame);
                      showToast(`Attached frame ${frame.timestamp}`);
                      inputRef.current?.focus();
                    }}
                    className="flex items-center justify-between px-2.5 py-1.5 rounded-[4px] cursor-pointer outline-none hover:bg-[var(--pn)] focus:bg-[var(--pn)]"
                  >
                    <span className="tabular-nums">Frame {frame.timestamp}</span>
                    <span className="text-[11px] text-[var(--mu)] italic truncate max-w-[90px]">
                      {frame.label}
                    </span>
                  </DropdownMenu.Item>
                ))
              )}
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>

        {/* Text Input with attached chip */}
        <div
          className="flex-1 flex items-center gap-2 h-[34px] px-3 rounded-[6px] transition-colors min-w-0"
          style={{
            backgroundColor: 'transparent',
            border: '1px solid var(--bd2)',
          }}
        >
          {attachedFrame && (
            <span
              className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[11px] rounded-[4px] shrink-0 font-medium tabular-nums"
              style={{
                backgroundColor: 'var(--rz)',
                color: 'var(--tx)',
                border: '1px solid var(--bd2)',
              }}
            >
              <span>Frame {attachedFrame.timestamp}</span>
              <button
                type="button"
                aria-label="Remove attached frame"
                onClick={() => {
                  setAttachedFrame(null);
                  if (onClearExternalAttachedFrame) onClearExternalAttachedFrame();
                }}
                className="hover:text-rose-400 p-0.5 cursor-pointer"
              >
                <CloseIcon size={10} />
              </button>
            </span>
          )}

          <input
            ref={inputRef}
            type="text"
            dir="auto"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Ask a question or send a frame"
            aria-label="Chat query input"
            className="flex-1 min-w-0 bg-transparent text-[13px] text-[var(--tx)] placeholder:text-[var(--mu)] outline-none"
          />
        </div>

        {/* Send Button */}
        <button
          type="submit"
          disabled={isSending || (!inputText.trim() && !attachedFrame)}
          aria-label="Send message to assistant"
          className="flex items-center justify-center w-[34px] h-[34px] rounded-[6px] text-[var(--tx)] hover:bg-[var(--rz)] disabled:opacity-40 transition-colors shrink-0 cursor-pointer"
          style={{
            border: '1px solid var(--bd2)',
          }}
        >
          <SendArrowIcon size={15} />
        </button>
      </form>
    </section>
  );
}
