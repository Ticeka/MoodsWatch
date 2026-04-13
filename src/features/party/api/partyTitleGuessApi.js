import { supabase } from '@/shared/lib/supabase';
import { buildUniquePartyAliases, createPartySettings } from '../lib/partyEngine.js';
import { getMissingRelation } from './partyProfileApi.js';

const PARTY_SONG_POOL_CACHE_TTL_MS = 2 * 60 * 1000;

const partyTitleGuessSetCache = new Map();
const partyTitleGuessListingCache = new Map();
const partyTitleGuessCharacterCache = new Map();

function hasMissingColumn(error, columnName) {
  const message = String(error?.message || '').toLowerCase();
  return message.includes(`column "${String(columnName || '').toLowerCase()}"`) || message.includes(`'${String(columnName || '').toLowerCase()}'`);
}

function getPartySongPoolCacheEntry(cache, key) {
  const entry = cache.get(key);
  if (!entry) {
    return null;
  }

  if (entry.promise) {
    return entry;
  }

  if (Number(entry.expiresAt || 0) > Date.now()) {
    return entry;
  }

  cache.delete(key);
  return null;
}

async function getOrCreatePartySongPoolCacheValue(cache, key, loader) {
  const cachedEntry = getPartySongPoolCacheEntry(cache, key);
  if (cachedEntry?.promise) {
    return cachedEntry.promise;
  }

  if (cachedEntry?.value) {
    return cachedEntry.value;
  }

  const task = Promise.resolve().then(loader);
  cache.set(key, { promise: task });

  try {
    const value = await task;
    cache.set(key, {
      value,
      expiresAt: Date.now() + PARTY_SONG_POOL_CACHE_TTL_MS,
    });
    return value;
  } catch (error) {
    cache.delete(key);
    throw error;
  }
}

function extractCanonicalAliasValues(record = {}) {
  const aliases = Array.isArray(record?.aliases_cache)
    ? record.aliases_cache
    : (Array.isArray(record?.aliases) ? record.aliases : []);

  return aliases
    .map((alias) => String(alias?.alias || alias?.value || '').trim())
    .filter(Boolean);
}

function mapPartyTitleGuessQuestionRow(
  row,
  titleMap = new Map(),
  characterMap = new Map(),
  strictCharacterValidation = false,
) {
  const titleId = Number(row?.answer_title_id ?? row?.answerTitleId ?? 0) || 0;
  const titleRecord = titleMap.get(titleId) || null;
  const answerTitle = String(titleRecord?.canonical_title || row?.answer_title || row?.answerTitle || '').trim();
  const answerTitleAliases = buildUniquePartyAliases([
    answerTitle,
    ...(Array.isArray(row?.answer_aliases) ? row.answer_aliases : []),
    ...extractCanonicalAliasValues(titleRecord),
  ]);
  const franchiseName = String(
    row?.franchise_name
    ?? row?.answer_franchise_name
    ?? titleRecord?.franchise_name
    ?? titleRecord?.series_name
    ?? ''
  ).trim();
  const franchiseAliases = buildUniquePartyAliases([
    franchiseName,
    ...(Array.isArray(row?.franchise_aliases) ? row.franchise_aliases : []),
    ...(Array.isArray(row?.answer_franchise_aliases) ? row.answer_franchise_aliases : []),
  ]);
  const clues = (Array.isArray(row?.party_title_guess_clues) ? row.party_title_guess_clues : [])
    .map((clue) => {
      const characterId = Number(clue?.character_id || 0) || 0;
      const characterRecord = characterMap.get(characterId) || null;
      const characterTitleId = Number(characterRecord?.canonical_title_id || 0) || 0;
      const characterName = String(clue?.character_name_snapshot || characterRecord?.name_full || '').trim();
      const characterNativeName = String(clue?.character_name_native_snapshot || '').trim();
      const characterImageUrl = String(clue?.character_image_url_snapshot || characterRecord?.image_url || '').trim();

      return {
        id: clue?.id,
        clue_order: clue?.clue_order,
        clueOrder: Number(clue?.clue_order || 0),
        clue_role_bucket: clue?.clue_role_bucket,
        role: String(clue?.clue_role_bucket || '').trim().toUpperCase(),
        character_id: characterId || null,
        characterId: characterId || null,
        character_title_id: characterTitleId || null,
        character_name_snapshot: characterName,
        character_name_native_snapshot: characterNativeName || null,
        character_image_url_snapshot: characterImageUrl,
        name: characterName,
        nativeName: characterNativeName,
        imageUrl: characterImageUrl,
        is_manual_override: clue?.is_manual_override,
      };
    })
    .filter((clue) => {
      if (!strictCharacterValidation) {
        return true;
      }
      if (!titleId) {
        return true;
      }
      if (!clue?.character_id) {
        return false;
      }
      if (!clue?.character_title_id) {
        return false;
      }
      return clue.character_title_id === titleId;
    })
    .sort((left, right) => Number(left?.clue_order || 0) - Number(right?.clue_order || 0));

  return {
    id: String(row?.id || '').trim(),
    answerTitleId: titleId || null,
    answerTitle,
    answerTitleAliases,
    coverUrl: String(titleRecord?.cover_image || row?.cover_url || '').trim(),
    franchiseId: Number(row?.franchise_id ?? row?.answer_franchise_id ?? titleRecord?.franchise_id ?? 0) || null,
    franchiseName,
    franchiseAliases,
    difficultyTier: Number(row?.difficulty_tier || 2),
    sortOrder: Number(row?.sort_order || 0),
    clues,
  };
}

