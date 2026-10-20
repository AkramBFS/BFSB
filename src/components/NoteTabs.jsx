import React, { useState, useRef, useEffect } from 'react';
import * as Tooltip from '@radix-ui/react-tooltip';
import { PlusIcon, CloseIcon } from './Icons';

export function NoteTabs({
  tabs,
  activeTabId,
  onSelectTab,
  onNewTab,
  onCloseTab,
  onRenameTab,
  onReorderTabs,
}) {
  const [editingTabId, setEditingTabId] = useState(null);
  const [editTitle, setEditTitle] = useState('');
  const [draggedIdx, setDraggedIdx] = useState(null);
  const editInputRef = useRef(null);
  const tabListRef = useRef(null);

  useEffect(() => {
    if (editingTabId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingTabId]);

  const startRenaming = (tab) => {
    setEditingTabId(tab.id);
    setEditTitle(tab.title);
  };

  const commitRenaming = () => {
    if (editingTabId) {
      const trimmed = editTitle.trim();
      if (trimmed) {
        onRenameTab(editingTabId, trimmed);
      }
      setEditingTabId(null);
    }
  };

  const handleKeyDownTab = (e, index) => {
    if (editingTabId) return;

    // Alt + Left/Right reorders the active tab
    if (e.altKey && (e.key === 'ArrowRight' || e.key === 'ArrowLeft') && onReorderTabs) {
      e.preventDefault();
      const targetIndex =
        e.key === 'ArrowRight'
          ? Math.min(tabs.length - 1, index + 1)
          : Math.max(0, index - 1);
      if (targetIndex !== index) {
        onReorderTabs(index, targetIndex);
      }
      return;
    }

    if (e.key === 'ArrowRight') {
      e.preventDefault();
      const nextIndex = (index + 1) % tabs.length;
      onSelectTab(tabs[nextIndex].id);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      const prevIndex = (index - 1 + tabs.length) % tabs.length;
      onSelectTab(tabs[prevIndex].id);
    } else if (e.key === 'Home') {
      e.preventDefault();
      if (tabs.length > 0) onSelectTab(tabs[0].id);
    } else if (e.key === 'End') {
      e.preventDefault();
      if (tabs.length > 0) onSelectTab(tabs[tabs.length - 1].id);
    } else if (e.key === 'F2') {
      e.preventDefault();
      startRenaming(tabs[index]);
    }
  };

  return (
    <Tooltip.Provider delayDuration={400}>
      <div
        id="note-tabs-strip"
        role="tablist"
        aria-label="Note documents"
        ref={tabListRef}
        className="flex items-end gap-1 px-3 pt-2 select-none overflow-x-auto overflow-y-hidden border-b"
        style={{
          borderColor: 'var(--bd)',
          backgroundColor: 'transparent',
        }}
      >
        {tabs.map((tab, idx) => {
          const isActive = tab.id === activeTabId;
          const isEditing = tab.id === editingTabId;

          return (
            <div
              key={tab.id}
              role="presentation"
              draggable={!isEditing && tabs.length > 1}
              onDragStart={() => setDraggedIdx(idx)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (draggedIdx !== null && draggedIdx !== idx && onReorderTabs) {
                  onReorderTabs(draggedIdx, idx);
                }
                setDraggedIdx(null);
              }}
              onDragEnd={() => setDraggedIdx(null)}
              className="relative flex items-center group -mb-[1px]"
            >
              {isEditing ? (
                <input
                  ref={editInputRef}
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  onBlur={commitRenaming}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitRenaming();
                    if (e.key === 'Escape') setEditingTabId(null);
                  }}
                  aria-label="Rename note tab"
                  className="h-[34px] px-3 text-[13px] rounded-t-[6px] font-medium outline-none border"
                  style={{
                    backgroundColor: 'var(--pn)',
                    color: 'var(--tx)',
                    borderColor: 'var(--accent)',
                  }}
                />
              ) : (
                <Tooltip.Root>
                  <Tooltip.Trigger asChild>
                    <button
                      type="button"
                      role="tab"
                      id={`tab-${tab.id}`}
                      aria-controls={`panel-${tab.id}`}
                      aria-selected={isActive}
                      tabIndex={isActive ? 0 : -1}
                      onClick={() => onSelectTab(tab.id)}
                      onDoubleClick={() => startRenaming(tab)}
                      onKeyDown={(e) => handleKeyDownTab(e, idx)}
                      className={`relative flex items-center gap-2 h-[34px] px-3 rounded-t-[6px] text-[13px] font-normal transition-colors cursor-pointer border-t border-l border-r ${
                        isActive
                          ? 'text-[var(--tx)] font-medium'
                          : 'text-[var(--mu)] hover:text-[var(--tx)] hover:bg-[var(--rz)]'
                      }`}
                      style={{
                        backgroundColor: isActive ? 'var(--pn)' : 'transparent',
                        borderColor: isActive ? 'var(--bd)' : 'transparent',
                        borderBottomColor: isActive ? 'var(--pn)' : 'var(--bd)',
                      }}
                    >
                      <span className="max-w-[140px] truncate" dir="auto">
                        {tab.title}
                      </span>

                      {/* Close tab button (always available; closing last tab creates a fresh empty one) */}
                      <span
                        role="button"
                        tabIndex={-1}
                        aria-label={`Close tab ${tab.title}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          onCloseTab(tab.id);
                        }}
                        className="p-0.5 rounded-[3px] text-[var(--mu)] hover:text-[var(--tx)] hover:bg-[var(--rz)] opacity-70 group-hover:opacity-100 transition-opacity"
                      >
                        <CloseIcon size={12} />
                      </span>
                    </button>
                  </Tooltip.Trigger>
                  <Tooltip.Portal>
                    <Tooltip.Content
                      side="top"
                      sideOffset={4}
                      className="z-50 px-2 py-1 text-[11px] rounded-[4px] shadow-none"
                      style={{
                        backgroundColor: 'var(--rz)',
                        color: 'var(--tx)',
                        border: '1px solid var(--bd2)',
                      }}
                    >
                      {tab.title} · Double-click or press F2 to rename
                    </Tooltip.Content>
                  </Tooltip.Portal>
                </Tooltip.Root>
              )}
            </div>
          );
        })}

        {/* New tab button */}
        <Tooltip.Root>
          <Tooltip.Trigger asChild>
            <button
              type="button"
              onClick={onNewTab}
              aria-label="Create new note tab"
              className="flex items-center justify-center w-[30px] h-[30px] mb-0.5 rounded-[6px] text-[var(--mu)] hover:text-[var(--tx)] hover:bg-[var(--rz)] transition-colors cursor-pointer"
            >
              <PlusIcon size={14} />
            </button>
          </Tooltip.Trigger>
          <Tooltip.Portal>
            <Tooltip.Content
              side="top"
              sideOffset={4}
              className="z-50 px-2 py-1 text-[11px] rounded-[4px]"
              style={{
                backgroundColor: 'var(--rz)',
                color: 'var(--tx)',
                border: '1px solid var(--bd2)',
              }}
            >
              New note tab
            </Tooltip.Content>
          </Tooltip.Portal>
        </Tooltip.Root>
      </div>
    </Tooltip.Provider>
  );
}
