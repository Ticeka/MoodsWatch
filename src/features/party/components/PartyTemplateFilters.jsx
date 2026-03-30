import React from 'react';
import { Search, Filter, SortAsc } from 'lucide-react';
import { useLanguage } from '@/shared/contexts/LanguageContext';
import './PartyTemplates.css';

export function PartyTemplateFilters({ 
  currentTab, 
  onTabChange, 
  searchQuery, 
  onSearchChange,
  filterMode,
  onFilterModeChange
}) {
  const { pick } = useLanguage();

  const tabs = [
    { id: 'all', label: pick('ทั้งหมด', 'All Templates') },
    { id: 'official', label: pick('แบบทางการ', 'Official') },
    { id: 'community', label: pick('จากชุมชน', 'Community') },
    { id: 'mine', label: pick('เทมเพลตของฉัน', 'My Templates') },
  ];

  return (
    <div className="party-template-controls">
      <div className="party-template-tabs">
        {tabs.map(tab => (
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
            placeholder={pick('ค้นหาเทมเพลต...', 'Search templates...')}
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
            <option value="all">{pick('ทุกโหมด', 'All Modes')}</option>
            <option value="quiz">{pick('Music Quiz เท่านั้น', 'Music Quiz Only')}</option>
            <option value="vote">{pick('Vote Battle เท่านั้น', 'Vote Battle Only')}</option>
            <option value="mixed">{pick('เล่นได้ทั้งคู่', 'Playable on both')}</option>
          </select>
        </div>
      </div>
    </div>
  );
}