function mapPartyTitleGuessSetRow(row) {
  return {
    id: String(row?.id || '').trim(),
    name: String(row?.name || '').trim(),
    description: String(row?.description || '').trim(),
    coverUrl: String(row?.cover_url || '').trim(),
    ownerUserId: String(row?.owner_user_id || '').trim(),
    creatorName: String(row?.creator_name || '').trim(),
    questionCount: Math.max(0, Number(row?.question_count || 0)),
    likeCount: Math.max(0, Number(row?.like_count || 0)),
    playCount: Math.max(0, Number(row?.play_count || 0)),
    isOfficial: Boolean(row?.is_official),
    visibility: String(row?.visibility || 'public').trim(),
    updatedAt: row?.updated_at || null,
  };
}

function mapPartyTitleGuessCharacterRow(row = {}) {
  return {
    id: Number(row?.id || 0) || null,
    titleId: Number(row?.canonical_title_id || 0) || null,
    name: String(row?.name_full || '').trim(),
    nativeName: String(row?.name_native || '').trim(),
    imageUrl: String(row?.image_url || '').trim(),
    role: String(row?.role || '').trim().toUpperCase(),
    sortOrder: Number(row?.sort_order || 0),
    isPrimaryProtagonist: Boolean(row?.is_primary_protagonist),
    isPrimaryHeroine: Boolean(row?.is_primary_heroine),
    leadType: String(row?.lead_type || 'unknown').trim().toLowerCase(),
    presentationGender: String(row?.presentation_gender || 'unknown').trim().toLowerCase(),
    isGuessDisabled: Boolean(row?.is_guess_disabled),
    guessPriority: Number(row?.guess_priority || 0),
    guessNote: String(row?.guess_note || '').trim(),
  };
}

function getPartyTitleGuessDifficultyWeight(clue = {}) {
  const role = String(clue?.role || '').trim().toUpperCase();
  switch (role) {
    case 'BACKGROUND':
      return 5;
    case 'SUPPORTING':
      return 4;
    case 'MAIN':
      return 2;
    default:
      return 3;
  }
}

function isPartyTitleGuessLeadCharacter(clue = {}) {
  const leadType = String(clue?.leadType ?? clue?.lead_type ?? '').trim().toLowerCase();
  return Boolean(
    clue?.isPrimaryProtagonist
    || clue?.is_primary_protagonist
    || clue?.isPrimaryHeroine
    || clue?.is_primary_heroine
    || leadType === 'protagonist'
    || leadType === 'heroine'
  );
}

