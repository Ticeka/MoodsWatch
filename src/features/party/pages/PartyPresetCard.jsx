import React from 'react';
import { Mic2, Radio, WandSparkles, CheckCircle2 } from 'lucide-react';

export const PresetCard = React.memo(function PresetCard({ preset, selected, pick, onSelect }) {
  const icon = preset.id === 'party-classic'
    ? <Radio size={22} />
    : preset.id === 'song-typing'
      ? <Mic2 size={22} />
      : <WandSparkles size={22} />;

  return (
    <button
      type="button"
      className={`party-preset-card ${selected ? 'is-selected' : ''}`}
      onClick={() => onSelect(preset.id)}
      aria-pressed={selected}
    >
      <div className="party-preset-card-content">
        <div className="party-preset-header">
          <div className="party-preset-icon-wrapper">{icon}</div>
          {selected && <CheckCircle2 size={22} className="party-preset-check" />}
        </div>
        <strong>{pick(preset.labelTh, preset.label)}</strong>
        <p>{pick(preset.descriptionTh, preset.description)}</p>
        <div className="party-preset-card-footer">
          <span className="party-preset-tag">
            {preset.answerMode === 'choice'
              ? pick('4 ตัวเลือก', '4 choices')
              : preset.answerMode === 'typing'
                ? pick('พิมพ์ชื่อเพลง', 'Type song title')
                : pick('พิมพ์ 2 คำตอบ', 'Dual input')}
          </span>
        </div>
      </div>
    </button>
  );
});

export default PresetCard;
