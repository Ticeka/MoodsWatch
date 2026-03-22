import React, { useCallback, useState } from 'react';
import { X, Download } from 'lucide-react';
import { BRAND_DOMAIN, BRAND_NAME } from '@/shared/config/brand';

function escapeXml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function wrapText(text, maxCharsPerLine, maxLines) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (test.length > maxCharsPerLine && line) {
      lines.push(line);
      line = word;
      if (lines.length >= maxLines) break;
    } else {
      line = test;
    }
  }
  if (line && lines.length < maxLines) lines.push(line);
  return lines;
}

const STATUS_COLORS = {
  watching: '#10b981',
  reading: '#10b981',
  planned: '#6366f1',
  'on-hold': '#f59e0b',
  completed: '#e85d75',
  dropped: '#ef4444',
};

const STATUS_LABELS = {
  watching: 'WATCHING',
  reading: 'READING',
  planned: 'PLANNED',
  'on-hold': 'ON HOLD',
  completed: 'COMPLETED',
  dropped: 'DROPPED',
};

function buildShareSvg(title, listItem, language) {
  const rawTitle = (language === 'th' ? title.title_th : null) || title.title_en || title.title_th || 'Unknown Title';
  const score = listItem?.score != null ? Math.round(listItem.score / 10) : null;
  const status = listItem?.status || '';
  const progressEp = listItem?.progressEpisode ?? null;
  const progressCh = listItem?.progressChapter ?? null;
  const progress = progressEp ?? progressCh;
  const progressUnit = progressEp != null ? 'EP' : 'CH';
  const total = progressEp != null ? title.episodes : progressCh != null ? title.chapters : null;

  const statusColor = STATUS_COLORS[status] || '#888';
  const statusLabel = STATUS_LABELS[status] || status.toUpperCase();
  const titleLines = wrapText(rawTitle, 26, 3);
  const titleFontSize = titleLines.length > 2 ? 36 : titleLines.length > 1 ? 40 : 44;

  const starsRow = score != null
    ? Array.from({ length: 10 }, (_, i) => i < score ? '★' : '☆').join('')
    : '';

  const hasScore = score != null;
  const hasProgress = progress != null;

  // Layout sections
  const scoreX = 48;
  const progressX = hasScore ? 310 : 48;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="450" viewBox="0 0 800 450">
  <defs>
    <linearGradient id="bgG" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#fff8f5"/>
      <stop offset="100%" stop-color="#fce8ee"/>
    </linearGradient>
    <linearGradient id="accentG" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#e85d75"/>
      <stop offset="100%" stop-color="#f472b6"/>
    </linearGradient>
  </defs>

  <!-- Background -->
  <rect width="800" height="450" fill="url(#bgG)"/>

  <!-- Decorative circles -->
  <circle cx="700" cy="-30" r="200" fill="#e85d75" opacity="0.05"/>
  <circle cx="780" cy="490" r="160" fill="#f472b6" opacity="0.07"/>
  <circle cx="-30" cy="430" r="110" fill="#e85d75" opacity="0.04"/>

  <!-- Left accent bar -->
  <rect x="0" y="0" width="8" height="450" fill="url(#accentG)"/>

  <!-- Brand top-right -->
  <text x="762" y="36" font-family="'Helvetica Neue',Arial,sans-serif" font-size="13" font-weight="800" fill="#e85d75" text-anchor="end" letter-spacing="2.5">${escapeXml(BRAND_NAME.toUpperCase())}</text>

  <!-- Status badge -->
  <rect x="48" y="44" width="${statusLabel.length * 8.5 + 28}" height="30" rx="15" fill="${statusColor}"/>
  <text x="${48 + (statusLabel.length * 8.5 + 28) / 2}" y="64" font-family="'Helvetica Neue',Arial,sans-serif" font-size="11" font-weight="800" fill="white" text-anchor="middle" letter-spacing="1.5">${escapeXml(statusLabel)}</text>

  <!-- Title lines -->
  ${titleLines.map((line, i) => `<text x="48" y="${112 + i * (titleFontSize + 8)}" font-family="'Helvetica Neue',Arial,sans-serif" font-size="${titleFontSize}" font-weight="900" fill="#1a1a2e">${escapeXml(line)}</text>`).join('\n  ')}

  <!-- Divider -->
  <line x1="48" y1="258" x2="420" y2="258" stroke="#e85d75" stroke-width="1.5" opacity="0.3"/>

  <!-- Score block -->
  ${hasScore ? `
  <text x="${scoreX}" y="292" font-family="'Helvetica Neue',Arial,sans-serif" font-size="11" font-weight="700" fill="#aaa" letter-spacing="2.5">MY SCORE</text>
  <text x="${scoreX}" y="348" font-family="'Helvetica Neue',Arial,sans-serif" font-size="64" font-weight="900" fill="#1a1a2e" letter-spacing="-2">${score}</text>
  <text x="${scoreX + (score >= 10 ? 88 : 52)}" y="336" font-family="'Helvetica Neue',Arial,sans-serif" font-size="18" fill="#bbb" font-weight="600">/ 10</text>
  <text x="${scoreX}" y="374" font-family="'Helvetica Neue',Arial,sans-serif" font-size="20" fill="#e85d75" letter-spacing="2">${starsRow}</text>
  ` : `
  <text x="${scoreX}" y="310" font-family="'Helvetica Neue',Arial,sans-serif" font-size="18" fill="#ccc" font-weight="600">Not yet rated</text>
  `}

  <!-- Progress block -->
  ${hasProgress ? `
  <text x="${progressX}" y="292" font-family="'Helvetica Neue',Arial,sans-serif" font-size="11" font-weight="700" fill="#aaa" letter-spacing="2.5">PROGRESS</text>
  <text x="${progressX}" y="348" font-family="'Helvetica Neue',Arial,sans-serif" font-size="64" font-weight="900" fill="#1a1a2e" letter-spacing="-2">${progress}</text>
  <text x="${progressX + String(progress).length * 36}" y="336" font-family="'Helvetica Neue',Arial,sans-serif" font-size="18" fill="#bbb" font-weight="600">${total != null ? `/ ${total}` : ''} ${escapeXml(progressUnit)}</text>
  ` : ''}

  <!-- Bottom branding -->
  <text x="48" y="426" font-family="'Helvetica Neue',Arial,sans-serif" font-size="12" fill="#ccc" letter-spacing="0.5">${escapeXml(BRAND_DOMAIN)}  •  Track your anime &amp; manga journey</text>
</svg>`;
}

async function svgToPngBlob(svgString, width, height) {
  return new Promise((resolve) => {
    const dataUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgString);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      canvas.toBlob(resolve, 'image/png');
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function ShareCardModal({ title, listItem, language, onClose }) {
  const [downloading, setDownloading] = useState(false);
  const svgString = buildShareSvg(title, listItem, language);
  const previewSrc = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgString);
  const filename = `${BRAND_NAME.toLowerCase()}-${title.slug || title.id || 'card'}.png`;

  const handleDownload = useCallback(async () => {
    setDownloading(true);
    try {
      const blob = await svgToPngBlob(svgString, 800, 450);
      if (blob) {
        downloadBlob(blob, filename);
      }
    } finally {
      setDownloading(false);
    }
  }, [svgString, filename]);

  return (
    <div className="share-modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="share-modal" onClick={(e) => e.stopPropagation()}>
        <div className="share-modal-header">
          <h3>Share Card</h3>
          <button className="share-modal-close" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="share-modal-preview">
          <img
            src={previewSrc}
            alt="Share card preview"
            className="share-card-img"
            width="800"
            height="450"
          />
        </div>
        <div className="share-modal-actions">
          <button
            className="share-download-btn"
            onClick={handleDownload}
            disabled={downloading}
          >
            <Download size={15} />
            {downloading ? 'กำลังโหลด...' : 'Download PNG'}
          </button>
        </div>
      </div>
    </div>
  );
}
