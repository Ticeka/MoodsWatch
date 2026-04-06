import { getTitleTypeMeta, isEpisodeBasedType } from '../../../shared/lib/titleType.js';

export function buildContinueCards(continueTitles = []) {
  return continueTitles.map((title) => {
    const unitLabel = getTitleTypeMeta(title.type).unitLabel;
    const currentProgress = isEpisodeBasedType(title.type)
      ? Number(title._listProgressEpisode || 0)
      : Number(title._listProgressChapter || 0);
    const totalUnits = isEpisodeBasedType(title.type) ? title.episodes : title.chapters;
    const targetUnits = isEpisodeBasedType(title.type)
      ? Number(title._targetEpisode || 0)
      : Number(title._targetChapter || 0);
    const nextUnit = currentProgress + 1;

    return {
      ...title,
      _continueUnitLabel: unitLabel,
      _continueCurrentProgress: currentProgress,
      _continueNextUnit: nextUnit,
      _continueRemaining: totalUnits ? Math.max(totalUnits - currentProgress, 0) : null,
      _continueTargetUnits: targetUnits || null,
      _continueSummary: totalUnits ? `${unitLabel} ${currentProgress} / ${totalUnits}` : `${unitLabel} ${currentProgress}`,
    };
  });
}
