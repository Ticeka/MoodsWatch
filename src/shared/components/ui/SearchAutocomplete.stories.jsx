/**
 * SearchAutocomplete — Storybook stories + keyboard interaction tests
 *
 * The component itself is purely presentational; keyboard navigation lives in
 * the parent (Header / Discover).  These stories test both the rendering
 * contract and the full keyboard flow by wrapping the component in a minimal
 * stateful harness.
 */
import React, { useCallback, useRef, useState } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { expect, fn, userEvent, within } from '@storybook/test';
import { SearchAutocomplete } from './SearchAutocomplete';

// ── Translation stub ────────────────────────────────────────────────────────

const t = (key, vars) => {
  const MAP = {
    'discover.autocompleteLabel': 'Suggestions',
    'discover.autocompleteSearching': 'Searching…',
    'discover.autocompleteNoResults': 'No results',
    'discover.autocompleteSearchFor': `Search for "${vars?.query}"`,
    'discover.recentSearchesLabel': 'Recent',
    'discover.scopeTitles': 'Titles',
    'discover.scopePosts': 'Posts',
    'discover.scopePeople': 'People',
    'discover.scopeTierlists': 'Tier lists',
    'discover.recoverySuggestedMany': 'Did you mean?',
    'discover.removeRecentSearch': 'Remove',
    'discover.crossLaneTitlesMissed': `"${vars?.query}" found in ${vars?.lanes}`,
  };
  return MAP[key] ?? key;
};

// ── Sample data ─────────────────────────────────────────────────────────────

const TITLE_ITEMS = [
  { id: 'title-frieren', entityId: '1', kind: 'title', title: 'Frieren', meta: 'Anime / 2023', href: '/title/frieren', flatIndex: 0 },
  { id: 'title-naruto',  entityId: '2', kind: 'title', title: 'Naruto',  meta: 'Anime / 2002', href: '/title/naruto',  flatIndex: 1 },
  { id: 'title-bleach',  entityId: '3', kind: 'title', title: 'Bleach',  meta: 'Anime / 2004', href: '/title/bleach',  flatIndex: 2 },
];

const RECENT_ITEMS = [
  { id: 'recent-frieren-0', entityId: 'Frieren', kind: 'recent', title: 'Frieren', meta: '', href: '/discover?q=Frieren', flatIndex: 0 },
  { id: 'recent-naruto-1',  entityId: 'Naruto',  kind: 'recent', title: 'Naruto',  meta: '', href: '/discover?q=Naruto',  flatIndex: 1 },
];

const RECOVERY_ITEMS = [
  { id: 'recovery-0-Frieren', entityId: 'Frieren', kind: 'recovery', title: 'Frieren', href: '/discover?q=Frieren', flatIndex: 0 },
  { id: 'recovery-1-Bleach',  entityId: 'Bleach',  kind: 'recovery', title: 'Bleach',  href: '/discover?q=Bleach',  flatIndex: 1 },
];

const GROUPS_WITH_TITLES = [
  { id: 'titles', labelKey: 'discover.scopeTitles', items: TITLE_ITEMS },
];

const GROUPS_RECENT_ONLY = [
  { id: 'recent', labelKey: 'discover.recentSearchesLabel', items: RECENT_ITEMS },
];

const GROUPS_RECOVERY = [
  { id: 'recovery', labelKey: 'discover.recoverySuggestedMany', items: RECOVERY_ITEMS },
];

// ── Keyboard-nav harness ────────────────────────────────────────────────────
//
// A minimal wrapper that drives highlightedIndex and isOpen so we can test the
// keyboard flow without needing to render the full Header.