function inferPartyTitleGuessDifficultyTier(clues = []) {
  const slotWeights = [1.7, 1.35, 1, 0.8];
  const normalizedClues = Array.isArray(clues) ? clues.filter(Boolean).slice(0, 4) : [];
  if (normalizedClues.length === 0) {
    return 2;
  }

  const totalWeight = normalizedClues.reduce((sum, _, index) => sum + (slotWeights[index] || 1), 0);
  const weightedScore = normalizedClues.reduce((sum, clue, index) => (
    sum + getPartyTitleGuessDifficultyWeight(clue) * (slotWeights[index] || 1)
  ), 0);
  const averageScore = totalWeight > 0 ? weightedScore / totalWeight : 0;

  if (averageScore >= 4.4) return 5;
  if (averageScore >= 3.7) return 4;
  if (averageScore >= 3.0) return 3;
  if (averageScore >= 2.2) return 2;
  return 1;
}

function getPartyTitleGuessClueRoleBucket(clue = {}) {
  if (isPartyTitleGuessLeadCharacter(clue)) {
    return 'main-side';
  }

  const role = String(clue?.role || '').trim().toUpperCase();
  switch (role) {
    case 'BACKGROUND':
      return 'background';
    case 'SUPPORTING':
      return 'supporting';
    case 'MAIN':
      return 'main-side';
    default:
      return 'wildcard';
  }
}

export function __resetPartyTitleGuessCachesForTests() {
  partyTitleGuessSetCache.clear();
  partyTitleGuessListingCache.clear();
  partyTitleGuessCharacterCache.clear();
}

export async function fetchPartyTitleGuessCharacters(titleId) {
  if (!supabase) {
    return [];
  }

  const normalizedTitleId = Number(titleId || 0);
  if (!normalizedTitleId) {
    return [];
  }

  const cacheKey = `title-guess-characters:${normalizedTitleId}`;
  return getOrCreatePartySongPoolCacheValue(partyTitleGuessCharacterCache, cacheKey, async () => {
    const baseSelect = `
      id,
      canonical_title_id,
      name_full,
      name_native,
      image_url,
      role,
      sort_order
    `;
    const extendedSelect = `
      ${baseSelect},
      is_primary_protagonist,
      is_primary_heroine,
      lead_type,
      presentation_gender,
      is_guess_disabled,
      guess_priority,
      guess_note
    `;

    let data = null;
    let error = null;

    ({ data, error } = await supabase
      .from('title_characters')
      .select(extendedSelect)
      .eq('canonical_title_id', normalizedTitleId)
      .order('sort_order', { ascending: true })
      .order('id', { ascending: true }));

    if (
      error
      && (
        hasMissingColumn(error, 'is_primary_protagonist')
        || hasMissingColumn(error, 'is_primary_heroine')
        || hasMissingColumn(error, 'lead_type')
        || hasMissingColumn(error, 'presentation_gender')
        || hasMissingColumn(error, 'is_guess_disabled')
        || hasMissingColumn(error, 'guess_priority')
        || hasMissingColumn(error, 'guess_note')
      )
    ) {
      ({ data, error } = await supabase
        .from('title_characters')
        .select(baseSelect)
        .eq('canonical_title_id', normalizedTitleId)
        .order('sort_order', { ascending: true })
        .order('id', { ascending: true }));
    }

    if (error) {
      if (getMissingRelation(error, 'title_characters')) {
        return [];
      }
      throw error;
    }

    return (data || [])
      .map(mapPartyTitleGuessCharacterRow)
      .filter((character) => character.id && character.titleId === normalizedTitleId);
  });
}

