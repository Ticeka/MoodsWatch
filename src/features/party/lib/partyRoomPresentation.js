import { createPartySettings } from '@/features/party/lib/partyEngine';

export function serializePartySettingsSnapshot(settings) {
  return JSON.stringify(createPartySettings(settings || {}));
}

export function getPartyTemplateReasonText(reason) {
  if (!reason) {
    return '';
  }

  if (reason.code === 'insufficient_playable_songs') {
    return `${reason.label} needs at least ${reason.requiredCount} playable entries, but this template only has ${reason.actualCount}.`;
  }

  if (reason.code === 'insufficient_distinct_sources') {
    return `${reason.label} needs at least ${reason.requiredCount} distinct source titles with usable metadata, but this template only has ${reason.actualCount}.`;
  }

  if (reason.code === 'insufficient_answerable_songs') {
    return reason.message;
  }

  if (reason.code === 'missing_source_metadata') {
    return `${reason.actualCount} playable entr${reason.actualCount === 1 ? 'y is' : 'ies are'} still missing a usable source title.`;
  }

  if (reason.code === 'missing_song_titles') {
    return `${reason.actualCount} playable entr${reason.actualCount === 1 ? 'y is' : 'ies are'} still missing a title.`;
  }

  return reason.message;
}