function KeyboardHarness({ groups, flatItems, onSelect: externalOnSelect, onRemoveRecent }) {
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [isOpen, setIsOpen] = useState(true);
  const inputRef = useRef(null);

  const handleKeyDown = useCallback((event) => {
    const total = flatItems.length;
    if (total === 0) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlightedIndex((current) => (current + 1) % total);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlightedIndex((current) => (current <= 0 ? total - 1 : current - 1));
    } else if (event.key === 'Home') {
      event.preventDefault();
      setHighlightedIndex(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      setHighlightedIndex(total - 1);
    } else if (event.key === 'Escape') {
      setIsOpen(false);
      setHighlightedIndex(-1);
    }
  }, [flatItems.length]);

  return (
    <div style={{ position: 'relative', width: 360 }}>
      <input
        ref={inputRef}
        data-testid="search-input"
        defaultValue="Frieren"
        onKeyDown={handleKeyDown}
        aria-autocomplete="list"
        aria-controls="listbox-test"
        aria-activedescendant={highlightedIndex >= 0 ? (flatItems[highlightedIndex]?.id ?? undefined) : undefined}
        style={{ width: '100%', padding: '8px', marginBottom: 4 }}
      />
      <SearchAutocomplete
        groups={groups}
        flatItems={flatItems}
        isLoading={false}
        isOpen={isOpen}
        highlightedIndex={highlightedIndex}
        query="Frieren"
        listboxId="listbox-test"
        t={t}
        onSelect={externalOnSelect}
        onRemoveRecent={onRemoveRecent}
      />
    </div>
  );
}

// ── Config ──────────────────────────────────────────────────────────────────

export default {
  title: 'UI/SearchAutocomplete',
  component: SearchAutocomplete,
  decorators: [(Story) => <MemoryRouter><Story /></MemoryRouter>],
  parameters: { layout: 'padded' },
};

// ── Rendering stories ────────────────────────────────────────────────────────

export const Closed = {
  name: 'Closed (isOpen=false) — renders nothing',
  render: () => (
    <SearchAutocomplete
      isOpen={false}
      groups={[]}
      flatItems={[]}
      t={t}
      listboxId="lb"
      query=""
    />
  ),
  play: async ({ canvasElement }) => {
    // When closed the component renders null — no listbox in the DOM.
    const canvas = within(canvasElement);
    expect(canvas.queryByRole('listbox')).toBeNull();
  },
};

export const Loading = {
  name: 'Loading state — spinner + no results hidden',
  render: () => (
    <SearchAutocomplete
      isOpen
      isLoading
      groups={[]}
      flatItems={[]}
      query="Frieren"
      listboxId="lb"
      t={t}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // Loading message visible
    expect(canvas.getByText('Searching…')).toBeTruthy();
    // "No results" hidden while loading
    expect(canvas.queryByText('No results')).toBeNull();
  },
};

export const EmptyResults = {
  name: 'Empty — no results message',
  render: () => (
    <SearchAutocomplete
      isOpen
      isLoading={false}
      groups={[]}
      flatItems={[]}
      query="xyzxyz"
      listboxId="lb"
      t={t}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(canvas.getByText('No results')).toBeTruthy();
  },
};

export const WithTitles = {
  name: 'With title suggestions',
  render: () => (
    <SearchAutocomplete
      isOpen
      groups={GROUPS_WITH_TITLES}
      flatItems={TITLE_ITEMS}
      highlightedIndex={-1}
      query="Frieren"
      listboxId="lb"
      t={t}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const listbox = canvas.getByRole('listbox');
    expect(listbox).toBeTruthy();
    // All 3 items rendered as options
    const options = within(listbox).getAllByRole('option');
    expect(options.length).toBe(3);
    // None highlighted initially
    options.forEach((option) => {
      expect(option.getAttribute('aria-selected')).toBe('false');
    });
  },
};

export const HighlightedItem = {
  name: 'Highlighted item — aria-selected=true on item 1',
  render: () => (
    <SearchAutocomplete
      isOpen
      groups={GROUPS_WITH_TITLES}
      flatItems={TITLE_ITEMS}
      highlightedIndex={1}
      query="Frieren"
      listboxId="lb"
      t={t}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const options = canvas.getAllByRole('option');
    expect(options[0].getAttribute('aria-selected')).toBe('false');
    expect(options[1].getAttribute('aria-selected')).toBe('true');
    expect(options[2].getAttribute('aria-selected')).toBe('false');
    // Highlighted item has the CSS class
    expect(options[1].classList.contains('is-highlighted')).toBe(true);
  },
};