function normalizePartyTitleGuessDraftQuestions(questions = [], { strict = false } = {}) {
  const mapped = (Array.isArray(questions) ? questions : [])
    .map((question, index) => {
      const normalizedClues = (Array.isArray(question?.clues) ? question.clues : [])
        .slice(0, 4)
        .map((clue, clueIndex) => ({
          id: String(clue?.id ?? clue?.characterId ?? `manual-clue-${index + 1}-${clueIndex + 1}`),
          characterId: Number(clue?.characterId ?? clue?.id ?? 0) || null,
          name: String(clue?.name ?? clue?.characterName ?? '').trim(),
          nativeName: String(clue?.nativeName ?? clue?.characterNativeName ?? '').trim(),
          imageUrl: String(clue?.imageUrl ?? clue?.characterImageUrl ?? '').trim(),
          role: String(clue?.role || '').trim().toUpperCase(),
          isPrimaryProtagonist: Boolean(clue?.isPrimaryProtagonist ?? clue?.is_primary_protagonist),
          isPrimaryHeroine: Boolean(clue?.isPrimaryHeroine ?? clue?.is_primary_heroine),
          leadType: String(clue?.leadType ?? clue?.lead_type ?? '').trim().toLowerCase(),
          clueOrder: Math.max(1, Math.min(4, Number(clue?.clueOrder || clueIndex + 1))),
        }))
        .filter((clue) => clue.name);

      const sortedClues = normalizedClues.sort((left, right) => left.clueOrder - right.clueOrder);
      const answerTitle = String(question?.answerTitle || question?.title || '').trim();

      return {
        answerTitleId: Number(question?.answerTitleId || 0) || null,
        answerTitle,
        answerAliases: buildUniquePartyAliases([
          answerTitle,
          ...(Array.isArray(question?.answerAliases) ? question.answerAliases : []),
        ]),
        franchiseId: Number(question?.franchiseId || 0) || null,
        franchiseName: String(question?.franchiseName || '').trim(),
        franchiseAliases: buildUniquePartyAliases([
          String(question?.franchiseName || '').trim(),
          ...(Array.isArray(question?.franchiseAliases) ? question.franchiseAliases : []),
        ]),
        coverUrl: String(question?.coverUrl || '').trim(),
        difficultyTier: Math.max(
          1,
          Math.min(5, Number(question?.difficultyTier || inferPartyTitleGuessDifficultyTier(normalizedClues) || 2)),
        ),
        note: String(question?.note || '').trim(),
        sortOrder: Number(question?.sortOrder ?? index) || index,
        clues: sortedClues,
      };
    });

  const valid = mapped.filter((question) => (
    question.answerAliases.length > 0
    && question.clues.length === 4
  ));

  if (strict && valid.length < mapped.length) {
    const incompleteIndexes = mapped
      .map((question, index) => {
        if (question.answerAliases.length === 0) {
          return `ข้อ ${index + 1} (ไม่มีชื่อเรื่อง / missing answer title)`;
        }
        if (question.clues.length < 4) {
          return `ข้อ ${index + 1} "${question.answerTitle || '?'}" (มีคำใบ้ ${question.clues.length}/4 ใบ)`;
        }
        return null;
      })
      .filter(Boolean);

    throw new Error(
      `คำถามบางข้อยังไม่ครบ กรุณาแก้ไขก่อนบันทึก:\n${incompleteIndexes.join('\n')}`
    );
  }

  return valid;
}

