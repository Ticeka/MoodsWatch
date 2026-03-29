import React from 'react';
import { Mic2, Radio, WandSparkles } from 'lucide-react';

export const PresetCard = React.memo(function PresetCard({ preset, selected, pick, onSelect }) {
  const icon = preset.id === 'party-classic'
    ? <Radio size={18} />
    : preset.id === 'song-typing'
      ? <Mic2 size={18} />
      : <WandSparkles size={18} />;

  return (
    <button
      type="button"
      className={`party-preset-card ${selected ? 'is-selected' : ''}`}
      onClick={() => onSelect(preset.id)}
      aria-pressed={selected}
    >
      <span className="party-preset-icon">{icon}</span>
      <strong>{pick(preset.labelTh, preset.label)}</strong>
      <p>{pick(preset.descriptionTh, preset.description)}</p>
      <span className="party-preset-tag">
        {preset.answerMode === 'choice'
          ? pick('4 ตัวเลือก', '4 choices')
          : preset.answerMode === 'typing'
            ? pick('พิมพ์ชื่อเพลง', 'Type song title')
            : pick('พิมพ์ 2 คำตอบ', 'Dual input')}
      </span>
    </button>
  );
});

export default PresetCard;