export const WithRecentItems = {
  name: 'Recent searches — remove button visible',
  render: () => (
    <SearchAutocomplete
      isOpen
      groups={GROUPS_RECENT_ONLY}
      flatItems={RECENT_ITEMS}
      highlightedIndex={-1}
      query=""
      listboxId="lb"
      t={t}
      onRemoveRecent={fn()}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // Each recent item should have a remove button
    const removeButtons = canvas.getAllByRole('button', { name: /remove/i });
    expect(removeButtons.length).toBe(RECENT_ITEMS.length);
  },
};

export const RecoveryGroup = {
  name: 'Recovery (Did you mean?) — chip layout',
  render: () => (
    <SearchAutocomplete
      isOpen
      groups={GROUPS_RECOVERY}
      flatItems={RECOVERY_ITEMS}
      highlightedIndex={-1}
      query="Frierren"
      listboxId="lb"
      t={t}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const options = canvas.getAllByRole('option');
    expect(options.length).toBe(RECOVERY_ITEMS.length);
    // Recovery chips contain the suggestion titles
    expect(canvas.getByText('Frieren')).toBeTruthy();
    expect(canvas.getByText('Bleach')).toBeTruthy();
  },
};

export const SearchAllButton = {
  name: 'Search-all button — visible when query is non-empty',
  render: () => (
    <SearchAutocomplete
      isOpen
      groups={[]}
      flatItems={[]}
      query="Frieren"
      listboxId="lb"
      t={t}
      onSearchAll={fn()}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // Button text is built from the t('discover.autocompleteSearchFor') key
    const btn = canvas.getByText(/Search for "Frieren"/i);
    expect(btn).toBeTruthy();
  },
};

// ── Keyboard interaction stories ─────────────────────────────────────────────

export const KeyboardArrowNavigation = {
  name: 'Keyboard — ArrowDown/ArrowUp cycles through items',
  render: () => (
    <KeyboardHarness
      groups={GROUPS_WITH_TITLES}
      flatItems={TITLE_ITEMS}
      onSelect={fn()}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByTestId('search-input');

    // Initial state: no item highlighted
    let options = canvas.getAllByRole('option');
    options.forEach((opt) => expect(opt.getAttribute('aria-selected')).toBe('false'));

    // ArrowDown → first item highlighted
    await userEvent.type(input, '{ArrowDown}');
    options = canvas.getAllByRole('option');
    expect(options[0].getAttribute('aria-selected')).toBe('true');
    expect(options[1].getAttribute('aria-selected')).toBe('false');

    // ArrowDown again → second item
    await userEvent.type(input, '{ArrowDown}');
    options = canvas.getAllByRole('option');
    expect(options[0].getAttribute('aria-selected')).toBe('false');
    expect(options[1].getAttribute('aria-selected')).toBe('true');

    // ArrowUp → back to first item
    await userEvent.type(input, '{ArrowUp}');
    options = canvas.getAllByRole('option');
    expect(options[0].getAttribute('aria-selected')).toBe('true');
  },
};

export const KeyboardArrowWrap = {
  name: 'Keyboard — ArrowUp on first item wraps to last',
  render: () => (
    <KeyboardHarness
      groups={GROUPS_WITH_TITLES}
      flatItems={TITLE_ITEMS}
      onSelect={fn()}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByTestId('search-input');
    const total = TITLE_ITEMS.length;

    // ArrowUp from -1 (no selection) → should wrap to last
    await userEvent.type(input, '{ArrowUp}');
    const options = canvas.getAllByRole('option');
    expect(options[total - 1].getAttribute('aria-selected')).toBe('true');
  },
};

