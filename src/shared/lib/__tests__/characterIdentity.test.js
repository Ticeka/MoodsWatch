import { describe, expect, it } from 'vitest';
import { annotateCharacterIdentities, normalizePresentationGender } from '../characterIdentity.js';

describe('normalizePresentationGender', () => {
  it('normalizes known gender labels', () => {
    expect(normalizePresentationGender('Male')).toBe('male');
    expect(normalizePresentationGender('female')).toBe('female');
    expect(normalizePresentationGender('non-binary')).toBe('nonbinary');
    expect(normalizePresentationGender('')).toBe('unknown');
  });
});

describe('annotateCharacterIdentities', () => {
  it('marks protagonist and heroine from sorted main cast candidates', () => {
    const rows = annotateCharacterIdentities([
      { anilist_id: 1, name_full: 'Naruto Uzumaki', role: 'MAIN', sort_order: 0, gender: 'Male' },
      { anilist_id: 2, name_full: 'Sakura Haruno', role: 'MAIN', sort_order: 1, gender: 'Female' },
      { anilist_id: 3, name_full: 'Sasuke Uchiha', role: 'MAIN', sort_order: 2, gender: 'Male' },
      { anilist_id: 4, name_full: 'Kakashi', role: 'SUPPORTING', sort_order: 3, gender: 'Male' },
    ]);

    expect(rows.find((row) => row.anilist_id === 1)).toMatchObject({
      is_primary_protagonist: true,
      lead_type: 'protagonist',
      presentation_gender: 'male',
    });
    expect(rows.find((row) => row.anilist_id === 2)).toMatchObject({
      is_primary_heroine: true,
      lead_type: 'heroine',
      presentation_gender: 'female',
    });
    expect(rows.find((row) => row.anilist_id === 3)).toMatchObject({
      lead_type: 'ensemble',
    });
  });

  it('allows a female protagonist to also be the primary heroine when she leads the cast', () => {
    const rows = annotateCharacterIdentities([
      { anilist_id: 11, name_full: 'Maomao', role: 'MAIN', sort_order: 0, gender: 'Female' },
      { anilist_id: 12, name_full: 'Jinshi', role: 'MAIN', sort_order: 1, gender: 'Male' },
    ]);

    expect(rows.find((row) => row.anilist_id === 11)).toMatchObject({
      is_primary_protagonist: true,
      is_primary_heroine: true,
      lead_type: 'protagonist',
      presentation_gender: 'female',
    });
    expect(rows.find((row) => row.anilist_id === 12)).toMatchObject({
      lead_type: 'deuteragonist',
      is_primary_heroine: false,
    });
  });
});