async function replacePartyTitleGuessSetQuestions(setId, normalizedQuestions = []) {
  const normalizedSetId = Number(setId || 0) || 0;
  if (!normalizedSetId) {
    throw new Error('A valid Guess the Title set id is required.');
  }

  if (!Array.isArray(normalizedQuestions) || normalizedQuestions.length === 0) {
    throw new Error('Add at least one complete Guess the Title question before saving.');
  }

  // Fetch existing question ids before touching anything.
  const { data: existingQuestionRows, error: existingQuestionsError } = await supabase
    .from('party_title_guess_questions')
    .select('id')
    .eq('set_id', normalizedSetId);

  if (existingQuestionsError && !getMissingRelation(existingQuestionsError, 'party_title_guess_questions')) {
    throw existingQuestionsError;
  }

  const existingQuestionIds = (existingQuestionRows || [])
    .map((row) => Number(row?.id || 0))
    .filter((value) => value > 0);

  // Insert new questions first with status='draft' so old data stays intact
  // until all inserts succeed.
  const { data: createdQuestionRows, error: questionError } = await supabase
    .from('party_title_guess_questions')
    .insert(normalizedQuestions.map((question, index) => ({
      set_id: normalizedSetId,
      answer_title_id: question.answerTitleId,
      answer_title: question.answerTitle || null,
      answer_aliases: question.answerAliases,
      franchise_id: question.franchiseId,
      franchise_name: question.franchiseName || null,
      franchise_aliases: question.franchiseAliases,
      cover_url: question.coverUrl || null,
      difficulty_tier: question.difficultyTier,
      status: 'draft',
      sort_order: index,
      source_strategy: 'manual',
      note: question.note || null,
    })))
    .select('id, sort_order');

  if (questionError) {
    throw questionError;
  }

  const questionIdBySortOrder = new Map(
    (createdQuestionRows || [])
      .map((row) => [Number(row?.sort_order ?? -1), Number(row?.id || 0)])
      .filter(([, questionId]) => questionId > 0),
  );

  const newQuestionIds = [...questionIdBySortOrder.values()];

  const clueRows = normalizedQuestions.flatMap((question, index) => {
    const questionId = questionIdBySortOrder.get(index);
    if (!questionId) {
      return [];
    }

    return question.clues.map((clue, clueIndex) => ({
      question_id: questionId,
      character_id: clue.characterId || null,
      clue_order: Math.max(1, Math.min(4, Number(clue.clueOrder || clueIndex + 1))),
      clue_role_bucket: getPartyTitleGuessClueRoleBucket(clue),
      character_name_snapshot: clue.name || '',
      character_name_native_snapshot: clue.nativeName || null,
      character_image_url_snapshot: clue.imageUrl || null,
      is_manual_override: true,
    }));
  });

  if (clueRows.length > 0) {
    const { error: clueError } = await supabase
      .from('party_title_guess_clues')
      .insert(clueRows);

    if (clueError) {
      // Clue insert failed — clean up the draft questions so we don't leave orphans.
      if (newQuestionIds.length > 0) {
        await supabase
          .from('party_title_guess_questions')
          .delete()
          .in('id', newQuestionIds);
      }
      throw clueError;
    }
  }

  // All new rows are safely inserted. Now delete the old questions (cascades to clues
  // if FK cascade is set, otherwise delete clues first).
  if (existingQuestionIds.length > 0) {
    const { error: deleteCluesError } = await supabase
      .from('party_title_guess_clues')
      .delete()
      .in('question_id', existingQuestionIds);

    if (deleteCluesError && !getMissingRelation(deleteCluesError, 'party_title_guess_clues')) {
      throw deleteCluesError;
    }

    const { error: deleteQuestionsError } = await supabase
      .from('party_title_guess_questions')
      .delete()
      .in('id', existingQuestionIds);

    if (deleteQuestionsError) {
      throw deleteQuestionsError;
    }
  }

  // Promote new questions from 'draft' to 'ready'.
  if (newQuestionIds.length > 0) {
    const { error: activateError } = await supabase
      .from('party_title_guess_questions')
      .update({ status: 'ready' })
      .in('id', newQuestionIds);

    if (activateError) {
      throw activateError;
    }
  }
}

