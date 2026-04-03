import React from 'react';
import { Filter, Layers3, Search, SortAsc } from 'lucide-react';
import { useLanguage } from '@/shared/contexts/LanguageContext';
import './PartyTemplates.css';

export function PartyTemplateFilters({
  currentTab,
  onTabChange,
  searchQuery,
  onSearchChange,
  filterMode,
  onFilterModeChange,
  setType,
  onSetTypeChange,
  sortBy,
  onSortByChange,
}) {
  const { pick } = useLanguage();

  const tabs = [
    { id: 'all', label: pick('ทั้งหมด', 'All sets') },
    { id: 'official', label: pick('แบบทางการ', 'Official') },
    { id: 'community', label: pick('จากชุมชน', 'Community') },
    { id: 'mine', label: pick('เซ็ตของฉัน', 'My sets') },
  ];

  return (
    <div className="party-template-controls">
      <div className="party-template-tabs">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`party-tab-btn ${currentTab === tab.id ? 'active' : ''}`}
            onClick={() => onTabChange(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="party-template-search-filters">
        <div className="party-search-box">
          <Search size={18} className="search-icon" />
          <input
            type="text"
            placeholder={pick('ค้นหาชื่อเซ็ต...', 'Search sets...')}
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>

        <div className="party-filter-select">
          <Filter size={16} />
          <select
            value={filterMode}
            onChange={(e) => onFilterModeChange(e.target.value)}
          >
            <option value="all">{pick('ทุกโหมด', 'All modes')}</option>
            <option value="quiz">{pick('เฉพาะ Music Quiz', 'Music Quiz only')}</option>
            <option value="vote">{pick('เฉพาะ Vote Battle', 'Vote Battle only')}</option>
            <option value="title-guess">{pick('เฉพาะทายชื่อเรื่อง', 'Guess the Title only')}</option>
            <option value="mixed">{pick('ใช้ได้ทั้งสองโหมด', 'Works in both modes')}</option>
          </select>
        </div>

        <div className="party-filter-select">
          <Layers3 size={16} />
          <select
            value={setType}
            onChange={(e) => onSetTypeChange(e.target.value)}
          >
            <option value="all">{pick('ทุกประเภทชุด', 'All set types')}</option>
            <option value="song-set">{pick('ชุดเพลง', 'Song sets')}</option>
            <option value="title-guess">{pick('ชุดทายชื่อเรื่อง', 'Guess the Title sets')}</option>
          </select>
        </div>

        <div className="party-filter-select">
          <SortAsc size={16} />
          <select
            value={sortBy}
            onChange={(e) => onSortByChange(e.target.value)}
          >
            <option value="recent">{pick('อัปเดตล่าสุด', 'Recently updated')}</option>
            <option value="popular">{pick('ยอดนิยม', 'Most liked')}</option>
            <option value="plays">{pick('เล่นบ่อยสุด', 'Most played')}</option>
            <option value="name">{pick('เรียงตามชื่อ', 'Name')}</option>
          </select>
        </div>
      </div>
    </div>
  );
}
