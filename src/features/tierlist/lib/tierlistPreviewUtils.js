import { getTitleArtwork } from '@/shared/lib/titleArtwork';

export const TEMPLATE_PREVIEW_MIN_SCALE = 1;
export const TEMPLATE_PREVIEW_MAX_SCALE = 4;
export const TEMPLATE_PREVIEW_MAX_OFFSET = 50;
export const TEMPLATE_PREVIEW_ASPECT_RATIO = 5 / 3;

export function normalizeTemplatePreviewFit(value) {
  return String(value || '').trim().toLowerCase() === 'contain' ? 'contain' : 'cover';
}

export function normalizeTemplatePreviewPosition(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'top' || normalized === 'bottom') {
    return normalized;
  }
  return 'center';
}

export function clampTemplatePreviewOffset(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  return Math.max(-TEMPLATE_PREVIEW_MAX_OFFSET, Math.min(TEMPLATE_PREVIEW_MAX_OFFSET, numeric));
}

export function normalizeTemplatePreviewScale(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return TEMPLATE_PREVIEW_MIN_SCALE;
  }
  return Math.max(TEMPLATE_PREVIEW_MIN_SCALE, Math.min(TEMPLATE_PREVIEW_MAX_SCALE, numeric));
}

export function areTemplatePreviewTransformsEqual(left = {}, right = {}) {
  return Math.abs(
    normalizeTemplatePreviewScale(left?.previewArtworkScale) - normalizeTemplatePreviewScale(right?.previewArtworkScale)
  ) < 0.01
    && Math.abs(
      clampTemplatePreviewOffset(left?.previewArtworkOffsetX) - clampTemplatePreviewOffset(right?.previewArtworkOffsetX)
    ) < 0.1
    && Math.abs(
      clampTemplatePreviewOffset(left?.previewArtworkOffsetY) - clampTemplatePreviewOffset(right?.previewArtworkOffsetY)
    ) < 0.1;
}

export function getTemplatePreviewViewportBounds({
  imageWidth,
  imageHeight,
  previewArtworkScale,
  previewArtworkOffsetX,
  previewArtworkOffsetY,
} = {}) {
  const normalizedWidth = Number(imageWidth);
  const normalizedHeight = Number(imageHeight);

  if (!(normalizedWidth > 0) || !(normalizedHeight > 0)) {
    return null;
  }

  const imageAspect = normalizedWidth / normalizedHeight;
  const scale = normalizeTemplatePreviewScale(previewArtworkScale);
  const baseRenderedWidth = imageAspect >= TEMPLATE_PREVIEW_ASPECT_RATIO ? imageAspect : TEMPLATE_PREVIEW_ASPECT_RATIO;
  const baseRenderedHeight = imageAspect >= TEMPLATE_PREVIEW_ASPECT_RATIO ? 1 : TEMPLATE_PREVIEW_ASPECT_RATIO / imageAspect;
  const renderedWidth = baseRenderedWidth * scale;
  const renderedHeight = baseRenderedHeight * scale;
  const viewportWidth = Math.min(1, TEMPLATE_PREVIEW_ASPECT_RATIO / renderedWidth);
  const viewportHeight = Math.min(1, 1 / renderedHeight);
  const maxOriginX = Math.max(0, 1 - viewportWidth);
  const maxOriginY = Math.max(0, 1 - viewportHeight);
  const positionX = 0.5 + (clampTemplatePreviewOffset(previewArtworkOffsetX) / 100);
  const positionY = 0.5 + (clampTemplatePreviewOffset(previewArtworkOffsetY) / 100);

  return {
    imageAspect,
    viewportWidth,
    viewportHeight,
    maxOriginX,
    maxOriginY,
    originX: maxOriginX * positionX,
    originY: maxOriginY * positionY,
  };
}

export function getTemplatePreviewViewportWidthForScale(imageAspect, previewArtworkScale) {
  const normalizedAspect = Number(imageAspect);
  if (!(normalizedAspect > 0)) {
    return 1;
  }

  const scale = normalizeTemplatePreviewScale(previewArtworkScale);
  if (normalizedAspect >= TEMPLATE_PREVIEW_ASPECT_RATIO) {
    return Math.min(1, TEMPLATE_PREVIEW_ASPECT_RATIO / (normalizedAspect * scale));
  }
  return Math.min(1, 1 / scale);
}

