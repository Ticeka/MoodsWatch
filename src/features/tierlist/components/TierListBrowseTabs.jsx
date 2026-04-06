import React from 'react';

export function TierListBrowseTabs({
  activeTabValue,
  onSelectTab,
  tabItems,
}) {
  return (
    <nav className="container tierlist-browse-tabs">
      {tabItems.map((tab) => {
        const isActive = activeTabValue === tab.value;

        return (
          <button
            key={tab.value}
            type="button"
            className={`tierlist-browse-tab${isActive ? ' is-active' : ''}`}
            onClick={() => onSelectTab(tab.value)}
          >
            {tab.icon}{tab.label}
          </button>
        );
      })}
    </nav>
  );
}
