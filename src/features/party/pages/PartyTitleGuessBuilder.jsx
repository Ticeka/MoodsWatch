import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Image as ImageIcon,
  LayoutGrid,
  Layers3,
  Loader2,
  Plus,
  Save,
  Search,
  Trash2,
} from 'lucide-react';
import { Button } from '@/shared/components/ui/Button';
import { SearchAutocomplete } from '@/shared/components/ui/SearchAutocomplete';
import { useLanguage } from '@/shared/contexts/LanguageContext';
import { useAgeGate } from '@/shared/contexts/AgeGateContext';
import { useAuth } from '@/features/auth/contexts/AuthContext';
import { listTitles } from '@/features/discover/lib/recommend';
import {
  createPartyTitleGuessSet,
  fetchPartyTitleGuessCharacters,
} from '@/features/party/lib/partyRemote';
import {
  clearPartyDraft,
  getPartyTitleGuessBuilderDraftKey,
  readPartyDraft,
  writePartyDraft,
} from '@/features/party/lib/partyDraftStorage';
import '../components/PartyTemplates.css';
import './Party.css';

const TITLE_GUESS_SLOT_POINTS = [400, 300, 200, 100];
const TITLE_GUESS_SLOT_COUNT = 4;
const TITLE_GUESS_SEARCH_LIMIT = 8;
const TITLE_GUESS_CHARACTER_PAGE_SIZE = 12;
const TITLE_GUESS_QUESTION_PAGE_SIZE = 6;
const titleGuessBuilderSearchCache = new Map();

function createEmptyCardSlots() {
  return Array.from({ length: TITLE_GUESS_SLOT_COUNT }, () => null);
}

function normalizeTitleGuessCardSlots(slots = []) {
  return Array.from({ length: TITLE_GUESS_SLOT_COUNT }, (_, index) => slots[index] || null);
}

function normalizeTitleGuessSearchValue(value = '') {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function getTitleGuessBuilderDisplayTitle(title = {}) {
  return String(
    title?.title_th
    || title?.title_en
    || title?.title_romaji
    || title?.title_native
    || title?.canonical_title
    || title?.slug
    || ''
  ).trim();
}

function buildTitleGuessSuggestionTitles(title = {}) {
  return [
    title?.title_th,
    title?.title_en,
    title?.title_romaji,
    title?.title_native,
    title?.canonical_title,
    ...(Array.isArray(title?.aliases) ? title.aliases : []),
  ]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .filter((value, index, collection) => (
      collection.findIndex((entry) => normalizeTitleGuessSearchValue(entry) === normalizeTitleGuessSearchValue(value)) === index
    ));
}

function getTitleGuessSuggestionDescription(title = {}) {
  const titles = buildTitleGuessSuggestionTitles(title);
  if (titles.length <= 1) {
    return '';
  }

  return titles.slice(1, 3).join(' • ');
}

function getTitleGuessBuilderSuggestionScore(title = {}, query = '') {
  const normalizedQuery = normalizeTitleGuessSearchValue(query);
  if (!normalizedQuery) {
    return 0;
  }

  const candidates = buildTitleGuessSuggestionTitles(title);
  let bestScore = -1;

  candidates.forEach((candidate, index) => {
    const normalizedCandidate = normalizeTitleGuessSearchValue(candidate);
    if (!normalizedCandidate) {
      return;
    }

    let score = 0;
    if (normalizedCandidate === normalizedQuery) {
      score = 5000 - index;
    } else if (normalizedCandidate.startsWith(normalizedQuery)) {
      score = 3000 - index;
    } else if (normalizedCandidate.includes(` ${normalizedQuery}`)) {
      score = 1800 - index;
    } else if (normalizedCandidate.includes(normalizedQuery)) {
      score = 1200 - index;
    }

    if (score > bestScore) {
      bestScore = score;
    }
  });

  return Math.max(bestScore, 0);
}

function sortTitleGuessBuilderSuggestions(items = [], query = '') {
  return [...(Array.isArray(items) ? items : [])].sort((left, right) => {
    const scoreDiff = getTitleGuessBuilderSuggestionScore(right, query) - getTitleGuessBuilderSuggestionScore(left, query);
    if (scoreDiff !== 0) {
      return scoreDiff;
    }

    const popularityDiff = Number(right?.popularity || 0) - Number(left?.popularity || 0);
    if (popularityDiff !== 0) {
      return popularityDiff;
    }

    return getTitleGuessBuilderDisplayTitle(left).localeCompare(getTitleGuessBuilderDisplayTitle(right));
  });
}

function getTitleGuessTypeLabel(type = '', pick) {
  switch (String(type || '').trim().toLowerCase()) {
    case 'anime':
      return pick('อนิเมะ', 'Anime');
    case 'manhwa':
      return pick('มันฮวา', 'Manhwa');
    case 'manga':
      return pick('มังงะ', 'Manga');
    default:
      return String(type || '').trim();
  }
}

function getTitleGuessBuilderMeta(title = {}, pick) {
  const parts = [
    getTitleGuessTypeLabel(title?.type, pick),
    title?.year || '',
  ].filter(Boolean);

  return parts.join(' • ');
}

function getTitleGuessCharacterLabel(character = {}) {
  return String(character?.name || character?.nativeName || '').trim();
}

function getTitleGuessCharacterMeta(character = {}, pick) {
  const role = String(character?.role || '').trim().toUpperCase();
  const roleLabel = role === 'BACKGROUND'
    ? pick('ตัวประกอบ', 'Background')
    : role === 'SUPPORTING'
      ? pick('ตัวรอง', 'Supporting')
      : role === 'MAIN'
        ? pick('ตัวหลักรอง', 'Main side')
        : pick('ตัวละคร', 'Character');
  return roleLabel;
}

function buildTitleGuessAnswerAliases(title = {}) {
  return buildTitleGuessSuggestionTitles(title);
}

function buildTitleGuessReturnUrl(basePath, params = {}) {
  const target = String(basePath || '/party').trim() || '/party';
  const separator = target.includes('?') ? '&' : '?';
  const query = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).trim()) {
      query.set(key, String(value));
    }
  });

  const nextQuery = query.toString();
  return nextQuery ? `${target}${separator}${nextQuery}` : target;
}