export const KeyboardHomeEnd = {
  name: 'Keyboard — Home/End jumps to first/last item',
  render: () => (
    <KeyboardHarness
      groups={GROUPS_WITH_TITLES}
      flatItems={TITLE_ITEMS}
      onSelect={fn()}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByTestId('search-input');
    const total = TITLE_ITEMS.length;

    // Navigate to middle first
    await userEvent.type(input, '{ArrowDown}{ArrowDown}');

    // Home → first
    await userEvent.type(input, '{Home}');
    let options = canvas.getAllByRole('option');
    expect(options[0].getAttribute('aria-selected')).toBe('true');

    // End → last
    await userEvent.type(input, '{End}');
    options = canvas.getAllByRole('option');
    expect(options[total - 1].getAttribute('aria-selected')).toBe('true');
  },
};

export const KeyboardEscapeCloses = {
  name: 'Keyboard — Escape closes the dropdown',
  render: () => (
    <KeyboardHarness
      groups={GROUPS_WITH_TITLES}
      flatItems={TITLE_ITEMS}
      onSelect={fn()}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByTestId('search-input');

    // Dropdown is open initially
    expect(canvas.getByRole('listbox')).toBeTruthy();

    // Escape → dropdown closes
    await userEvent.type(input, '{Escape}');
    expect(canvas.queryByRole('listbox')).toBeNull();
  },
};

export const ClickSelectCallsOnSelect = {
  name: 'Click — selecting an item calls onSelect',
  render: ({ onSelect }) => (
    <SearchAutocomplete
      isOpen
      groups={GROUPS_WITH_TITLES}
      flatItems={TITLE_ITEMS}
      highlightedIndex={-1}
      query="Frieren"
      listboxId="lb"
      t={t}
      onSelect={onSelect}
    />
  ),
  args: {
    onSelect: fn(),
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const options = canvas.getAllByRole('option');

    // Click the first suggestion's link
    const firstLink = within(options[0]).getByRole('link');
    await userEvent.click(firstLink);

    expect(args.onSelect).toHaveBeenCalledOnce();
    expect(args.onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ id: TITLE_ITEMS[0].id })
    );
  },
};

export const ClickRemoveRecentCallsOnRemoveRecent = {
  name: 'Click — remove button calls onRemoveRecent with entityId',
  render: ({ onRemoveRecent }) => (
    <SearchAutocomplete
      isOpen
      groups={GROUPS_RECENT_ONLY}
      flatItems={RECENT_ITEMS}
      highlightedIndex={-1}
      query=""
      listboxId="lb"
      t={t}
      onRemoveRecent={onRemoveRecent}
    />
  ),
  args: {
    onRemoveRecent: fn(),
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const removeButtons = canvas.getAllByRole('button', { name: /remove/i });

    await userEvent.click(removeButtons[0]);

    expect(args.onRemoveRecent).toHaveBeenCalledOnce();
    expect(args.onRemoveRecent).toHaveBeenCalledWith(RECENT_ITEMS[0].entityId);
  },
};

export const CrossLaneNote = {
  name: 'Cross-lane note — shown when titles missed but other lanes found results',
  render: () => (
    <SearchAutocomplete
      isOpen
      groups={[{ id: 'posts', labelKey: 'discover.scopePosts', items: [
        { id: 'post-1', kind: 'posts', title: 'My post about Frieren', href: '/feed?post=1', flatIndex: 0 }
      ]}]}
      flatItems={[{ id: 'post-1', kind: 'posts', title: 'My post about Frieren', href: '/feed?post=1', flatIndex: 0 }]}
      highlightedIndex={-1}
      query="Frieren"
      crossLaneNote={['posts']}
      listboxId="lb"
      t={t}
    />
  ),
  play: async ({ canvasElement }) => {
    // Cross-lane note should include the query and the lane name
    const note = canvasElement.querySelector('[aria-live="polite"]');
    expect(note).toBeTruthy();
    expect(note.textContent).toContain('Frieren');
  },
};