export async function createPartyTitleGuessSet(setData = {}, questions = [], creatorName = '') {
  if (!supabase) {
    throw new Error('No database connection');
  }

  const normalizedQuestions = normalizePartyTitleGuessDraftQuestions(questions, { strict: true });

  if (normalizedQuestions.length === 0) {
    throw new Error('Add at least one complete Guess the Title question before saving.');
  }

  const fallbackCoverUrl = normalizedQuestions.find((question) => question.coverUrl)?.coverUrl || '';
  const { data: createdSetRow, error: setError } = await supabase
    .from('party_title_guess_sets')
    .insert({
      owner_user_id: setData.ownerUserId || null,
      creator_name: String(creatorName || '').trim(),
      name: String(setData.name || '').trim(),
      description: String(setData.description || '').trim(),
      cover_url: String(setData.coverUrl || fallbackCoverUrl || '').trim(),
      visibility: String(setData.visibility || 'public').trim() || 'public',
      is_official: false,
    })
    .select(`
      id,
      name,
      description,
      cover_url,
      owner_user_id,
      creator_name,
      question_count,
      like_count,
      play_count,
      is_official,
      visibility,
      updated_at
    `)
    .single();

  if (setError) {
    throw setError;
  }

  const createdSetId = Number(createdSetRow?.id || 0) || 0;
  if (!createdSetId) {
    throw new Error('Created set did not return a valid id.');
  }

  try {
    await replacePartyTitleGuessSetQuestions(createdSetId, normalizedQuestions);

    partyTitleGuessListingCache.clear();
    partyTitleGuessSetCache.delete(String(createdSetId));

    const { data: refreshedSetRow, error: refreshedSetError } = await supabase
      .from('party_title_guess_sets')
      .select(`
        id,
        name,
        description,
        cover_url,
        owner_user_id,
        creator_name,
        question_count,
        like_count,
        play_count,
        is_official,
        visibility,
        updated_at
      `)
      .eq('id', createdSetId)
      .maybeSingle();

    if (!refreshedSetError && refreshedSetRow) {
      return mapPartyTitleGuessSetRow(refreshedSetRow);
    }

    return {
      ...mapPartyTitleGuessSetRow(createdSetRow),
      questionCount: normalizedQuestions.length,
    };
  } catch (error) {
    try {
      await supabase
        .from('party_title_guess_sets')
        .delete()
        .eq('id', createdSetId);
    } catch {
      // Ignore rollback noise so the original error still surfaces.
    }

    throw error;
  }
}

export async function fetchPartyTitleGuessSetDetail(setId) {
  if (!supabase || !setId) {
    return null;
  }

  const normalizedSetId = String(setId || '').trim();
  if (!normalizedSetId) {
    return null;
  }

  try {
    const { data: setRow, error: setError } = await supabase
      .from('party_title_guess_sets')
      .select(`
        id,
        name,
        description,
        cover_url,
        owner_user_id,
        creator_name,
        question_count,
        like_count,
        play_count,
        is_official,
        visibility,
        updated_at
      `)
      .eq('id', normalizedSetId)
      .maybeSingle();

    if (setError) {
      if (getMissingRelation(setError, 'party_title_guess_sets')) {
        return null;
      }
      throw setError;
    }

    if (!setRow) {
      return null;
    }

    const set = mapPartyTitleGuessSetRow(setRow);
    const questions = await fetchPartyTitleGuessQuestionPool({
      modeType: 'title-guess',
      titleGuessSetId: normalizedSetId,
    });

    return {
      ...set,
      questions: questions.map((question) => ({
        id: question.id,
        answerTitleId: question.answerTitleId,
        answerTitle: question.answerTitle,
        answerAliases: question.answerTitleAliases,
        franchiseId: question.franchiseId,
        franchiseName: question.franchiseName,
        franchiseAliases: question.franchiseAliases,
        coverUrl: question.coverUrl || '',
        difficultyTier: question.difficultyTier,
        sortOrder: question.sortOrder,
        clues: (Array.isArray(question.clues) ? question.clues : []).map((clue, clueIndex) => ({
          id: clue.id,
          name: clue.name,
          nativeName: clue.nativeName,
          imageUrl: clue.imageUrl,
          role: clue.role,
          isPrimaryProtagonist: clue.isPrimaryProtagonist,
          isPrimaryHeroine: clue.isPrimaryHeroine,
          leadType: clue.leadType,
          clueOrder: Number(clue.clueOrder || clueIndex + 1),
        })),
      })),
    };
  } catch (error) {
    if (
      getMissingRelation(error, 'party_title_guess_sets')
      || getMissingRelation(error, 'party_title_guess_questions')
      || getMissingRelation(error, 'party_title_guess_clues')
    ) {
      return null;
    }
    throw error;
  }
}

