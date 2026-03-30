import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Radio, LibrarySquare, Settings2, Play, Users } from 'lucide-react';
import { useLanguage } from '@/shared/contexts/LanguageContext';
import { Button } from '@/shared/components/ui/Button';
import '../pages/Party.css';
import '../components/PartyTemplates.css';

// MOCK DATA for Templates in Dropdown
const MOCK_TEMPLATES = [
  { id: 'tpl-101', name: 'Best 2010s OP', modeScope: 'all', itemCount: 42 },
  { id: 'tpl-102', name: 'Sad ED Night', modeScope: 'vote', itemCount: 24 },
  { id: 'tpl-103', name: 'Top Jump Classics', modeScope: 'quiz', itemCount: 60 },
];

export function PartyRoomCreatorMock() {
  const navigate = useNavigate();
  const { pick } = useLanguage();
  
  const [settings, setSettings] = useState({
    modeType: 'quiz', // 'quiz' or 'vote'
    templateId: 'tpl-101',
    roundCount: 10,
    timePerRoundSec: 15,
    revealSec: 10,
    voteSec: 10,
    showLiveScores: true,
    randomOrder: true
  });

  const selectedTemplate = MOCK_TEMPLATES.find(t => t.id === settings.templateId) || MOCK_TEMPLATES[0];

  const handleTemplateChange = (e) => {
    const newTemplateId = e.target.value;
    const template = MOCK_TEMPLATES.find(t => t.id === newTemplateId);
    
    // Auto-adjust mode if template doesn't support current mode
    let newMode = settings.modeType;
    if (template.modeScope !== 'all' && template.modeScope !== settings.modeType) {
      newMode = template.modeScope;
    }

    setSettings({
      ...settings,
      templateId: newTemplateId,
      modeType: newMode
    });
  };

  const handleCreate = (e) => {
    e.preventDefault();
    alert(`Creating Room with Template: ${selectedTemplate.name} in Mode: ${settings.modeType}`);
  };

  return (
    <div className="party-page is-hub">
      <section className="container party-hub-shell">
        <header className="party-hub-header">
          <span className="party-kicker"><Radio size={16} />Music Guess Party (Mockup)</span>
          <h1>{pick('เริ่มเล่นเกมปาร์ตี้', 'Start Party Match')}</h1>
          <p>{pick('เลือกเทมเพลต กำหนดกติกา และสร้างห้อง', 'Select a template, set the rules, and create a room.')}</p>
        </header>

        <div className="party-builder-layout--refresh">
          <form className="party-builder-panel--refresh" onSubmit={handleCreate}>
            <h2 className="party-builder-title">{pick('ตั้งค่าห้องใหม่', 'Room Settings')}</h2>

            {/* Template Selection Box (Primary Focus) */}
            <div className="party-field" style={{ background: 'var(--color-surface)', padding: '1rem', borderRadius: '12px', border: '1px solid var(--color-primary)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <span style={{ fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <LibrarySquare size={18} color="var(--color-primary)" />
                  {pick('เลือกเทมเพลตเพลง', 'Select Template')}
                </span>
                <button 
                  type="button"
                  className="btn-secondary" 
                  style={{ padding: '0.25rem 0.75rem', fontSize: '0.85rem' }}
                  onClick={() => navigate('/party/templates')}
                >
                  {pick('หาเทมเพลตเพิ่มเติม', 'Browse Templates')}
                </button>
              </div>
              
              <select 
                value={settings.templateId}
                onChange={handleTemplateChange}
                style={{ width: '100%', padding: '1rem', fontSize: '1.1rem', borderRadius: '8px', background: 'var(--color-surface-hover)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}
              >
                {MOCK_TEMPLATES.map(t => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.itemCount} {pick('เพลง', 'songs')} • {t.modeScope === 'all' ? 'Quiz/Vote' : t.modeScope})
                  </option>
                ))}
              </select>
            </div>

            <div className="party-field">
              <span>{pick('โหมดการแข่งขัน', 'Match Type')}</span>
              <div className="party-toggle-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                <label className={`party-toggle--card ${selectedTemplate.modeScope === 'vote' ? 'disabled' : ''}`}>
                  <input
                    type="radio"
                    name="mainModeType"
                    checked={settings.modeType === 'quiz'}
                    onChange={() => setSettings({ ...settings, modeType: 'quiz' })}
                    disabled={selectedTemplate.modeScope === 'vote'}
                  />
                  <span>{pick('Music Quiz', 'Music Quiz')}</span>
                </label>
                <label className={`party-toggle--card ${selectedTemplate.modeScope === 'quiz' ? 'disabled' : ''}`}>
                  <input
                    type="radio"
                    name="mainModeType"
                    checked={settings.modeType === 'vote'}
                    onChange={() => setSettings({ ...settings, modeType: 'vote' })}
                    disabled={selectedTemplate.modeScope === 'quiz'}
                  />
                  <span>{pick('Vote Battle 🔥', 'Vote Battle 🔥')}</span>
                </label>
              </div>
              {selectedTemplate.modeScope !== 'all' && (
                <small style={{ color: 'var(--color-error, #E53E3E)', marginTop: '0.5rem', display: 'block' }}>
                  {pick(`เทมเพลตนี้รองรับเฉพาะโหมด ${selectedTemplate.modeScope} เท่านั้น`, `This template only supports ${selectedTemplate.modeScope} mode.`)}
                </small>
              )}
            </div>

            <div className="party-inline-fields">
              <label className="party-field">
                <span>{settings.modeType === 'vote' ? pick('Starting songs', 'Starting songs') : pick('Rounds', 'Rounds')}</span>
                <select
                  value={settings.roundCount}
                  onChange={(e) => setSettings({ ...settings, roundCount: Number(e.target.value) })}
                >
                  {(settings.modeType === 'vote' ? [2, 4, 8, 16] : [5, 10, 15, 20]).map((count) => (
                    <option key={count} value={count}>{count}</option>
                  ))}
                </select>
              </label>
              <label className="party-field">
                <span>{settings.modeType === 'vote' ? pick('เวลาเพลงสูงสุด', 'Max Time') : pick('เวลาเล่นเพลง', 'Clip Time')}</span>
                <select
                  value={settings.timePerRoundSec}
                  onChange={(e) => setSettings({ ...settings, timePerRoundSec: Number(e.target.value) })}
                >
                  {[10, 15, 20, 30, 45, 60].map((s) => (
                    <option key={s} value={s}>{s}s</option>
                  ))}
                </select>
              </label>
              <label className="party-field">
                <span>{pick('เวลาเฉลย', 'Reveal Time')}</span>
                <select
                  value={settings.revealSec}
                  onChange={(e) => setSettings({ ...settings, revealSec: Number(e.target.value) })}
                >
                  {[6, 8, 10, 12, 15].map((s) => (
                    <option key={s} value={s}>{s}s</option>
                  ))}
                </select>
              </label>
            </div>

            {/* Summary */}
            <div className="party-settings-summary party-settings-summary--compact" style={{ background: 'var(--color-surface-hover)', padding: '1rem', borderRadius: '12px', marginTop: '1rem' }}>
              <article className="party-stat-pill" style={{ gridColumn: 'span 2', background: 'var(--color-primary)' }}>
                <strong>{selectedTemplate.name}</strong>
                <span>{pick('Template', 'Template')}</span>
              </article>
              <article className="party-stat-pill">
                <strong>{settings.modeType === 'vote' ? 'Vote Battle' : 'Quiz'}</strong>
                <span>{pick('Mode', 'Mode')}</span>
              </article>
              <article className="party-stat-pill">
                <strong>{settings.roundCount}</strong>
                <span>{settings.modeType === 'vote' ? pick('Songs', 'Songs') : pick('Rounds', 'Rounds')}</span>
              </article>
            </div>

            <Button className="party-gradient-action" size="large" type="submit" style={{ marginTop: '1.5rem' }}>
              <Play fill="currentColor" size={20} />
              {pick('สร้างห้อง (Create Room)', 'Create Room')}
            </Button>
          </form>
        </div>
      </section>
    </div>
  );
}