export function getTemplatePreviewViewportHeightForWidth(imageAspect, viewportWidth) {
  const normalizedAspect = Number(imageAspect);
  const normalizedWidth = Number(viewportWidth);
  if (!(normalizedAspect > 0) || !(normalizedWidth > 0)) {
    return 1;
  }

  return normalizedWidth * (normalizedAspect / TEMPLATE_PREVIEW_ASPECT_RATIO);
}

export function getTemplatePreviewScaleFromViewportWidth(imageAspect, viewportWidth) {
  const normalizedAspect = Number(imageAspect);
  const normalizedWidth = Number(viewportWidth);
  if (!(normalizedAspect > 0) || !(normalizedWidth > 0)) {
    return TEMPLATE_PREVIEW_MIN_SCALE;
  }

  if (normalizedAspect >= TEMPLATE_PREVIEW_ASPECT_RATIO) {
    return normalizeTemplatePreviewScale(TEMPLATE_PREVIEW_ASPECT_RATIO / (normalizedAspect * normalizedWidth));
  }

  return normalizeTemplatePreviewScale(1 / normalizedWidth);
}

export function getContainedImageRect(containerWidth, containerHeight, imageAspect) {
  const width = Number(containerWidth);
  const height = Number(containerHeight);

  if (!(width > 0) || !(height > 0) || !(imageAspect > 0)) {
    return null;
  }

  const containerAspect = width / height;
  if (imageAspect > containerAspect) {
    const displayHeight = width / imageAspect;
    return {
      left: 0,
      top: (height - displayHeight) / 2,
      width,
      height: displayHeight,
    };
  }

  const displayWidth = height * imageAspect;
  return {
    left: (width - displayWidth) / 2,
    top: 0,
    width: displayWidth,
    height,
  };
}

export function getTemplatePreviewOffsetFromViewportOrigin(origin, maxOrigin) {
  if (!(maxOrigin > 0)) {
    return 0;
  }

  const ratio = Math.max(0, Math.min(1, Number(origin) / maxOrigin));
  return clampTemplatePreviewOffset((ratio - 0.5) * 100);
}

export function getTemplatePreviewPositionCss(position) {
  const normalized = normalizeTemplatePreviewPosition(position);
  if (normalized === 'top') {
    return 'center top';
  }
  if (normalized === 'bottom') {
    return 'center bottom';
  }
  return 'center center';
}

export function getTemplatePreviewMediaStyle(settings = {}) {
  return {
    '--tierlist-cover-fit': normalizeTemplatePreviewFit(settings?.previewArtworkFit),
    '--tierlist-cover-position': getTemplatePreviewPositionCss(settings?.previewArtworkPosition),
    '--tierlist-cover-offset-x': `${clampTemplatePreviewOffset(settings?.previewArtworkOffsetX)}%`,
    '--tierlist-cover-offset-y': `${clampTemplatePreviewOffset(settings?.previewArtworkOffsetY)}%`,
    '--tierlist-cover-scale': String(normalizeTemplatePreviewScale(settings?.previewArtworkScale)),
  };
}

export function getTierEntityArtworkSource(entity) {
  return String(entity?.cover || entity?.image_url || getTitleArtwork(entity) || '').trim();
}

export function getTemplatePreviewArtworkSource(template, fallbackEntity = null) {
  const templatePreviewUrl = String(template?.previewArtworkUrl || '').trim();
  if (templatePreviewUrl) {
    return templatePreviewUrl;
  }

  const customItemArtwork = (template?.customItems || [])
    .map((item) => String(item?.imageUrl || item?.cover || item?.image_url || '').trim())
    .find(Boolean);
  if (customItemArtwork) {
    return customItemArtwork;
  }

  return fallbackEntity ? getTierEntityArtworkSource(fallbackEntity) : '';
}