function buildPartyBuilderCreateUrl(params = {}) {
  const query = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).trim()) {
      query.set(key, String(value));
    }
  });

  const serialized = query.toString();
  return serialized ? `/party/templates/create?${serialized}` : '/party/templates/create';
}

function buildCreatorDisplayName(user = null) {
  return user?.profile?.name
    || user?.profile?.username
    || user?.user_metadata?.display_name
    || user?.user_metadata?.full_name
    || user?.user_metadata?.username
    || user?.email?.split('@')[0]
    || 'User';
}

function getNextOpenSlotIndex(slots = [], activeIndex = 0) {
  const nextOpenAfterCurrent = slots.findIndex((item, index) => index > activeIndex && !item);
  if (nextOpenAfterCurrent >= 0) {
    return nextOpenAfterCurrent;
  }

  const firstOpen = slots.findIndex((item) => !item);
  return firstOpen >= 0 ? firstOpen : activeIndex;
}

function buildPaginationItems(totalPages, currentPage) {
  return Array.from({ length: totalPages }, (_, index) => index + 1)
    .filter((pageNumber) => pageNumber === 1 || pageNumber === totalPages || Math.abs(pageNumber - currentPage) <= 2)
    .reduce((items, pageNumber, index, pages) => {
      if (index > 0 && pageNumber - pages[index - 1] > 1) {
        items.push('...');
      }
      items.push(pageNumber);
      return items;
    }, []);
}

export function PartyTitleGuessBuilderPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { pick, t } = useLanguage();
  const { showAdult } = useAgeGate();
  const { user } = useAuth();
  const returnTo = String(searchParams.get('returnTo') || '/party/templates').trim() || '/party/templates';
  const titleGuessDraftStorageKey = useMemo(() => getPartyTitleGuessBuilderDraftKey(), []);

  const [meta, setMeta] = useState({
    name: '',
    description: '',
    visibility: 'public',
  });
  const [draftQuestions, setDraftQuestions] = useState([]);
  const [titleQuery, setTitleQuery] = useState('');
  const [titleResults, setTitleResults] = useState([]);
  const [titleSearchLoading, setTitleSearchLoading] = useState(false);
  const [titleSearchError, setTitleSearchError] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [selectedTitle, setSelectedTitle] = useState(null);
  const [characterPool, setCharacterPool] = useState([]);
  const [characterFilter, setCharacterFilter] = useState('');
  const [characterLoading, setCharacterLoading] = useState(false);
  const [characterError, setCharacterError] = useState('');
  const [cardSlots, setCardSlots] = useState(createEmptyCardSlots);
  const [activeSlotIndex, setActiveSlotIndex] = useState(0);
  const [questionPage, setQuestionPage] = useState(1);
  const [characterPage, setCharacterPage] = useState(1);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const searchShellRef = useRef(null);
  const draftHydratedRef = useRef(false);
  const pendingComposerRestoreRef = useRef(null);

  const normalizedTitleQuery = normalizeTitleGuessSearchValue(titleQuery);
  const hasComposerDraft = Boolean(selectedTitle || cardSlots.some(Boolean));
  const titleAlreadyAdded = useMemo(
    () => draftQuestions.some((question) => question.answerTitleId === Number(selectedTitle?.id || 0)),
    [draftQuestions, selectedTitle?.id],
  );

  const suggestionItems = useMemo(
    () => titleResults.map((title) => ({
      id: `title-guess-builder-${title.id}`,
      entityId: title.id,
      title: getTitleGuessBuilderDisplayTitle(title),
      meta: getTitleGuessBuilderMeta(title, pick),
      description: getTitleGuessSuggestionDescription(title),
      thumbnailUrl: title.cover || '',
      selectOnly: true,
      entity: title,
    })),
    [pick, titleResults],
  );

  const suggestionGroups = useMemo(
    () => (
      suggestionItems.length > 0
        ? [{
          id: 'titles',
          items: suggestionItems.map((item, index) => ({
            ...item,
            flatIndex: index,
          })),
        }]
        : []
    ),
    [suggestionItems],
  );

  const isAutocompleteOpen = searchOpen
    && !titleSearchError
    && (titleSearchLoading || suggestionItems.length > 0 || normalizedTitleQuery.length >= 2);

  const filteredCharacters = useMemo(() => {
    const normalizedFilter = normalizeTitleGuessSearchValue(characterFilter);
    return characterPool.filter((character) => {
      if (!normalizedFilter) {
        return true;
      }

      return [
        character?.name,
        character?.nativeName,
        character?.guessNote,
      ]
        .map((value) => normalizeTitleGuessSearchValue(value))
        .some((value) => value.includes(normalizedFilter));
    });
  }, [characterFilter, characterPool]);

  const filledSlotCount = useMemo(
    () => cardSlots.filter(Boolean).length,
    [cardSlots],
  );
  const questionTotalPages = Math.max(1, Math.ceil(draftQuestions.length / TITLE_GUESS_QUESTION_PAGE_SIZE));
  const pagedQuestions = useMemo(() => {
    const start = (questionPage - 1) * TITLE_GUESS_QUESTION_PAGE_SIZE;
    return draftQuestions.slice(start, start + TITLE_GUESS_QUESTION_PAGE_SIZE);
  }, [draftQuestions, questionPage]);
  const characterTotalPages = Math.max(1, Math.ceil(filteredCharacters.length / TITLE_GUESS_CHARACTER_PAGE_SIZE));
  const pagedCharacters = useMemo(() => {
    const start = (characterPage - 1) * TITLE_GUESS_CHARACTER_PAGE_SIZE;
    return filteredCharacters.slice(start, start + TITLE_GUESS_CHARACTER_PAGE_SIZE);
  }, [characterPage, filteredCharacters]);
  const questionPaginationItems = useMemo(
    () => buildPaginationItems(questionTotalPages, questionPage),
    [questionPage, questionTotalPages],
  );
  const characterPaginationItems = useMemo(
    () => buildPaginationItems(characterTotalPages, characterPage),
    [characterPage, characterTotalPages],
  );
  const saveDisabled = saving || !user?.id || !meta.name.trim() || draftQuestions.length === 0;
  const canAddQuestion = Boolean(selectedTitle) && cardSlots.every(Boolean) && !titleAlreadyAdded;

  const resetComposer = useCallback(() => {
    pendingComposerRestoreRef.current = null;
    setSelectedTitle(null);
    setTitleQuery('');
    setTitleResults([]);
    setTitleSearchError('');
    setCharacterPool([]);
    setCharacterFilter('');
    setCharacterError('');
    setCardSlots(createEmptyCardSlots());
    setActiveSlotIndex(0);
    setCharacterPage(1);
    setSearchOpen(false);
    setHighlightedIndex(-1);
  }, []);

  useEffect(() => {
    if (draftHydratedRef.current) {
      return;
    }

    const draft = readPartyDraft(titleGuessDraftStorageKey);
    if (draft) {
      const restoredSelectedTitle = draft?.selectedTitle?.id ? draft.selectedTitle : null;
      const restoredCardSlots = normalizeTitleGuessCardSlots(draft.cardSlots);
      const restoredActiveSlotIndex = Math.min(
        Math.max(Number(draft.activeSlotIndex || 0), 0),
        TITLE_GUESS_SLOT_COUNT - 1,
      );

      setMeta((current) => ({
        ...current,
        ...draft.meta,
        visibility: draft?.meta?.visibility || current.visibility,
      }));
      setDraftQuestions(Array.isArray(draft.draftQuestions) ? draft.draftQuestions : []);
      setTitleQuery(String(draft.titleQuery || ''));
      setSelectedTitle(restoredSelectedTitle);
      setCharacterPool(Array.isArray(draft.characterPool) ? draft.characterPool : []);
      setCharacterFilter(String(draft.characterFilter || ''));
      setCardSlots(restoredCardSlots);
      setActiveSlotIndex(restoredActiveSlotIndex);
      setQuestionPage(Math.max(1, Number(draft.questionPage || 1)));
      setCharacterPage(Math.max(1, Number(draft.characterPage || 1)));

      pendingComposerRestoreRef.current = restoredSelectedTitle
        ? {
          titleId: Number(restoredSelectedTitle.id || 0),
          cardSlots: restoredCardSlots,
          activeSlotIndex: restoredActiveSlotIndex,
          characterPage: Math.max(1, Number(draft.characterPage || 1)),
          characterFilter: String(draft.characterFilter || ''),
        }
        : null;
    }

    draftHydratedRef.current = true;
  }, [titleGuessDraftStorageKey]);

  useEffect(() => {
    if (!draftHydratedRef.current) {
      return;
    }

    writePartyDraft(titleGuessDraftStorageKey, {
      meta,
      draftQuestions,
      titleQuery,
      selectedTitle,
      characterPool,
      characterFilter,
      cardSlots,
      activeSlotIndex,
      questionPage,
      characterPage,
    });
  }, [
    activeSlotIndex,
    cardSlots,
    characterFilter,
    characterPage,
    characterPool,
    draftQuestions,
    meta,
    questionPage,
    selectedTitle,
    titleGuessDraftStorageKey,
    titleQuery,
  ]);

  useEffect(() => {
    setQuestionPage((current) => Math.min(current, Math.max(1, Math.ceil(draftQuestions.length / TITLE_GUESS_QUESTION_PAGE_SIZE))));
  }, [draftQuestions.length]);

  useEffect(() => {
    setCharacterPage(1);
  }, [characterFilter, selectedTitle?.id]);

  useEffect(() => {
    setCharacterPage((current) => Math.min(current, Math.max(1, Math.ceil(filteredCharacters.length / TITLE_GUESS_CHARACTER_PAGE_SIZE))));
  }, [filteredCharacters.length]);

  useEffect(() => {
    if (normalizedTitleQuery.length < 2) {
      setTitleResults([]);
      setTitleSearchLoading(false);
      setTitleSearchError('');
      return undefined;
    }

    const cacheKey = normalizedTitleQuery.toLowerCase();
    const cachedResults = titleGuessBuilderSearchCache.get(cacheKey);
    if (cachedResults) {
      setTitleResults(cachedResults);
      setTitleSearchError('');
      setTitleSearchLoading(false);
      return undefined;
    }

    let cancelled = false;
    const timeoutId = window.setTimeout(() => {
      setTitleSearchLoading(true);
      setTitleSearchError('');

      listTitles({
        type: 'all',
        query: normalizedTitleQuery,
        sortBy: 'popularity',
        page: 1,
        pageSize: TITLE_GUESS_SEARCH_LIMIT,
        showAdult,
      })
        .then((result) => {
          if (cancelled) {
            return;
          }

          const items = sortTitleGuessBuilderSuggestions(
            Array.isArray(result?.items) ? result.items : [],
            normalizedTitleQuery,
          );
          titleGuessBuilderSearchCache.set(cacheKey, items);
          setTitleResults(items);
        })
        .catch(() => {
          if (cancelled) {
            return;
          }
          setTitleResults([]);
          setTitleSearchError(pick('โหลดรายชื่อเรื่องไม่สำเร็จ ลองพิมพ์ใหม่อีกครั้ง', 'Could not load title suggestions. Try again.'));
        })
        .finally(() => {
          if (!cancelled) {
            setTitleSearchLoading(false);
          }
        });
    }, 180);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [normalizedTitleQuery, pick, showAdult]);

  useEffect(() => {
    if (!isAutocompleteOpen) {
      return undefined;
    }

    const handleClickOutside = (event) => {
      if (searchShellRef.current && !searchShellRef.current.contains(event.target)) {
        setSearchOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isAutocompleteOpen]);

  useEffect(() => {
    setHighlightedIndex(-1);
  }, [normalizedTitleQuery]);

  useEffect(() => {
    if (!selectedTitle?.id) {
      pendingComposerRestoreRef.current = null;
      setCharacterPool([]);
      setCharacterLoading(false);
      setCharacterError('');
      return undefined;
    }

    let ignore = false;
    const pendingComposerRestore = pendingComposerRestoreRef.current;
    const shouldRestoreComposer = Number(pendingComposerRestore?.titleId || 0) === Number(selectedTitle.id || 0);
    setCharacterLoading(true);
    setCharacterError('');
    if (!shouldRestoreComposer) {
      setCharacterFilter('');
    }

    fetchPartyTitleGuessCharacters(selectedTitle.id)
      .then((characters) => {
        if (ignore) {
          return;
        }

        const eligibleCharacters = (Array.isArray(characters) ? characters : [])
          .filter((character) => (
            character?.id
            && character?.imageUrl
            && !character?.isPrimaryProtagonist
            && !character?.isGuessDisabled
          ))
          .sort((left, right) => {
            const priorityDiff = Number(right?.guessPriority || 0) - Number(left?.guessPriority || 0);
            if (priorityDiff !== 0) {
              return priorityDiff;
            }

            const sortOrderDiff = Number(left?.sortOrder || 0) - Number(right?.sortOrder || 0);
            if (sortOrderDiff !== 0) {
              return sortOrderDiff;
            }

            return getTitleGuessCharacterLabel(left).localeCompare(getTitleGuessCharacterLabel(right));
          });

        setCharacterPool(eligibleCharacters);
        if (shouldRestoreComposer) {
          const restoredSlots = normalizeTitleGuessCardSlots(pendingComposerRestore?.cardSlots).map((character) => {
            if (!character?.id) {
              return null;
            }

            return eligibleCharacters.find((item) => Number(item?.id || 0) === Number(character.id || 0)) || character;
          });
          const restoredActiveSlotIndex = Math.min(
            Math.max(Number(pendingComposerRestore?.activeSlotIndex || 0), 0),
            TITLE_GUESS_SLOT_COUNT - 1,
          );

          setCardSlots(restoredSlots);
          setActiveSlotIndex(
            restoredSlots[restoredActiveSlotIndex]
              ? getNextOpenSlotIndex(restoredSlots, restoredActiveSlotIndex)
              : restoredActiveSlotIndex
          );
          setCharacterPage(Math.max(1, Number(pendingComposerRestore?.characterPage || 1)));
          setCharacterFilter(String(pendingComposerRestore?.characterFilter || ''));
          pendingComposerRestoreRef.current = null;
          return;
        }

        setCardSlots(createEmptyCardSlots());
        setActiveSlotIndex(0);
        setCharacterPage(1);
      })
      .catch(() => {
        if (!ignore) {
          setCharacterPool([]);
          pendingComposerRestoreRef.current = null;
          setCharacterError(pick('โหลดตัวละครของเรื่องนี้ไม่สำเร็จ', 'Could not load characters for this title.'));
        }
      })
      .finally(() => {
        if (!ignore) {
          setCharacterLoading(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, [pick, selectedTitle?.id]);

  const handleTitleSelect = useCallback((title) => {
    if (!title?.id) {
      return;
    }

    pendingComposerRestoreRef.current = null;
    setCharacterPool([]);
    setCharacterError('');
    setCardSlots(createEmptyCardSlots());
    setActiveSlotIndex(0);
    setSelectedTitle(title);
    setTitleQuery(getTitleGuessBuilderDisplayTitle(title));
    setSearchOpen(false);
    setHighlightedIndex(-1);
  }, []);

  const handleSuggestionSelect = useCallback((item) => {
    handleTitleSelect(item?.entity || null);
  }, [handleTitleSelect]);

  const handleTitleInputKeyDown = useCallback((event) => {
    const hasSuggestions = suggestionItems.length > 0;

    if (event.key === 'Escape') {
      setSearchOpen(false);
      return;
    }

    if (!hasSuggestions) {
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setSearchOpen(true);
      setHighlightedIndex((current) => (current + 1) % suggestionItems.length);
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setSearchOpen(true);
      setHighlightedIndex((current) => (current <= 0 ? suggestionItems.length - 1 : current - 1));
      return;
    }

    if (event.key === 'Home') {
      event.preventDefault();
      setSearchOpen(true);
      setHighlightedIndex(0);
      return;
    }

    if (event.key === 'End') {
      event.preventDefault();
      setSearchOpen(true);
      setHighlightedIndex(suggestionItems.length - 1);
      return;
    }

    if (event.key === 'Enter' && highlightedIndex >= 0 && suggestionItems[highlightedIndex]) {
      event.preventDefault();
      handleSuggestionSelect(suggestionItems[highlightedIndex]);
    }
  }, [handleSuggestionSelect, highlightedIndex, suggestionItems]);

  const handleAssignCharacter = useCallback((character) => {
    if (!character?.id) {
      return;
    }

    const duplicateIndex = cardSlots.findIndex((item) => Number(item?.id || 0) === Number(character.id || 0));
    if (duplicateIndex >= 0 && duplicateIndex !== activeSlotIndex) {
      toast.error(pick('ตัวละครนี้ถูกใช้ในอีกการ์ดแล้ว', 'This character is already assigned to another card.'));
      return;
    }

    const nextSlots = [...cardSlots];
    nextSlots[activeSlotIndex] = character;
    setCardSlots(nextSlots);
    setActiveSlotIndex(getNextOpenSlotIndex(nextSlots, activeSlotIndex));
  }, [activeSlotIndex, cardSlots, pick]);

  const handleClearSlot = useCallback((slotIndex) => {
    setCardSlots((current) => current.map((item, index) => (index === slotIndex ? null : item)));
    setActiveSlotIndex(slotIndex);
  }, []);

  const handleAddQuestion = useCallback(() => {
    if (!selectedTitle?.id) {
      toast.error(pick('เลือกเรื่องก่อนเพิ่มคำถาม', 'Choose a title before adding a question.'));
      return;
    }

    if (!cardSlots.every(Boolean)) {
      toast.error(pick('ใส่ตัวละครให้ครบทั้ง 4 การ์ดก่อน', 'Fill all 4 cards before adding the question.'));
      return;
    }

    if (draftQuestions.some((question) => question.answerTitleId === Number(selectedTitle.id || 0))) {
      toast.error(pick('เรื่องนี้ถูกเพิ่มไว้แล้วในชุดคำถาม', 'This title is already in the set.'));
      return;
    }

    const nextQuestion = {
      id: `draft-title-guess-${selectedTitle.id}`,
      answerTitleId: Number(selectedTitle.id || 0),
      answerTitle: getTitleGuessBuilderDisplayTitle(selectedTitle),
      answerAliases: buildTitleGuessAnswerAliases(selectedTitle),
      coverUrl: String(selectedTitle.cover || '').trim(),
      meta: getTitleGuessBuilderMeta(selectedTitle, pick),
      clues: cardSlots.map((character, index) => ({
        ...character,
        clueOrder: index + 1,
      })),
    };

    setDraftQuestions((current) => [...current, nextQuestion]);
    setMeta((current) => (
      current.name.trim()
        ? current
        : {
          ...current,
          name: pick('ชุดทายชื่อเรื่องใหม่', 'New Guess the Title set'),
        }
    ));
    resetComposer();
    toast.success(pick('เพิ่มคำถามเข้า set แล้ว', 'Question added to the set.'));
  }, [cardSlots, draftQuestions, pick, resetComposer, selectedTitle]);

  const handleSave = useCallback(async () => {
    if (!user?.id) {
      navigate('/login');
      return;
    }

    if (!meta.name.trim()) {
      setSaveError(pick('ตั้งชื่อชุดคำถามก่อนบันทึก', 'Add a set name before saving.'));
      return;
    }

    if (draftQuestions.length === 0) {
      setSaveError(pick('เพิ่มคำถามอย่างน้อย 1 ข้อก่อนบันทึก', 'Add at least one question before saving.'));
      return;
    }

    setSaving(true);
    setSaveError('');

    try {
      const createdSet = await createPartyTitleGuessSet(
        {
          ownerUserId: user.id,
          name: meta.name.trim(),
          description: meta.description.trim(),
          visibility: meta.visibility,
          coverUrl: draftQuestions[0]?.coverUrl || '',
        },
        draftQuestions,
        buildCreatorDisplayName(user),
      );

      toast.success(pick('บันทึกชุดทายชื่อเรื่องเรียบร้อยแล้ว', 'Guess the Title set has been saved.'));
      clearPartyDraft(titleGuessDraftStorageKey);
      navigate(buildTitleGuessReturnUrl(returnTo, {
        titleGuessSetId: createdSet?.id,
        modeType: 'title-guess',
      }));
    } catch (error) {
      setSaveError(error?.message || pick('บันทึกชุดคำถามไม่สำเร็จ', 'Could not save the set.'));
    } finally {
      setSaving(false);
    }
  }, [draftQuestions, meta.description, meta.name, meta.visibility, navigate, pick, returnTo, titleGuessDraftStorageKey, user]);

  return (
    <div className="party-page is-hub">
      <div className="party-templates-page party-title-guess-builder-page">
        <section className="party-builder-mode-switch" aria-label={pick('เลือกรูปแบบการสร้าง', 'Choose what to create')}>
          <button
            type="button"
            className="party-builder-mode-switch-card"
            onClick={() => navigate(buildPartyBuilderCreateUrl({ returnTo }))}
          >
            <span className="party-builder-mode-switch-icon"><LayoutGrid size={18} /></span>
            <span className="party-builder-mode-switch-copy">
              <strong>{pick('ชุดเพลง', 'Song set')}</strong>
              <span>{pick('กลับไปสร้างชุดเพลงสำหรับ Music Quiz และ Vote Battle', 'Go back to building a song set for Music Quiz and Vote Battle')}</span>
            </span>
          </button>
          <button
            type="button"
            className="party-builder-mode-switch-card is-active"
            onClick={() => navigate(buildPartyBuilderCreateUrl({ mode: 'title-guess', returnTo }))}
          >
            <span className="party-builder-mode-switch-icon"><Layers3 size={18} /></span>
            <span className="party-builder-mode-switch-copy">
              <strong>{pick('ชุดทายชื่อเรื่อง', 'Guess the Title set')}</strong>
              <span>{pick('จัดชุดคำถามจากตัวละครสำหรับเล่นโหมดทายชื่อเรื่อง', 'Create a character-based question set for Guess the Title')}</span>
            </span>
          </button>
        </section>

        <button className="party-back-btn" onClick={() => navigate(returnTo, { replace: true })}>
          <ChevronLeft size={18} />
          {pick('ย้อนกลับ', 'Back')}
        </button>

        <header className="party-templates-header party-title-guess-builder-header">
          <div>
            <span className="party-kicker"><Layers3 size={16} />{pick('ทายชื่อเรื่อง', 'Guess the Title')}</span>
            <h1>{pick('สร้างชุดสำหรับโหมดทายชื่อเรื่อง', 'Create a set for Guess the Title')}</h1>
            <p>
              {pick(
                'เลือกเรื่อง แล้ววางตัวละครของเรื่องนั้นลงการ์ด 1-4 เพื่อให้ host ใช้ได้ทันทีใน party lobby เดิม',
                'Pick a title, drop characters from that title into cards 1-4, and use it right away in the party lobby.',
              )}
            </p>
          </div>
          <div className="party-title-guess-builder-steps" aria-label={pick('ขั้นตอนการสร้างชุด', 'Steps')}>
            <span>1. {pick('เลือกเรื่อง', 'Choose a title')}</span>
            <span>2. {pick('จัดคำใบ้', 'Arrange clues')}</span>
            <span>3. {pick('เพิ่มเข้าชุด', 'Add to set')}</span>
          </div>
        </header>

        <div className="party-title-guess-builder-grid">
          <section className="party-builder-panel--refresh party-title-guess-builder-shell party-title-guess-builder-shell--sidebar">
            <div className="party-title-guess-builder-shell-head">
              <div>
                <span className="party-title-guess-builder-kicker">{pick('ข้อมูลชุด', 'Set details')}</span>
                <h2>{pick('ตั้งค่าชุดก่อนบันทึก', 'Set up your set before saving')}</h2>
              </div>
              <span className="party-title-guess-builder-count">
                {draftQuestions.length} {pick('คำถาม', 'questions')}
              </span>
            </div>

            <div className="party-inline-fields party-title-guess-builder-meta-row">
              <label className="party-field party-title-guess-builder-meta-name">
                <span>{pick('ชื่อชุดคำถาม', 'Set name')}</span>
                <input
                  type="text"
                  value={meta.name}
                  onChange={(event) => setMeta((current) => ({ ...current, name: event.target.value }))}
                  placeholder={pick('เช่น Shonen Side Cast Vol.1', 'For example: Shonen Side Cast Vol.1')}
                  maxLength={80}
                />
              </label>

              <label className="party-field party-title-guess-builder-meta-visibility">
                <span>{pick('การมองเห็น', 'Visibility')}</span>
                <select
                  value={meta.visibility}
                  onChange={(event) => setMeta((current) => ({ ...current, visibility: event.target.value }))}
                >
                  <option value="public">{pick('สาธารณะ', 'Public')}</option>
                  <option value="unlisted">{pick('ซ่อนจากลิสต์', 'Unlisted')}</option>
                  <option value="private">{pick('ส่วนตัว', 'Private')}</option>
                </select>
              </label>
            </div>

            <label className="party-field party-title-guess-builder-meta-description">
              <span>{pick('คำอธิบาย', 'Description')}</span>
              <textarea
                rows={3}
                value={meta.description}
                onChange={(event) => setMeta((current) => ({ ...current, description: event.target.value }))}
                placeholder={pick('อธิบายธีมหรือระดับความยากของชุดนี้', 'Describe the vibe or difficulty of this set')}
                maxLength={240}
              />
              <small className="party-title-guess-builder-hint">
                {pick('ข้อความนี้จะแสดงใต้ชื่อชุดตอนโฮสต์เลือกใช้งานในห้อง', 'This description appears under the set name when a host chooses it in the room.')}
              </small>
            </label>

            {!user?.id ? (
              <div className="party-title-guess-builder-note is-warning">
                <AlertTriangle size={16} />
                <div>
                  <strong>{pick('เข้าสู่ระบบก่อนบันทึกชุด', 'Sign in to save this set')}</strong>
                  <p>{pick('คุณยังจัดชุดต่อได้ แต่จะบันทึกได้หลังเข้าสู่ระบบแล้วเท่านั้น', 'You can keep editing, but saving is available after signing in.')}</p>
                </div>
              </div>
            ) : null}

            <div className="party-title-guess-builder-question-list">
              <div className="party-title-guess-builder-section-head">
                <strong>{pick('คำถามในชุดนี้', 'Questions in this set')}</strong>
                <span>{pick('ตรวจสอบหรือลบข้อที่ไม่ต้องการก่อนบันทึก', 'Review or remove any question before saving')}</span>
              </div>

              {draftQuestions.length === 0 ? (
                <div className="party-title-guess-builder-empty">
                  <CheckCircle2 size={18} />
                  <p>{pick('ยังไม่มีคำถามในชุดนี้ เริ่มจากเลือกเรื่องแล้วจัดคำใบ้ 4 ใบทางด้านขวา', 'There are no questions yet. Start by choosing a title and arranging 4 clue cards on the right.')}</p>
                </div>
              ) : (
                <>
                  <div className="party-title-guess-builder-question-stack party-title-guess-builder-question-stack--scroll">
                  {pagedQuestions.map((question, index) => (
                    <article key={question.id} className="party-title-guess-builder-question-card">
                      <div className="party-title-guess-builder-question-copy">
                        <span>{pick(`ข้อ ${(questionPage - 1) * TITLE_GUESS_QUESTION_PAGE_SIZE + index + 1}`, `Question ${(questionPage - 1) * TITLE_GUESS_QUESTION_PAGE_SIZE + index + 1}`)}</span>
                        <strong>{question.answerTitle}</strong>
                        <p>{question.meta || pick('4 clues ready', '4 clues ready')}</p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDraftQuestions((current) => current.filter((item) => item.id !== question.id))}
                        icon={<Trash2 size={16} />}
                      >
                        {pick('ลบ', 'Remove')}
                      </Button>
                    </article>
                  ))}
                  </div>
                  {questionTotalPages > 1 ? (
                    <div className="party-templates-pagination party-title-guess-builder-pagination">
                      <button
                        type="button"
                        className="pt-page-btn"
                        onClick={() => setQuestionPage((current) => Math.max(1, current - 1))}
                        disabled={questionPage === 1}
                        aria-label={pick('หน้าก่อนหน้าของคำถาม', 'Previous questions page')}
                      >
                        <ChevronLeft size={16} />
                      </button>
                      {questionPaginationItems.map((item, index) => (
                        item === '...' ? (
                          <span key={`question-ellipsis-${index}`} className="pt-page-ellipsis">...</span>
                        ) : (
                          <button
                            key={`question-page-${item}`}
                            type="button"
                            className={`pt-page-btn ${item === questionPage ? 'is-active' : ''}`}
                            onClick={() => setQuestionPage(item)}
                          >
                            {item}
                          </button>
                        )
                      ))}
                      <button
                        type="button"
                        className="pt-page-btn"
                        onClick={() => setQuestionPage((current) => Math.min(questionTotalPages, current + 1))}
                        disabled={questionPage === questionTotalPages}
                        aria-label={pick('หน้าถัดไปของคำถาม', 'Next questions page')}
                      >
                        <ChevronRight size={16} />
                      </button>
                      <span className="pt-page-info">
                        {pick(`หน้า ${questionPage}/${questionTotalPages}`, `Page ${questionPage}/${questionTotalPages}`)}
                      </span>
                    </div>
                  ) : null}
                </>
              )}
            </div>

            {saveError ? (
              <div className="party-title-guess-builder-note is-error">
                <AlertTriangle size={16} />
                <div>
                  <strong>{pick('บันทึกไม่สำเร็จ', 'Could not save')}</strong>
                  <p>{saveError}</p>
                </div>
              </div>
            ) : null}

            <div className="party-title-guess-builder-actions">
              <Button
                variant="primary"
                onClick={handleSave}
                disabled={saveDisabled}
                icon={saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              >
                {saving ? pick('กำลังบันทึก...', 'Saving...') : pick('บันทึกชุดคำถาม', 'Save set')}
              </Button>
              <Button
                variant="outline"
                onClick={() => navigate(returnTo, { replace: true })}
              >
                {pick('กลับไปก่อน', 'Back to lobby')}
              </Button>
            </div>
          </section>

          <section className="party-builder-panel--refresh party-title-guess-builder-shell">
            <div className="party-title-guess-builder-shell-head">
              <div>
                <span className="party-title-guess-builder-kicker">{pick('คำถามปัจจุบัน', 'Current question')}</span>
                <h2>{pick('จัดคำถามทีละข้อ', 'Build one question at a time')}</h2>
              </div>
              <span className="party-title-guess-builder-count">
                {pick('การ์ด 1 เปิดก่อน', 'Card 1 reveals first')}
              </span>
            </div>

            <div className="party-title-guess-builder-top-grid">
            <div className="party-title-guess-builder-step party-title-guess-builder-step--title">
              <div className="party-title-guess-builder-section-head">
                <strong>{pick('1. เลือกเรื่อง', '1. Choose a title')}</strong>
                <span>{pick('ค้นหาชื่อเรื่องจากรายการในระบบแล้วเลือกเรื่องที่ต้องการ', 'Search the catalog and choose the title you want')}</span>
              </div>

              <div className="party-title-guess-builder-search" ref={searchShellRef}>
                <label className="party-title-guess-builder-search-label" htmlFor="party-title-guess-builder-search">
                  {pick('ชื่อเรื่อง', 'Title')}
                </label>
                <div className="party-title-guess-search-shell party-title-guess-builder-search-shell">
                  <div className="party-title-guess-search-box">
                    <Search size={18} className="party-title-guess-search-icon" />
                    <input
                      id="party-title-guess-builder-search"
                      type="search"
                      className="party-title-guess-search-input"
                      value={titleQuery}
                      onChange={(event) => {
                        setTitleQuery(event.target.value);
                        setSearchOpen(true);
                      }}
                      onFocus={() => setSearchOpen(true)}
                      onKeyDown={handleTitleInputKeyDown}
                      placeholder={pick('พิมพ์ชื่อเรื่องอย่างน้อย 2 ตัวอักษร', 'Type at least 2 characters to search')}
                      autoComplete="off"
                      spellCheck={false}
                      aria-expanded={isAutocompleteOpen}
                      aria-haspopup="listbox"
                      aria-controls="party-title-guess-builder-search-listbox"
                    />
                  </div>

                  <SearchAutocomplete
                    groups={suggestionGroups}
                    flatItems={suggestionItems}
                    isLoading={titleSearchLoading}
                    isOpen={isAutocompleteOpen}
                    highlightedIndex={highlightedIndex}
                    query={titleQuery}
                    variant="compact"
                    listboxId="party-title-guess-builder-search-listbox"
                    t={t}
                    onSelect={handleSuggestionSelect}
                    onSearchAll={() => {
                      if (suggestionItems[0]) {
                        handleSuggestionSelect(suggestionItems[0]);
                      }
                    }}
                  />
                </div>
                <small className={`party-title-guess-search-note${titleSearchError ? ' is-error' : ''}`}>
                  {titleSearchError || pick('เลือกจากรายการเพื่อให้คำตอบตรงกับชื่อเรื่องในระบบ', 'Choose from the list so the answer matches the catalog title.')}
                </small>
              </div>

              {selectedTitle ? (
                <div className="party-title-guess-builder-selected-title">
                  <div className="party-title-guess-builder-selected-cover">
                    {selectedTitle.cover ? (
                      <img src={selectedTitle.cover} alt="" loading="lazy" />
                    ) : (
                      <div className="party-title-guess-builder-cover-fallback">
                        <ImageIcon size={20} />
                      </div>
                    )}
                  </div>
                  <div className="party-title-guess-builder-selected-copy">
                    <strong>{getTitleGuessBuilderDisplayTitle(selectedTitle)}</strong>
                    <span>{getTitleGuessBuilderMeta(selectedTitle, pick) || pick('พร้อมให้เลือกตัวละคร', 'Ready to pick characters')}</span>
                    {titleAlreadyAdded ? (
                      <p>{pick('เรื่องนี้ถูกเพิ่มไว้แล้วใน set ด้านซ้าย', 'This title is already in the set on the left.')}</p>
                    ) : (
                      <p>{pick('แสดงเฉพาะตัวละครของเรื่องนี้ และตัดพระเอกออกจากลิสต์ให้แล้ว', 'Only characters from this title are shown, with protagonists already filtered out.')}</p>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={resetComposer}
                  >
                    {pick('เปลี่ยนเรื่อง', 'Change title')}
                  </Button>
                </div>
              ) : null}
            </div>

            <div className="party-title-guess-builder-step party-title-guess-builder-step--slots">
              <div className="party-title-guess-builder-section-head">
                <strong>{pick('2. วางตัวละครลงการ์ด 1-4', '2. Place characters into cards 1-4')}</strong>
                <span>{pick(`เลือกการ์ดที่ active อยู่ตอนนี้ แล้วใส่ตัวละครให้ครบ ${filledSlotCount}/4`, `Pick the active card and fill all 4 slots (${filledSlotCount}/4)` )}</span>
              </div>

              <div className="party-title-guess-builder-slot-grid">
                {cardSlots.map((character, index) => {
                  const isActive = activeSlotIndex === index;
                  return (
                    <article
                      key={`slot-${index + 1}`}
                      className={`party-title-guess-builder-slot${isActive ? ' is-active' : ''}${character ? ' is-filled' : ''}`}
                      role="button"
                      tabIndex={0}
                      onClick={() => setActiveSlotIndex(index)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          setActiveSlotIndex(index);
                        }
                      }}
                    >
                      <span className="party-title-guess-builder-slot-top">
                        <span>{pick(`ใบ ${index + 1}`, `Card ${index + 1}`)}</span>
                        <strong>{TITLE_GUESS_SLOT_POINTS[index]} pts</strong>
                      </span>

                      {character ? (
                        <div className="party-title-guess-builder-slot-body">
                          <div className="party-title-guess-builder-slot-media">
                            <img src={character.imageUrl} alt={getTitleGuessCharacterLabel(character)} loading="lazy" />
                          </div>
                          <div className="party-title-guess-builder-slot-copy">
                            <strong>{getTitleGuessCharacterLabel(character)}</strong>
                            <span>{getTitleGuessCharacterMeta(character, pick)}</span>
                          </div>
                          <button
                            type="button"
                            className="party-title-guess-builder-slot-clear"
                            onClick={(event) => {
                              event.stopPropagation();
                              handleClearSlot(index);
                            }}
                            aria-label={pick(`ลบการ์ดใบ ${index + 1}`, `Clear card ${index + 1}`)}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ) : (
                        <div className="party-title-guess-builder-slot-empty">
                          <Plus size={18} />
                          <span>{pick('เลือกตัวละครสำหรับการ์ดนี้', 'Choose a character for this card')}</span>
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            </div>
            </div>

            <div className="party-title-guess-builder-step">
              <div className="party-title-guess-builder-section-head">
                <strong>{pick('3. เลือกตัวละครจากเรื่องนี้', '3. Pick characters from this title')}</strong>
                <span>{pick('คลิกตัวละครเพื่อใส่ลงการ์ดที่กำลังเลือกอยู่ และสลับหน้าได้ถ้ารายการยาว', 'Click a character to place them into the active card, then page through long lists')}</span>
              </div>

              <label className="party-field">
                <span>{pick('ค้นหาตัวละคร', 'Filter characters')}</span>
                <input
                  type="search"
                  value={characterFilter}
                  onChange={(event) => setCharacterFilter(event.target.value)}
                  placeholder={pick('ค้นหาจากชื่อตัวละคร', 'Filter by character name')}
                  disabled={!selectedTitle || characterLoading || characterPool.length === 0}
                />
              </label>

              {characterLoading ? (
                <div className="party-title-guess-builder-state">
                  <Loader2 size={18} className="animate-spin" />
                  <p>{pick('กำลังโหลดตัวละครของเรื่องนี้...', 'Loading characters for this title...')}</p>
                </div>
              ) : characterError ? (
                <div className="party-title-guess-builder-state is-error">
                  <AlertTriangle size={18} />
                  <p>{characterError}</p>
                </div>
              ) : !selectedTitle ? (
                <div className="party-title-guess-builder-state">
                  <Layers3 size={18} />
                  <p>{pick('เลือกเรื่องก่อน แล้วรายการตัวละครจะขึ้นตรงนี้', 'Choose a title first, then the character list will appear here.')}</p>
                </div>
              ) : filteredCharacters.length === 0 ? (
                <div className="party-title-guess-builder-state">
                  <ImageIcon size={18} />
                  <p>{pick('ไม่พบตัวละครที่ใช้ได้ ลองเปลี่ยนเรื่องหรือเคลียร์ตัวกรอง', 'No eligible characters were found. Try another title or clear the filter.')}</p>
                </div>
              ) : (
                <>
                  <div className="party-title-guess-builder-pagination-summary">
                    <span>{pick(`${filteredCharacters.length} ตัวละครที่ใช้ได้`, `${filteredCharacters.length} eligible characters`)}</span>
                    {characterTotalPages > 1 ? (
                      <span>{pick(`หน้า ${characterPage}/${characterTotalPages}`, `Page ${characterPage}/${characterTotalPages}`)}</span>
                    ) : null}
                  </div>
                  <div className="party-title-guess-builder-character-grid">
                  {pagedCharacters.map((character) => {
                    const assignedIndex = cardSlots.findIndex((item) => Number(item?.id || 0) === Number(character.id || 0));
                    const isAssignedElsewhere = assignedIndex >= 0 && assignedIndex !== activeSlotIndex;
                    return (
                      <button
                        key={character.id}
                        type="button"
                        className={`party-title-guess-builder-character${assignedIndex >= 0 ? ' is-picked' : ''}`}
                        onClick={() => handleAssignCharacter(character)}
                        disabled={isAssignedElsewhere}
                      >
                        <div className="party-title-guess-builder-character-media">
                          <img src={character.imageUrl} alt={getTitleGuessCharacterLabel(character)} loading="lazy" />
                        </div>
                        <div className="party-title-guess-builder-character-copy">
                          <strong>{getTitleGuessCharacterLabel(character)}</strong>
                          <span>{getTitleGuessCharacterMeta(character, pick)}</span>
                        </div>
                        {assignedIndex >= 0 ? (
                          <span className="party-title-guess-builder-character-badge">
                            {pick(`ใบ ${assignedIndex + 1}`, `Card ${assignedIndex + 1}`)}
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                  </div>
                  {characterTotalPages > 1 ? (
                    <div className="party-templates-pagination party-title-guess-builder-pagination">
                      <button
                        type="button"
                        className="pt-page-btn"
                        onClick={() => setCharacterPage((current) => Math.max(1, current - 1))}
                        disabled={characterPage === 1}
                        aria-label={pick('หน้าก่อนหน้าของตัวละคร', 'Previous characters page')}
                      >
                        <ChevronLeft size={16} />
                      </button>
                      {characterPaginationItems.map((item, index) => (
                        item === '...' ? (
                          <span key={`character-ellipsis-${index}`} className="pt-page-ellipsis">...</span>
                        ) : (
                          <button
                            key={`character-page-${item}`}
                            type="button"
                            className={`pt-page-btn ${item === characterPage ? 'is-active' : ''}`}
                            onClick={() => setCharacterPage(item)}
                          >
                            {item}
                          </button>
                        )
                      ))}
                      <button
                        type="button"
                        className="pt-page-btn"
                        onClick={() => setCharacterPage((current) => Math.min(characterTotalPages, current + 1))}
                        disabled={characterPage === characterTotalPages}
                        aria-label={pick('หน้าถัดไปของตัวละคร', 'Next characters page')}
                      >
                        <ChevronRight size={16} />
                      </button>
                    </div>
                  ) : null}
                </>
              )}
            </div>

            <div className="party-title-guess-builder-footer">
              <div className="party-title-guess-builder-footer-copy">
                <strong>
                  {selectedTitle
                    ? getTitleGuessBuilderDisplayTitle(selectedTitle)
                    : pick('ข้อปัจจุบันยังไม่เลือกเรื่อง', 'No title selected yet')}
                </strong>
                <span>
                  {hasComposerDraft
                    ? pick(`การ์ดพร้อมแล้ว ${filledSlotCount}/4 ใบ`, `${filledSlotCount}/4 cards ready`)
                    : pick('เริ่มจากเลือกเรื่องแล้วค่อยจัด 4 การ์ด', 'Start by choosing a title, then fill the 4 cards')}
                </span>
              </div>
              <div className="party-title-guess-builder-footer-actions">
                <Button
                  variant="outline"
                  onClick={resetComposer}
                  disabled={!hasComposerDraft}
                >
                  {pick('ล้างข้อปัจจุบัน', 'Reset current question')}
                </Button>
                <Button
                  variant="primary"
                  onClick={handleAddQuestion}
                  disabled={!canAddQuestion}
                  icon={<Plus size={16} />}
                >
                  {pick('เพิ่มคำถาม', 'Add question')}
                </Button>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
