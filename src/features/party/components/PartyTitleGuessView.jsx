import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CheckCircle2,
  Clock3,
  Crown,
  Layers3,
  Lock,
  Loader2,
  Search,
  Sparkles,
  Trophy,
  Users2,
  Zap,
} from 'lucide-react';
import { Button } from '@/shared/components/ui/Button';
import { SearchAutocomplete } from '@/shared/components/ui/SearchAutocomplete';
import { listTitles } from '@/features/discover/lib/recommend';
import { useAgeGate } from '@/shared/contexts/AgeGateContext';
import {
  PartyCountdownDisplay,
  PartyEndCountdownOverlay,
  PartyIdentityAvatar,
  PartyLeaderboard,
} from '@/features/party/components/PartyRoomShared';

const TITLE_GUESS_CARD_POINTS = [400, 300, 200, 100];
const TITLE_GUESS_SUGGESTION_LIMIT = 6;
const titleGuessSearchCache = new Map();

function clampTitleGuessStep(step) {
  return Math.max(1, Math.min(4, Number(step || 1)));
}

function getTitleGuessClueName(clue = {}) {
  return String(
    clue?.characterName
    ?? clue?.character_name_snapshot
    ?? ''
  ).trim();
}

function getTitleGuessClueImageUrl(clue = {}) {
  return String(
    clue?.characterImageUrl
    ?? clue?.character_image_url_snapshot
    ?? clue?.image_url
    ?? ''
  ).trim();
}

