const CANVAS_SIZE = 400;
const PADDING = 36;

function wrapText(ctx, text, maxWidth) {
  const rawWords = text.split(/\s+/);
  const lines = [];
  let current = '';

  for (const rawWord of rawWords) {
    if (!rawWord) continue;

    // If a single "word" overflows (Thai text, long URL, etc.) → break by character
    if (ctx.measureText(rawWord).width > maxWidth) {
      if (current) { lines.push(current); current = ''; }
      let charBuf = '';
      for (const ch of rawWord) {
        const test = charBuf + ch;
        if (ctx.measureText(test).width > maxWidth && charBuf) {
          lines.push(charBuf);
          charBuf = ch;
        } else {
          charBuf = test;
        }
      }
      current = charBuf;
      continue;
    }

    const test = current ? `${current} ${rawWord}` : rawWord;
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current);
      current = rawWord;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function resolveFontSize(ctx, text, maxWidth, maxHeight) {
  for (let size = 64; size >= 12; size -= 2) {
    ctx.font = `bold ${size}px 'Noto Sans Thai', 'Sarabun', 'Noto Sans', sans-serif`;
    const lines = wrapText(ctx, text, maxWidth);
    const lineHeight = size * 1.5;
    if (lines.length * lineHeight <= maxHeight) {
      return { size, lines, lineHeight };
    }
  }
  ctx.font = `bold 12px 'Noto Sans Thai', 'Sarabun', sans-serif`;
  const lines = wrapText(ctx, text, maxWidth);
  return { size: 12, lines, lineHeight: 18 };
}

export function generateTextTileImage(text, { bgColor = '#ffffff', fgColor = '#111111' } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = CANVAS_SIZE;
  canvas.height = CANVAS_SIZE;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

  const maxWidth = CANVAS_SIZE - PADDING * 2;
  const maxHeight = CANVAS_SIZE - PADDING * 2;
  const normalized = text.trim() || ' ';

  const { lines, lineHeight } = resolveFontSize(ctx, normalized, maxWidth, maxHeight);

  ctx.fillStyle = fgColor;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const totalHeight = lines.length * lineHeight;
  const startY = (CANVAS_SIZE - totalHeight) / 2 + lineHeight / 2;

  lines.forEach((line, i) => {
    ctx.fillText(line, CANVAS_SIZE / 2, startY + i * lineHeight);
  });

  return canvas.toDataURL('image/png');
}