export async function updatePartyTitleGuessSet(setId, setData = {}, questions = [], creatorName = '') {
  if (!supabase) {
    throw new Error('No database connection');
  }

  const normalizedSetId = Number(setId || 0) || 0;
  if (!normalizedSetId) {
    throw new Error('A valid Guess the Title set id is required.');
  }

  const normalizedQuestions = normalizePartyTitleGuessDraftQuestions(questions, { strict: true });
  if (normalizedQuestions.length === 0) {
    throw new Error('Add at least one complete Guess the Title question before saving.');
  }

  const fallbackCoverUrl = normalizedQuestions.find((question) => question.coverUrl)?.coverUrl || '';
  const { data: updatedSetRow, error: updateSetError } = await supabase
    .from('party_title_guess_sets')
    .update({
      owner_user_id: setData.ownerUserId || null,
      creator_name: String(creatorName || '').trim(),
      name: String(setData.name || '').trim(),
      description: String(setData.description || '').trim(),
      cover_url: String(setData.coverUrl || fallbackCoverUrl || '').trim(),
      visibility: String(setData.visibility || 'public').trim() || 'public',
    })
    .eq('id', normalizedSetId)
    .eq('is_official', false)
    .select(`
      id,
      name,
      description,
      cover_url,
      owner_user_id,
      creator_name,
      question_count,
      like_count,
      play_count,
      is_official,
      visibility,
      updated_at
    `)
    .maybeSingle();

  if (updateSetError) {
    throw updateSetError;
  }

  if (!updatedSetRow) {
    throw new Error('This Guess the Title set could not be edited.');
  }

  await replacePartyTitleGuessSetQuestions(normalizedSetId, normalizedQuestions);

  partyTitleGuessListingCache.clear();
  partyTitleGuessSetCache.delete(String(normalizedSetId));

  const { data: refreshedSetRow, error: refreshedSetError } = await supabase
    .from('party_title_guess_sets')
    .select(`
      id,
      name,
      description,
      cover_url,
      owner_user_id,
      creator_name,
      question_count,
      like_count,
      play_count,
      is_official,
      visibility,
      updated_at
    `)
    .eq('id', normalizedSetId)
    .maybeSingle();

  if (!refreshedSetError && refreshedSetRow) {
    return mapPartyTitleGuessSetRow(refreshedSetRow);
  }

  return {
    ...mapPartyTitleGuessSetRow(updatedSetRow),
    questionCount: normalizedQuestions.length,
  };
}

export async function fetchPartyTitleGuessSets({ tab = 'all', search = '', userId = null, limit = 200 } = {}) {
  if (!supabase) {
    return [];
  }

  const normalizedTab = String(tab || 'all').trim().toLowerCase();
  const normalizedSearch = String(search || '').trim();
  const normalizedUserId = String(userId || '').trim();
  const safeLimit = Math.max(1, Math.min(Number(limit) || 200, 500));
  const cacheKey = JSON.stringify({
    tab: normalizedTab,
    search: normalizedSearch.toLowerCase(),
    userId: normalizedUserId,
    limit: safeLimit,
  });

  return getOrCreatePartySongPoolCacheValue(partyTitleGuessListingCache, cacheKey, async () => {
    try {
      let query = supabase
        .from('party_title_guess_sets')
        .select(`
          id,
          name,
          description,
          cover_url,
          owner_user_id,
          creator_name,
          question_count,
          like_count,
          play_count,
          is_official,
          visibility,
          updated_at
        `)
        .order('is_official', { ascending: false })
        .order('updated_at', { ascending: false })
        .limit(safeLimit);

      if (normalizedTab === 'official') {
        query = query.eq('is_official', true);
      } else if (normalizedTab === 'mine' && normalizedUserId) {
        query = query.eq('owner_user_id', normalizedUserId);
      } else {
        query = query.in('visibility', ['public', 'unlisted']);
      }

      if (normalizedSearch) {
        query = query.ilike('name', `%${normalizedSearch}%`);
      }

      const { data, error } = await query;

      if (error) {
        if (getMissingRelation(error, 'party_title_guess_sets')) {
          return [];
        }
        throw error;
      }

      return (data || [])
        .map(mapPartyTitleGuessSetRow)
        .filter((row) => row.id && row.name);
    } catch (error) {
      if (getMissingRelation(error, 'party_title_guess_sets')) {
        return [];
      }
      throw error;
    }
  });
}