function getTitleGuessDisplayTitle(title = {}) {
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

function getTitleGuessAnswerDisplayLabel(title = {}) {
  return String(
    title?.franchise_name
    || getTitleGuessDisplayTitle(title)
    || ''
  ).trim();
}

function getTitleGuessSuggestionIdentity(title = {}) {
  const franchiseName = String(title?.franchise_name || '').trim();
  if (franchiseName) {
    return `franchise:${normalizeTitleGuessSearchValue(franchiseName)}`;
  }

  const titleLabel = getTitleGuessDisplayTitle(title);
  if (titleLabel) {
    return `title:${normalizeTitleGuessSearchValue(titleLabel)}`;
  }

  return `id:${String(title?.id || '')}`;
}

function getTitleGuessSuggestionMeta(title = {}, pick) {
  const parts = [
    title?.type ? pick(title.type === 'anime' ? 'อนิเมะ' : title.type, title.type) : '',
    title?.year || '',
  ].filter(Boolean);

  return parts.join(' • ');
}

function normalizeTitleGuessSearchValue(value = '') {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function buildTitleGuessSuggestionTitles(title = {}) {
  return [
    title?.title_th,
    title?.title_en,
    title?.title_romaji,
    title?.title_native,
    title?.canonical_title,
    title?.slug,
  ]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .filter((value, index, collection) => collection.findIndex((entry) => normalizeTitleGuessSearchValue(entry) === normalizeTitleGuessSearchValue(value)) === index);
}

function getTitleGuessSuggestionDescription(title = {}) {
  const titles = buildTitleGuessSuggestionTitles(title);
  if (titles.length <= 1) {
    return '';
  }
  return titles.slice(1, 3).join(' • ');
}

function getTitleGuessSuggestionScore(title = {}, query = '') {
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

function sortTitleGuessSuggestions(items = [], query = '') {
  return [...(Array.isArray(items) ? items : [])].sort((left, right) => {
    const scoreDiff = getTitleGuessSuggestionScore(right, query) - getTitleGuessSuggestionScore(left, query);
    if (scoreDiff !== 0) {
      return scoreDiff;
    }

    const popularityDiff = Number(right?.popularity || 0) - Number(left?.popularity || 0);
    if (popularityDiff !== 0) {
      return popularityDiff;
    }

    return getTitleGuessDisplayTitle(left).localeCompare(getTitleGuessDisplayTitle(right));
  });
}

function getTitleGuessPointsForStep(step) {
  const index = clampTitleGuessStep(step) - 1;
  return TITLE_GUESS_CARD_POINTS[index] || TITLE_GUESS_CARD_POINTS[TITLE_GUESS_CARD_POINTS.length - 1];
}

function inferTitleGuessClueStepFromAnswer(answer) {
  if (!answer?.title_correct) {
    return null;
  }

  const points = Number(answer.points_awarded || 0);
  if (points >= 400) {
    return 1;
  }
  if (points >= 300) {
    return 2;
  }
  if (points >= 200) {
    return 3;
  }
  if (points >= 100) {
    return 4;
  }
  return null;
}

function TitleGuessClueCard({
  clue,
  clueIndex,
  revealed = false,
  current = false,
  pick,
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const clueImageUrl = getTitleGuessClueImageUrl(clue);
  const clueName = getTitleGuessClueName(clue);

  useEffect(() => {
    setImageFailed(false);
  }, [clueImageUrl]);

  const label = pick('ใบ', 'Clue');
  const hasImage = Boolean(clueImageUrl) && !imageFailed;

  if (!revealed) {
    return (
      <article className={`party-title-guess-card is-locked${current ? ' is-current' : ''}`}>
        <div className="party-title-guess-card-shell">
          <span className="party-title-guess-card-order">{label} {clueIndex + 1}</span>
          <strong>{pick('ยังไม่เปิด', 'Locked')}</strong>
          <span className="party-title-guess-card-points">{getTitleGuessPointsForStep(clueIndex + 1)} pts</span>
        </div>
      </article>
    );
  }

  return (
    <article className={`party-title-guess-card is-revealed${current ? ' is-current' : ''}`}>
      <div className="party-title-guess-card-shell">
        <div className="party-title-guess-card-media">
          {hasImage ? (
            <img
              src={clueImageUrl}
              alt={pick(`คำใบ้ภาพใบที่ ${clueIndex + 1}`, `Clue image ${clueIndex + 1}`)}
              loading="lazy"
              onError={() => setImageFailed(true)}
            />
          ) : (
            <div className="party-title-guess-card-fallback" aria-hidden="true">
              <span>{clueIndex + 1}</span>
            </div>
          )}
          <div className="party-title-guess-card-overlay" />
          <div className="party-title-guess-card-badges">
            <span className="party-title-guess-card-order">{label} {clueIndex + 1}</span>
            <span className="party-title-guess-card-points">{getTitleGuessPointsForStep(clueIndex + 1)} pts</span>
          </div>
        </div>
        <span className="party-sr-only">{clueName || pick('คำใบ้ตัวละคร', 'Character clue')}</span>
      </div>
    </article>
  );
}

export const PartyTitleGuessQuestionStage = React.memo(function PartyTitleGuessQuestionStage({
  room,
  member,
  round,
  answer,
  answerCount,
  leaderboard,
  phaseEndsAtMs,
  onSubmit,
  submitting,
  pick,
}) {
  const { showAdult } = useAgeGate();
  const [typedTitle, setTypedTitle] = useState(() => answer?.typed_title || '');
  const [titleSuggestions, setTitleSuggestions] = useState([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [suggestionsError, setSuggestionsError] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [highlightedSuggestionIndex, setHighlightedSuggestionIndex] = useState(-1);
  const [pendingAnswerMetadata, setPendingAnswerMetadata] = useState({
    selectedTitleId: null,
    selectedFranchiseAnswerKey: '',
  });
  const [frozenLeaderboard, setFrozenLeaderboard] = useState(() => leaderboard);
  const lastRoundIdRef = useRef(round?.id);
  const searchShellRef = useRef(null);
  const revealedClueCount = clampTitleGuessStep(room?.current_match?.revealedClueCount || 1);
  const revealedCards = Array.isArray(round?.clues) ? round.clues.slice(0, 4) : [];
  const currentPoints = getTitleGuessPointsForStep(revealedClueCount);
  const lockedAnswer = String(answer?.typed_title || '').trim();
  const lockedSelectedOptionId = String(answer?.selected_option_id || '').trim();
  const selectedOption = (round?.options || []).find((option) => option.id === lockedSelectedOptionId) || null;
  const isChoiceMode = Boolean(round?.options?.length);
  const isAnswered = Boolean(lockedAnswer);
  const normalizedTypedTitle = String(typedTitle || '').trim();
  const shouldShowSuggestions = !isChoiceMode && !isAnswered && normalizedTypedTitle.length >= 2;
  const rawSuggestionItems = useMemo(
    () => {
      const items = Array.isArray(titleSuggestions) ? titleSuggestions : [];
      const seen = new Set();
      const deduped = [];

      items.forEach((item) => {
        const identity = getTitleGuessSuggestionIdentity(item);
        if (!identity || seen.has(identity)) {
          return;
        }
        seen.add(identity);
        deduped.push(item);
      });

      return deduped.slice(0, TITLE_GUESS_SUGGESTION_LIMIT);
    },
    [titleSuggestions]
  );
  const listboxId = useMemo(
    () => `party-title-guess-listbox-${String(round?.id || room?.id || 'current').replace(/[^a-zA-Z0-9_-]/g, '')}`,
    [room?.id, round?.id]
  );
  const autocompleteT = useCallback((key, vars = {}) => {
    switch (key) {
      case 'discover.autocompleteLabel':
        return pick('คำแนะนำชื่อเรื่องจากเว็บ', 'Title suggestions from the website');
      case 'discover.autocompleteSearching':
        return pick('กำลังค้นชื่อเรื่องจากเว็บ...', 'Searching titles from the catalog...');
      case 'discover.autocompleteNoResults':
        return pick('ยังไม่เจอชื่อเรื่องใกล้เคียง ลองพิมพ์ต่อหรือใช้ชื่อ alias อื่น', 'No close title suggestions yet. Keep typing or use another alias.');
      case 'discover.autocompleteSearchFor':
        return pick(`เลือก "${vars?.query || ''}" มาใส่`, `Use "${vars?.query || ''}"`);
      case 'discover.scopeTitles':
        return pick('ชื่อเรื่อง', 'Titles');
      default:
        return '';
    }
  }, [pick]);
  const suggestionItems = useMemo(
    () => rawSuggestionItems.map((item, index) => {
      const displayTitle = getTitleGuessDisplayTitle(item);
      const answerDisplayLabel = getTitleGuessAnswerDisplayLabel(item);
      return {
        id: `party-title-guess-option-${item?.id || index}`,
        entityId: item?.id || `title-${index}`,
        groupId: 'titles',
        title: answerDisplayLabel,
        meta: getTitleGuessSuggestionMeta(item, pick),
        description: getTitleGuessSuggestionDescription(item),
        thumbnailUrl: item?.cover || '',
        searchTerm: answerDisplayLabel,
        answerValue: answerDisplayLabel,
        fallbackAnswerValue: displayTitle,
        sourceTitleId: item?.id || null,
        franchiseAnswerKey: item?.franchise_name
          ? `franchise:${normalizeTitleGuessSearchValue(item.franchise_name)}`
          : '',
        selectOnly: true,
      };
    }),
    [pick, rawSuggestionItems]
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
    [suggestionItems]
  );
  const isAutocompleteOpen = !isAnswered
    && searchOpen
    && shouldShowSuggestions
    && !suggestionsError
    && (suggestionItems.length > 0 || suggestionsLoading || normalizedTypedTitle.length >= 2);

  useEffect(() => {
    setTypedTitle(answer?.typed_title || '');
    setPendingAnswerMetadata({
      selectedTitleId: null,
      selectedFranchiseAnswerKey: '',
    });
  }, [answer?.typed_title, round?.id]);

  useEffect(() => {
    setTitleSuggestions([]);
    setSuggestionsError('');
    setSuggestionsLoading(false);
    setSearchOpen(false);
    setHighlightedSuggestionIndex(-1);
    setPendingAnswerMetadata({
      selectedTitleId: null,
      selectedFranchiseAnswerKey: '',
    });
  }, [round?.id]);

  useEffect(() => {
    if (round?.id !== lastRoundIdRef.current) {
      lastRoundIdRef.current = round?.id;
      setFrozenLeaderboard(leaderboard);
    }
  }, [leaderboard, round?.id]);

  useEffect(() => {
    if (!shouldShowSuggestions) {
      setTitleSuggestions([]);
      setSuggestionsError('');
      setSuggestionsLoading(false);
      return undefined;
    }

    const cacheKey = normalizedTypedTitle.toLowerCase();
    const cached = titleGuessSearchCache.get(cacheKey);
    if (cached) {
      setTitleSuggestions(cached);
      setSuggestionsError('');
      setSuggestionsLoading(false);
      return undefined;
    }

    let cancelled = false;
    const timeoutId = window.setTimeout(() => {
      setSuggestionsLoading(true);
      setSuggestionsError('');

      listTitles({
        type: 'anime',
        query: normalizedTypedTitle,
        sortBy: 'popularity',
        page: 1,
        pageSize: TITLE_GUESS_SUGGESTION_LIMIT,
        showAdult,
      })
        .then((result) => {
          if (cancelled) {
            return;
          }

          const items = sortTitleGuessSuggestions(
            Array.isArray(result?.items) ? result.items : [],
            normalizedTypedTitle,
          );
          titleGuessSearchCache.set(cacheKey, items);
          setTitleSuggestions(items);
        })
        .catch(() => {
          if (cancelled) {
            return;
          }

          setTitleSuggestions([]);
          setSuggestionsError(pick('โหลดชื่อเรื่องไม่สำเร็จ ลองพิมพ์ต่อได้ตามปกติ', 'Could not load title suggestions. You can still type manually.'));
        })
        .finally(() => {
          if (!cancelled) {
            setSuggestionsLoading(false);
          }
        });
    }, 180);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [normalizedTypedTitle, pick, shouldShowSuggestions, showAdult]);

  useEffect(() => {
    if (!searchOpen) {
      setHighlightedSuggestionIndex(-1);
    }
  }, [searchOpen]);

  useEffect(() => {
    setHighlightedSuggestionIndex(-1);
  }, [normalizedTypedTitle, round?.id]);

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

  const handleCommitAnswer = useCallback((value, metadata = {}) => {
    const nextTitle = String(value || '').trim();
    if (!nextTitle || submitting || isAnswered) {
      return;
    }

    setTypedTitle(nextTitle);
    setSearchOpen(false);
    setHighlightedSuggestionIndex(-1);
    onSubmit({
      typedTitle: nextTitle,
      selectedTitleId: Number((metadata?.selectedTitleId ?? metadata?.sourceTitleId) || 0) || null,
      selectedFranchiseAnswerKey: String((metadata?.selectedFranchiseAnswerKey ?? metadata?.franchiseAnswerKey) || '').trim(),
    });
  }, [isAnswered, onSubmit, submitting]);

  const handleStageAnswer = useCallback((value, metadata = {}) => {
    const nextTitle = String(value || '').trim();
    if (!nextTitle || submitting || isAnswered) {
      return;
    }

    setTypedTitle(nextTitle);
    setPendingAnswerMetadata({
      selectedTitleId: Number(metadata?.sourceTitleId || 0) || null,
      selectedFranchiseAnswerKey: String(metadata?.franchiseAnswerKey || '').trim(),
    });
    setSearchOpen(false);
    setHighlightedSuggestionIndex(-1);
  }, [isAnswered, submitting]);

  const handleSuggestionSelect = useCallback((item = null) => {
    const nextTitle = String(item?.answerValue || item?.searchTerm || item?.title || '').trim();
    if (!nextTitle) {
      return;
    }

    handleStageAnswer(nextTitle, {
      sourceTitleId: item?.sourceTitleId,
      franchiseAnswerKey: item?.franchiseAnswerKey,
    });
  }, [handleStageAnswer]);

  const handleSearchSubmit = useCallback((event) => {
    event.preventDefault();
    handleCommitAnswer(typedTitle, pendingAnswerMetadata);
  }, [handleCommitAnswer, pendingAnswerMetadata, typedTitle]);

  const handleSearchInputKeyDown = useCallback((event) => {
    const hasSuggestions = suggestionItems.length > 0;

    if (event.key === 'Escape') {
      setSearchOpen(false);
      return;
    }

    if (!hasSuggestions) {
      if (event.key === 'Enter') {
        event.preventDefault();
        setSearchOpen(false);
      }
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setSearchOpen(true);
      setHighlightedSuggestionIndex((current) => (current + 1) % suggestionItems.length);
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setSearchOpen(true);
      setHighlightedSuggestionIndex((current) => (current <= 0 ? suggestionItems.length - 1 : current - 1));
      return;
    }

    if (event.key === 'Home') {
      event.preventDefault();
      setSearchOpen(true);
      setHighlightedSuggestionIndex(0);
      return;
    }

    if (event.key === 'End') {
      event.preventDefault();
      setSearchOpen(true);
      setHighlightedSuggestionIndex(suggestionItems.length - 1);
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      if (highlightedSuggestionIndex >= 0 && suggestionItems[highlightedSuggestionIndex]) {
        handleSuggestionSelect(suggestionItems[highlightedSuggestionIndex]);
        return;
      }
      setSearchOpen(false);
    }
  }, [handleSuggestionSelect, highlightedSuggestionIndex, suggestionItems]);

  return (
    <div className="party-answer-layout party-title-guess-layout">
      <div className="party-status-bar">
        <PartyCountdownDisplay targetTimeMs={phaseEndsAtMs}>
          {({ msLeft, secondsLeft }) => (
            <span className={`party-chip${secondsLeft <= 3 ? ' success' : ''}`}>
              <Clock3 size={14} />
              {pick('เหลือเวลา', 'Time left')} {Math.max(0, Math.ceil(msLeft / 1000))}
            </span>
          )}
        </PartyCountdownDisplay>
        <span className="party-chip subtle">
          <Sparkles size={14} />
          {pick('รอบ', 'Round')} {Number(room?.current_match?.roundIndex || 0) + 1}/{room?.current_match?.totalRounds || 0}
        </span>
        <span className="party-chip subtle">
          <Users2 size={14} />
          {pick('ตอบแล้ว', 'Answered')} {answerCount}
        </span>
        <span className="party-chip subtle">
          <Zap size={14} />
          {pick('ตอบตอนนี้ได้', 'Worth now')} {currentPoints}
        </span>
      </div>

      <div className="party-game-grid">
        <div className="party-game-main">
          <section className="party-title-guess-stage">
            <div className="party-title-guess-stage-head">
              <span className="party-chip subtle">
                <Layers3 size={14} />
                {pick('เปิดคำใบ้ทีละใบ', 'Reveal clues one by one')}
              </span>
              <h2>{pick('ทายชื่อเรื่องจากตัวละครก่อนจะเปิดครบ', 'Guess the title before all clues are revealed')}</h2>
              <p>{pick('ไม่มีการใช้พระเอกเป็นคำใบ้ ยิ่งตอบเร็ว คะแนนยิ่งสูง', 'No protagonist clues here. Earlier answers earn more points.')}</p>
            </div>

            <div className="party-title-guess-card-grid">
              {Array.from({ length: 4 }, (_, index) => {
                const clue = revealedCards[index] || null;
                return (
                  <TitleGuessClueCard
                    key={clue?.id || `locked-${index}`}
                    clue={clue}
                    clueIndex={index}
                    revealed={index < revealedClueCount && Boolean(clue)}
                    current={index + 1 === revealedClueCount}
                    pick={pick}
                  />
                );
              })}
            </div>

            <PartyEndCountdownOverlay targetTimeMs={phaseEndsAtMs} />
          </section>

          <section className="party-answer-card party-title-guess-answer-card">
            <div className="party-answer-head">
              <strong>{pick('คำตอบของคุณ', 'Your answer')}</strong>
              <span>{isAnswered ? pick('ล็อกคำตอบแล้ว', 'Answer locked in') : pick('ตอบได้ครั้งเดียวต่อข้อ', 'One answer per question')}</span>
            </div>

            {isChoiceMode ? (
              <>
                {lockedSelectedOptionId ? (
                  <div className="party-title-guess-locked-answer">
                    <div className="party-title-guess-locked-icon">
                      <Lock size={18} />
                    </div>
                    <div>
                      <strong>{pick('เธฅเนเธญเธเธเธณเธ•เธญเธเนเธฅเนเธง', 'Locked In')}</strong>
                      <p>{selectedOption?.label || pick('เธ€เธฅเธทเธญเธเธเธณเธ•เธญเธเนเธฅเนเธง', 'Choice selected')}</p>
                    </div>
                  </div>
                ) : (
                  <div className="party-choice-grid">
                    {(round?.options || []).map((option, index) => {
                      const label = ['A', 'B', 'C', 'D'][index] || String(index + 1);
                      return (
                        <button
                          key={option.id}
                          type="button"
                          className={`party-choice-btn ${lockedSelectedOptionId === option.id ? 'is-selected' : ''}`}
                          onClick={() => onSubmit({ selectedOptionId: option.id })}
                          disabled={submitting || Boolean(lockedSelectedOptionId)}
                        >
                          <span className="party-choice-label" aria-hidden="true">{label}</span>
                          <span>{option.label}</span>
                          {lockedSelectedOptionId === option.id ? <CheckCircle2 size={16} /> : null}
                        </button>
                      );
                    })}
                  </div>
                )}
                <p className="party-title-guess-answer-hint">
                  {pick(
                    'เธ€เธฅเธทเธญเธเนเธ”เนเธเธฃเธฑเนเธเน€เธ”เธตเธขเธงเธ•เนเธญเธเนเธญ เธขเธดเนเธเธ•เธญเธเธเนเธญเธเน€เธเธดเธ”เธเธฃเธเธขเธดเนเธเนเธ”เนเนเธ•เนเธกเน€เธขเธญเธฐ',
                    'One pick per round. Earlier clues are worth more points.',
                  )}
                </p>
              </>
            ) : isAnswered ? (
              <div className="party-title-guess-locked-answer">
                <div className="party-title-guess-locked-icon">
                  <Lock size={18} />
                </div>
                <div>
                  <strong>{pick('ล็อกคำตอบแล้ว', 'Locked In')}</strong>
                  <p>{lockedAnswer}</p>
                </div>
              </div>
            ) : (
              <>
                <form className="party-title-guess-search-form" onSubmit={handleSearchSubmit}>
                  <label className="party-field">
                    <span>{pick('ชื่อเรื่อง', 'Title')}</span>
                    <div className="party-title-guess-search-shell" ref={searchShellRef}>
                      <div className="party-title-guess-search-box">
                        <span className="party-title-guess-search-icon" aria-hidden="true">
                          {suggestionsLoading && shouldShowSuggestions ? (
                            <Loader2 size={16} className="party-spin" />
                          ) : (
                            <Search size={16} />
                          )}
                        </span>
                        <input
                          type="search"
                          role="combobox"
                          aria-autocomplete="list"
                          aria-controls={listboxId}
                          aria-expanded={isAutocompleteOpen}
                          aria-activedescendant={highlightedSuggestionIndex >= 0 ? (suggestionItems[highlightedSuggestionIndex]?.id || undefined) : undefined}
                      className="party-title-guess-search-input"
                      value={typedTitle}
                      onChange={(event) => {
                        setTypedTitle(event.target.value);
                        setPendingAnswerMetadata({
                          selectedTitleId: null,
                          selectedFranchiseAnswerKey: '',
                        });
                        setSearchOpen(true);
                      }}
                          onFocus={() => {
                            if (!submitting) {
                              setSearchOpen(true);
                            }
                      }}
                      onKeyDown={handleSearchInputKeyDown}
                      placeholder={pick('ค้นหาแฟรนไชส์หรือชื่อเรื่อง แล้วกดส่งคำตอบ', 'Search a franchise or title, then press submit')}
                      disabled={submitting}
                          autoComplete="off"
                          autoCapitalize="off"
                          autoCorrect="off"
                          spellCheck="false"
                        />
                      </div>
                      <SearchAutocomplete
                        groups={suggestionGroups}
                        flatItems={suggestionItems}
                        isLoading={suggestionsLoading}
                        isOpen={isAutocompleteOpen}
                        highlightedIndex={highlightedSuggestionIndex}
                        query={typedTitle}
                        variant="compact"
                        listboxId={listboxId}
                        t={autocompleteT}
                        onSelect={handleSuggestionSelect}
                        onSearchAll={() => handleStageAnswer(typedTitle)}
                      />
                    </div>
                  </label>
                  <div className="party-answer-actions">
                    <Button
                      type="submit"
                      variant="primary"
                      disabled={submitting || !typedTitle.trim()}
                    >
                      {submitting
                        ? pick('กำลังส่ง...', 'Saving...')
                        : pick(`ส่งคำตอบ รับ ${currentPoints} แต้ม`, `Submit for ${currentPoints} pts`)}
                    </Button>
                  </div>
                </form>
                {suggestionsError ? (
                  <div className="party-title-guess-search-note is-error" role="status">
                    <span>{suggestionsError}</span>
                  </div>
                ) : null}
                <p className="party-title-guess-answer-hint">
                  {pick(
                    'ถ้าเรื่องนั้นมีแฟรนไชส์ ระบบจะแสดงชื่อแฟรนไชส์ให้เลือกแทนชื่อเรื่อง และจะส่งคำตอบก็ต่อเมื่อคุณกดปุ่มยืนยัน',
                    'If the title belongs to a franchise, the picker shows the franchise name instead of the specific title, and your answer is only sent after you press submit.',
                  )}
                </p>
              </>
            )}

            <div className="party-title-guess-rail">
              {TITLE_GUESS_CARD_POINTS.map((points, index) => {
                const step = index + 1;
                const state = revealedClueCount === step
                  ? 'is-current'
                  : revealedClueCount > step
                    ? 'is-spent'
                    : 'is-pending';
                return (
                  <div key={step} className={`party-title-guess-rail-card ${state}`}>
                    <span>{pick('ใบ', 'Card')} {step}</span>
                    <strong>{points}</strong>
                  </div>
                );
              })}
            </div>
          </section>
        </div>

        <aside className="party-game-side">
          <section className="party-side-panel">
            <div className="party-side-panel-inner">
              <div className="party-side-head">
                <strong>{pick('ตารางคะแนน', 'Leaderboard')}</strong>
                <span>{pick('ยึดคะแนนก่อนเริ่มข้อนี้ไว้ ไม่สวิงระหว่างเล่น', 'Standings stay frozen during this question.')}</span>
              </div>
              <PartyLeaderboard leaderboard={frozenLeaderboard} currentToken={member?.member_token} pick={pick} compact />
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
});

export const PartyTitleGuessRevealStage = React.memo(function PartyTitleGuessRevealStage({
  round,
  answers,
  leaderboard,
  memberToken,
  pick,
}) {
  const currentAnswer = answers.find((entry) => String(entry.member_token || '') === String(memberToken || '')) || null;
  const currentStep = inferTitleGuessClueStepFromAnswer(currentAnswer);
  const correctAnswers = answers.filter((entry) => entry.title_correct);
  const firstReader = [...correctAnswers].sort((left, right) => {
    const leftStep = inferTitleGuessClueStepFromAnswer(left) || 99;
    const rightStep = inferTitleGuessClueStepFromAnswer(right) || 99;
    if (leftStep !== rightStep) {
      return leftStep - rightStep;
    }
    return Number(left.elapsed_ms || 0) - Number(right.elapsed_ms || 0);
  })[0] || null;
  const roundLeader = leaderboard[0] || null;

  return (
    <div className="party-game-grid party-title-guess-reveal-layout">
      <div className="party-game-main">
        <section className="party-reveal-card party-title-guess-reveal-card">
          <div className="party-reveal-card-inner">
            <div className={`party-reveal-outcome-banner ${
              !currentAnswer ? 'is-skipped' : currentAnswer.title_correct ? 'is-correct' : 'is-wrong'
            }`}>
              <span className="party-reveal-outcome-emoji">
                {!currentAnswer ? '❔' : currentAnswer.title_correct ? '✅' : '❌'}
              </span>
              <span>
                {!currentAnswer
                  ? pick('ไม่ได้ตอบข้อนี้', 'No answer this round')
                  : currentAnswer.title_correct
                    ? pick(
                      currentStep ? `ตอบถูกตั้งแต่ใบ ${currentStep}` : 'ตอบถูก',
                      currentStep ? `Correct on clue ${currentStep}` : 'Correct',
                    )
                    : pick('ตอบไม่ตรงกับเฉลย', 'Incorrect answer')}
              </span>
            </div>

            <div className="party-reveal-identity party-title-guess-reveal-head">
              <span className="party-chip subtle">
                <Sparkles size={14} />
                {pick('เฉลยรอบนี้', 'Round reveal')}
              </span>
              <h2 className="party-reveal-title">{round?.sourceTitleName || pick('ไม่พบชื่อเรื่อง', 'Title unavailable')}</h2>
              <p className="party-reveal-song">{pick('โหมดทายชื่อเรื่อง', 'Guess the Title')}</p>
            </div>

            <div className="party-title-guess-card-grid is-reveal">
              {(round?.clues || []).slice(0, 4).map((clue, index) => (
                <TitleGuessClueCard
                  key={clue?.id || `reveal-${index}`}
                  clue={clue}
                  clueIndex={index}
                  revealed
                  current={false}
                  pick={pick}
                />
              ))}
            </div>

            <div className="party-title-guess-highlight-grid">
              <article className="party-title-guess-highlight-card">
                <span>{pick('คนแรกที่อ่านออก', 'Earliest correct read')}</span>
                <strong>{firstReader?.member_name || pick('ยังไม่มี', 'No one yet')}</strong>
                <p>
                  {firstReader
                    ? pick(
                      `ใบ ${inferTitleGuessClueStepFromAnswer(firstReader) || 4} • +${firstReader.points_awarded || 0} แต้ม`,
                      `Clue ${inferTitleGuessClueStepFromAnswer(firstReader) || 4} • +${firstReader.points_awarded || 0} pts`,
                    )
                    : pick('รอบนี้ยังไม่มีคนตอบถูก', 'Nobody solved this round.')}
                </p>
              </article>
              <article className="party-title-guess-highlight-card">
                <span>{pick('ผู้นำปัจจุบัน', 'Current leader')}</span>
                <strong>{roundLeader?.memberName || pick('ยังไม่มี', 'No leader yet')}</strong>
                <p>{pick(`คะแนนรวม ${roundLeader?.score || 0}`, `Total ${roundLeader?.score || 0}`)}</p>
              </article>
            </div>
          </div>
        </section>
      </div>

      <aside className="party-game-side">
        <section className="party-side-panel">
          <div className="party-side-panel-inner">
            <div className="party-side-head">
              <strong>{pick('อันดับล่าสุด', 'Current standing')}</strong>
              <span>{pick('อัปเดตหลังเฉลยจบรอบนี้', 'Updated after this reveal')}</span>
            </div>
            <PartyLeaderboard leaderboard={leaderboard} currentToken={memberToken} pick={pick} compact />
          </div>
        </section>
      </aside>
    </div>
  );
});

export const PartyTitleGuessFinalStage = React.memo(function PartyTitleGuessFinalStage({
  leaderboard,
  currentMatch,
  guestToken,
  isHost,
  busyAction,
  onRematch,
  pick,
}) {
  const winner = leaderboard[0] || null;
  const podium = leaderboard.slice(0, 3);

  return (
    <div className="party-title-guess-final">
      <section className="party-title-guess-winner-card">
        <span className="party-chip success">
          <Trophy size={14} />
          {pick('แมตช์จบแล้ว', 'Match complete')}
        </span>
        <div className="party-title-guess-winner-copy">
          <p>{currentMatch?.titleGuessSetName || pick('โหมดทายชื่อเรื่อง', 'Guess the Title')}</p>
          <h2>{winner?.memberName || pick('ยังไม่มีผู้ชนะ', 'No winner yet')}</h2>
          <span>{pick(`ชนะจาก ${currentMatch?.totalRounds || 0} รอบ`, `Won across ${currentMatch?.totalRounds || 0} rounds`)}</span>
        </div>
        <div className="party-title-guess-winner-avatar">
          {winner ? (
            <PartyIdentityAvatar
              profile={{
                displayName: winner.memberName,
                avatarKey: winner.avatarKey,
                avatarUrl: winner.avatarUrl,
              }}
              className="party-title-guess-winner-avatar-node"
            />
          ) : null}
        </div>
        <div className="party-title-guess-winner-stats">
          <article className="party-final-stat">
            <strong>{winner?.score ?? 0}</strong>
            <span>{pick('คะแนนรวม', 'Total score')}</span>
          </article>
          <article className="party-final-stat">
            <strong>{winner?.titleHits ?? 0}</strong>
            <span>{pick('ข้อที่ตอบถูก', 'Correct')}</span>
          </article>
          <article className="party-final-stat">
            <strong>{leaderboard.length}</strong>
            <span>{pick('ผู้เล่น', 'Players')}</span>
          </article>
        </div>
        <div className="party-lobby-actions">
          {isHost ? (
            <Button variant="primary" icon={<Sparkles size={16} />} onClick={onRematch} disabled={busyAction === 'rematch'}>
              {busyAction === 'rematch' ? pick('กำลังรีเซ็ต...', 'Resetting...') : pick('กลับ Lobby', 'Back to lobby')}
            </Button>
          ) : null}
          <Link to="/party" className="party-code-btn subtle">{pick('กลับหน้า Party', 'Back to Party')}</Link>
        </div>
      </section>

      {podium.length > 0 ? (
        <section className="party-title-guess-podium">
          {podium.map((entry, index) => (
            <article key={entry.memberToken} className={`party-title-guess-podium-card rank-${index + 1}${entry.memberToken === guestToken ? ' is-current' : ''}`}>
              <span className="party-title-guess-podium-rank">
                {index === 0 ? <Crown size={16} /> : `#${index + 1}`}
              </span>
              <PartyIdentityAvatar
                profile={{
                  displayName: entry.memberName,
                  avatarKey: entry.avatarKey,
                  avatarUrl: entry.avatarUrl,
                }}
              />
              <strong>{entry.memberName}</strong>
              <span>{entry.score} pts</span>
            </article>
          ))}
        </section>
      ) : null}

      <section className="party-final-leaderboard-wrap">
        <div className="party-side-head" style={{ marginBottom: '0.85rem' }}>
          <strong>{pick('ตารางคะแนนสุดท้าย', 'Final leaderboard')}</strong>
          <span>{pick('เรียงจากคะแนนรวมหลังเล่นจบทุกข้อ', 'Sorted by total score after the final round')}</span>
        </div>
        <PartyLeaderboard leaderboard={leaderboard} currentToken={guestToken} pick={pick} />
      </section>
    </div>
  );
});
