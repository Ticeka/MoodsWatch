function normalizeText(value) {
  return String(value || '').trim();
}

function normalizeRole(value) {
  return normalizeText(value).toUpperCase();
}

export function normalizePresentationGender(value) {
  const normalized = normalizeText(value).toLowerCase();
  if (!normalized) return 'unknown';
  if (['male', 'man', 'boy', 'm'].includes(normalized)) return 'male';
  if (['female', 'woman', 'girl', 'f'].includes(normalized)) return 'female';
  if (['nonbinary', 'non-binary', 'nb', 'x'].includes(normalized)) return 'nonbinary';
  return 'unknown';
}

function getCharacterPriority(character = {}, index = 0) {
  const role = normalizeRole(character?.role);
  const roleWeight = role === 'MAIN' ? 100 : role === 'SUPPORTING' ? 50 : 10;
  const sortOrder = Number.isFinite(Number(character?.sort_order ?? character?.sortOrder))
    ? Number(character?.sort_order ?? character?.sortOrder)
    : 9999;
  return {
    index,
    role,
    sortOrder,
    score: (roleWeight * 10000) - sortOrder,
  };
}

export function annotateCharacterIdentities(characters = []) {
  const normalizedCharacters = (Array.isArray(characters) ? characters : []).map((character, index) => ({
    ...character,
    role: normalizeRole(character?.role),
    presentation_gender: normalizePresentationGender(
      character?.presentation_gender
      ?? character?.presentationGender
      ?? character?.gender
    ),
    __priority: getCharacterPriority(character, index),
  }));

  if (!normalizedCharacters.length) {
    return [];
  }

  const sortedByPriority = [...normalizedCharacters].sort((left, right) => {
    const scoreDelta = right.__priority.score - left.__priority.score;
    if (scoreDelta !== 0) return scoreDelta;
    return left.__priority.index - right.__priority.index;
  });

  const protagonist = sortedByPriority[0] || null;
  const heroine = sortedByPriority.find((character) => (
    character.presentation_gender === 'female'
    && character.__priority.role === 'MAIN'
  )) || null;

  const leadCandidates = sortedByPriority.filter((character) => character.__priority.role === 'MAIN');
  const leadCandidateIds = new Set(leadCandidates.map((character) => character.anilist_id ?? character.id ?? character.__priority.index));

  return normalizedCharacters.map((character) => {
    const identityKey = character.anilist_id ?? character.id ?? character.__priority.index;
    const isPrimaryProtagonist = Boolean(
      protagonist
      && identityKey === (protagonist.anilist_id ?? protagonist.id ?? protagonist.__priority.index)
    );
    const isPrimaryHeroine = Boolean(
      heroine
      && identityKey === (heroine.anilist_id ?? heroine.id ?? heroine.__priority.index)
    );

    let leadType = 'unknown';
    if (isPrimaryProtagonist) {
      leadType = 'protagonist';
    } else if (isPrimaryHeroine) {
      leadType = 'heroine';
    } else if (character.__priority.role === 'MAIN' && leadCandidateIds.has(identityKey)) {
      leadType = leadCandidates.length > 2 ? 'ensemble' : 'deuteragonist';
    }

    return {
      ...character,
      role: character.role || null,
      presentation_gender: character.presentation_gender,
      presentationGender: character.presentation_gender,
      is_primary_protagonist: isPrimaryProtagonist,
      isPrimaryProtagonist,
      is_primary_heroine: isPrimaryHeroine,
      isPrimaryHeroine,
      lead_type: leadType,
      leadType,
    };
  }).map((character) => {
    const nextCharacter = { ...character };
    delete nextCharacter.__priority;
    return nextCharacter;
  });
}