export async function fetchPartyTitleGuessQuestionPool(settings = {}) {
  if (!supabase) {
    return [];
  }

  const normalizedSettings = createPartySettings({ ...settings, modeType: 'title-guess' });
  const setId = String(normalizedSettings.titleGuessSetId || '').trim();
  if (!setId) {
    return [];
  }

  return getOrCreatePartySongPoolCacheValue(partyTitleGuessSetCache, setId, async () => {
    try {
      const { data, error } = await supabase
        .from('party_title_guess_questions')
        .select(`
          id,
          answer_title_id,
          answer_title,
          answer_aliases,
          franchise_id,
          franchise_name,
          franchise_aliases,
          cover_url,
          difficulty_tier,
          sort_order,
          party_title_guess_clues(
            id,
            clue_order,
            clue_role_bucket,
            character_id,
            character_name_snapshot,
            character_name_native_snapshot,
            character_image_url_snapshot,
            is_manual_override
          )
        `)
        .eq('set_id', setId)
        .eq('status', 'ready')
        .order('sort_order', { ascending: true })
        .order('id', { ascending: true });

      if (error) {
        if (
          getMissingRelation(error, 'party_title_guess_questions')
          || getMissingRelation(error, 'party_title_guess_clues')
        ) {
          return [];
        }
        throw error;
      }

      const titleIds = [...new Set(
        (data || [])
          .map((row) => Number(row?.answer_title_id || 0))
          .filter((value) => value > 0)
      )];

      const titleMap = new Map();
      if (titleIds.length > 0) {
        const { data: titleRows, error: titleError } = await supabase
          .from('canonical_titles')
          .select('id, canonical_title, aliases_cache, cover_image, franchise_id, franchise_name, franchise_aliases')
          .in('id', titleIds);

        if (titleError) {
          throw titleError;
        }

        (titleRows || []).forEach((row) => {
          titleMap.set(Number(row?.id || 0), row);
        });
      }

      const characterIds = [...new Set(
        (data || [])
          .flatMap((row) => (Array.isArray(row?.party_title_guess_clues) ? row.party_title_guess_clues : []))
          .map((clue) => Number(clue?.character_id || 0))
          .filter((value) => value > 0)
      )];
      const characterMap = new Map();
      let strictCharacterValidation = false;
      if (characterIds.length > 0) {
        const { data: characterRows, error: characterError } = await supabase
          .from('title_characters')
          .select('id, canonical_title_id, name_full, image_url')
          .in('id', characterIds);

        if (characterError) {
          if (!getMissingRelation(characterError, 'title_characters')) {
            throw characterError;
          }
        } else {
          strictCharacterValidation = true;
          (characterRows || []).forEach((row) => {
            characterMap.set(Number(row?.id || 0), row);
          });
        }
      }

      return (data || [])
        .map((row) => mapPartyTitleGuessQuestionRow(row, titleMap, characterMap, strictCharacterValidation))
        .filter((row) => row.id && row.answerTitleAliases.length > 0 && row.clues.length >= 4);
    } catch (error) {
      if (
        getMissingRelation(error, 'party_title_guess_questions')
        || getMissingRelation(error, 'party_title_guess_clues')
      ) {
        return [];
      }
      throw error;
    }
  });
}
