import { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { uploadTierlistImage } from '@/features/tierlist/api';
import {
  areTemplatePreviewTransformsEqual,
  clampTemplatePreviewOffset,
  getContainedImageRect,
  getTemplatePreviewMediaStyle,
  getTemplatePreviewOffsetFromViewportOrigin,
  getTemplatePreviewScaleFromViewportWidth,
  getTemplatePreviewViewportBounds,
  getTemplatePreviewViewportHeightForWidth,
  getTemplatePreviewViewportWidthForScale,
  normalizeTemplatePreviewScale,
  TEMPLATE_PREVIEW_ASPECT_RATIO,
  TEMPLATE_PREVIEW_MAX_SCALE,
  TEMPLATE_PREVIEW_MIN_SCALE,
} from '@/features/tierlist/lib/tierlistPreviewUtils';

export function useTierListCreateCoverEditor({
  pick,
  userId,
}) {
  const [coverImageUrl, setCoverImageUrl] = useState('');
  const [coverImageScale, setCoverImageScale] = useState(TEMPLATE_PREVIEW_MIN_SCALE);
  const [coverImageOffsetX, setCoverImageOffsetX] = useState(0);
  const [coverImageOffsetY, setCoverImageOffsetY] = useState(0);
  const [draftCoverImageScale, setDraftCoverImageScale] = useState(TEMPLATE_PREVIEW_MIN_SCALE);
  const [draftCoverImageOffsetX, setDraftCoverImageOffsetX] = useState(0);
  const [draftCoverImageOffsetY, setDraftCoverImageOffsetY] = useState(0);
  const [isCoverEditorOpen, setIsCoverEditorOpen] = useState(false);
  const [isUploadingCover, setIsUploadingCover] = useState(false);
  const coverPreviewDragRef = useRef(null);
  const coverFileInputRef = useRef(null);
  const coverStageRef = useRef(null);
  const [coverStageSize, setCoverStageSize] = useState({ width: 0, height: 0 });
  const [coverImageNaturalSize, setCoverImageNaturalSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    if (!coverImageUrl) {
      setCoverImageNaturalSize({ width: 0, height: 0 });
      setCoverStageSize({ width: 0, height: 0 });
      coverPreviewDragRef.current = null;
    }
  }, [coverImageUrl]);

  useEffect(() => {
    if (!isCoverEditorOpen) {
      return undefined;
    }

    const stageNode = coverStageRef.current;
    if (!stageNode) {
      return undefined;
    }

    const updateStageSize = () => {
      const bounds = stageNode.getBoundingClientRect();
      setCoverStageSize({
        width: bounds.width || 0,
        height: bounds.height || 0,
      });
    };

    updateStageSize();

    if (typeof ResizeObserver === 'function') {
      const observer = new ResizeObserver(() => updateStageSize());
      observer.observe(stageNode);
      return () => observer.disconnect();
    }

    window.addEventListener('resize', updateStageSize);
    return () => window.removeEventListener('resize', updateStageSize);
  }, [coverImageUrl, isCoverEditorOpen]);

  const hasPendingCoverFrameChanges = useMemo(
    () => !areTemplatePreviewTransformsEqual(
      {
        previewArtworkScale: draftCoverImageScale,
        previewArtworkOffsetX: draftCoverImageOffsetX,
        previewArtworkOffsetY: draftCoverImageOffsetY,
      },
      {
        previewArtworkScale: coverImageScale,
        previewArtworkOffsetX: coverImageOffsetX,
        previewArtworkOffsetY: coverImageOffsetY,
      }
    ),
    [
      coverImageOffsetX,
      coverImageOffsetY,
      coverImageScale,
      draftCoverImageOffsetX,
      draftCoverImageOffsetY,
      draftCoverImageScale,
    ]
  );

  const savedCoverPreviewStyle = useMemo(
    () => getTemplatePreviewMediaStyle({
      previewArtworkFit: 'cover',
      previewArtworkPosition: 'center',
      previewArtworkScale: coverImageScale,
      previewArtworkOffsetX: coverImageOffsetX,
      previewArtworkOffsetY: coverImageOffsetY,
    }),
    [coverImageOffsetX, coverImageOffsetY, coverImageScale]
  );

  const draftCoverPreviewStyle = useMemo(
    () => getTemplatePreviewMediaStyle({
      previewArtworkFit: 'cover',
      previewArtworkPosition: 'center',
      previewArtworkScale: draftCoverImageScale,
      previewArtworkOffsetX: draftCoverImageOffsetX,
      previewArtworkOffsetY: draftCoverImageOffsetY,
    }),
    [draftCoverImageOffsetX, draftCoverImageOffsetY, draftCoverImageScale]
  );

  const draftCoverViewportBounds = useMemo(
    () => getTemplatePreviewViewportBounds({
      imageWidth: coverImageNaturalSize.width,
      imageHeight: coverImageNaturalSize.height,
      previewArtworkScale: draftCoverImageScale,
      previewArtworkOffsetX: draftCoverImageOffsetX,
      previewArtworkOffsetY: draftCoverImageOffsetY,
    }),
    [
      coverImageNaturalSize.height,
      coverImageNaturalSize.width,
      draftCoverImageOffsetX,
      draftCoverImageOffsetY,
      draftCoverImageScale,
    ]
  );

  const draftCoverStageCropRect = useMemo(() => {
    if (!draftCoverViewportBounds) {
      return null;
    }

    const imageRect = getContainedImageRect(
      coverStageSize.width,
      coverStageSize.height,
      draftCoverViewportBounds.imageAspect
    );

    if (!imageRect) {
      return null;
    }

    return {
      left: imageRect.left + (draftCoverViewportBounds.originX * imageRect.width),
      top: imageRect.top + (draftCoverViewportBounds.originY * imageRect.height),
      width: draftCoverViewportBounds.viewportWidth * imageRect.width,
      height: draftCoverViewportBounds.viewportHeight * imageRect.height,
    };
  }, [coverStageSize.height, coverStageSize.width, draftCoverViewportBounds]);

  const handleUploadCover = async (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    if (!userId) {
      toast.error(pick('กรุณาเข้าสู่ระบบก่อนอัปโหลดรูป', 'Please sign in before uploading images'));
      event.target.value = '';
      return;
    }

    setIsUploadingCover(true);
    try {
      const uploadedUrl = await uploadTierlistImage(file, userId, 'tierlist-cover');
      setCoverImageUrl(uploadedUrl);
      setCoverImageScale(TEMPLATE_PREVIEW_MIN_SCALE);
      setCoverImageOffsetX(0);
      setCoverImageOffsetY(0);
      setDraftCoverImageScale(TEMPLATE_PREVIEW_MIN_SCALE);
      setDraftCoverImageOffsetX(0);
      setDraftCoverImageOffsetY(0);
      setIsCoverEditorOpen(true);
      setCoverImageNaturalSize({ width: 0, height: 0 });
      setCoverStageSize({ width: 0, height: 0 });
      toast.success(pick('อัปโหลดรูปหน้าปกแล้ว', 'Cover image uploaded'));
    } catch (error) {
      toast.error(error?.message || pick('อัปโหลดรูปหน้าปกไม่สำเร็จ', 'Failed to upload cover image'));
    } finally {
      setIsUploadingCover(false);
      event.target.value = '';
    }
  };

  const resetCoverPreviewFrame = () => {
    setDraftCoverImageScale(TEMPLATE_PREVIEW_MIN_SCALE);
    setDraftCoverImageOffsetX(0);
    setDraftCoverImageOffsetY(0);
  };

  const openCoverEditor = () => {
    setDraftCoverImageScale(coverImageScale);
    setDraftCoverImageOffsetX(coverImageOffsetX);
    setDraftCoverImageOffsetY(coverImageOffsetY);
    setIsCoverEditorOpen(true);
  };

  const closeCoverEditor = () => {
    setDraftCoverImageScale(coverImageScale);
    setDraftCoverImageOffsetX(coverImageOffsetX);
    setDraftCoverImageOffsetY(coverImageOffsetY);
    setIsCoverEditorOpen(false);
    coverPreviewDragRef.current = null;
  };

  const handleDraftCoverImageOffsetXChange = (value) => {
    setDraftCoverImageOffsetX(clampTemplatePreviewOffset(value));
  };

  const handleDraftCoverImageOffsetYChange = (value) => {
    setDraftCoverImageOffsetY(clampTemplatePreviewOffset(value));
  };

  const saveCoverPreviewFrame = () => {
    if (!coverImageUrl) {
      return;
    }

    const nextScale = normalizeTemplatePreviewScale(draftCoverImageScale);
    const nextOffsetX = clampTemplatePreviewOffset(draftCoverImageOffsetX);
    const nextOffsetY = clampTemplatePreviewOffset(draftCoverImageOffsetY);
    setCoverImageScale(nextScale);
    setCoverImageOffsetX(nextOffsetX);
    setCoverImageOffsetY(nextOffsetY);
    setDraftCoverImageScale(nextScale);
    setDraftCoverImageOffsetX(nextOffsetX);
    setDraftCoverImageOffsetY(nextOffsetY);
    setIsCoverEditorOpen(false);
    coverPreviewDragRef.current = null;
    toast.success(pick('บันทึกการครอปรูปแล้ว', 'Cover crop saved'));
  };

  const handleCoverPreviewPointerDown = (event) => {
    if (!coverImageUrl || !isCoverEditorOpen || !draftCoverViewportBounds) {
      return;
    }

    const imageRect = getContainedImageRect(
      coverStageSize.width,
      coverStageSize.height,
      draftCoverViewportBounds.imageAspect
    );
    if (!imageRect) {
      return;
    }

    coverPreviewDragRef.current = {
      mode: 'move',
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startOriginX: draftCoverViewportBounds.originX,
      startOriginY: draftCoverViewportBounds.originY,
      maxOriginX: draftCoverViewportBounds.maxOriginX,
      maxOriginY: draftCoverViewportBounds.maxOriginY,
      width: imageRect.width || 1,
      height: imageRect.height || 1,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handleCoverPreviewResizePointerDown = (event, corner) => {
    if (!coverImageUrl || !isCoverEditorOpen || !draftCoverViewportBounds) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const imageRect = getContainedImageRect(
      coverStageSize.width,
      coverStageSize.height,
      draftCoverViewportBounds.imageAspect
    );
    if (!imageRect) {
      return;
    }

    coverPreviewDragRef.current = {
      mode: 'resize',
      corner,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      imageRectWidth: imageRect.width || 1,
      imageRectHeight: imageRect.height || 1,
      imageAspect: draftCoverViewportBounds.imageAspect,
      startViewportWidth: draftCoverViewportBounds.viewportWidth,
      minViewportWidth: getTemplatePreviewViewportWidthForScale(
        draftCoverViewportBounds.imageAspect,
        TEMPLATE_PREVIEW_MAX_SCALE
      ),
      maxViewportWidth: getTemplatePreviewViewportWidthForScale(
        draftCoverViewportBounds.imageAspect,
        TEMPLATE_PREVIEW_MIN_SCALE
      ),
      fixedLeft: corner === 'ne' || corner === 'se' ? draftCoverViewportBounds.originX : null,
      fixedRight: corner === 'nw' || corner === 'sw'
        ? draftCoverViewportBounds.originX + draftCoverViewportBounds.viewportWidth
        : null,
      fixedTop: corner === 'sw' || corner === 'se' ? draftCoverViewportBounds.originY : null,
      fixedBottom: corner === 'nw' || corner === 'ne'
        ? draftCoverViewportBounds.originY + draftCoverViewportBounds.viewportHeight
        : null,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handleCoverPreviewPointerMove = (event) => {
    const dragState = coverPreviewDragRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    event.preventDefault();
    if (dragState.mode === 'resize') {
      const horizontalDelta = (event.clientX - dragState.startX) / (dragState.imageRectWidth || 1);
      const verticalDelta = (event.clientY - dragState.startY) / (dragState.imageRectHeight || 1);
      const verticalWidthDelta = verticalDelta * (TEMPLATE_PREVIEW_ASPECT_RATIO / dragState.imageAspect);
      let widthDeltaFromX = 0;
      let widthDeltaFromY = 0;

      switch (dragState.corner) {
        case 'ne':
          widthDeltaFromX = horizontalDelta;
          widthDeltaFromY = -verticalWidthDelta;
          break;
        case 'nw':
          widthDeltaFromX = -horizontalDelta;
          widthDeltaFromY = -verticalWidthDelta;
          break;
        case 'sw':
          widthDeltaFromX = -horizontalDelta;
          widthDeltaFromY = verticalWidthDelta;
          break;
        case 'se':
        default:
          widthDeltaFromX = horizontalDelta;
          widthDeltaFromY = verticalWidthDelta;
          break;
      }

      const widthDelta = Math.abs(widthDeltaFromX) >= Math.abs(widthDeltaFromY)
        ? widthDeltaFromX
        : widthDeltaFromY;
      const lowerBound = dragState.minViewportWidth;
      let upperBound = dragState.maxViewportWidth;

      if (Number.isFinite(dragState.fixedLeft)) {
        upperBound = Math.min(upperBound, 1 - dragState.fixedLeft);
      }
      if (Number.isFinite(dragState.fixedRight)) {
        upperBound = Math.min(upperBound, dragState.fixedRight);
      }
      if (Number.isFinite(dragState.fixedTop)) {
        upperBound = Math.min(
          upperBound,
          (1 - dragState.fixedTop) * (TEMPLATE_PREVIEW_ASPECT_RATIO / dragState.imageAspect)
        );
      }
      if (Number.isFinite(dragState.fixedBottom)) {
        upperBound = Math.min(
          upperBound,
          dragState.fixedBottom * (TEMPLATE_PREVIEW_ASPECT_RATIO / dragState.imageAspect)
        );
      }

      const effectiveLowerBound = Math.min(lowerBound, upperBound);
      const nextViewportWidth = Math.max(
        effectiveLowerBound,
        Math.min(upperBound, dragState.startViewportWidth + widthDelta)
      );
      const nextViewportHeight = getTemplatePreviewViewportHeightForWidth(
        dragState.imageAspect,
        nextViewportWidth
      );
      const nextOriginX = Number.isFinite(dragState.fixedLeft)
        ? dragState.fixedLeft
        : dragState.fixedRight - nextViewportWidth;
      const nextOriginY = Number.isFinite(dragState.fixedTop)
        ? dragState.fixedTop
        : dragState.fixedBottom - nextViewportHeight;

      setDraftCoverImageScale(
        getTemplatePreviewScaleFromViewportWidth(dragState.imageAspect, nextViewportWidth)
      );
      setDraftCoverImageOffsetX(
        getTemplatePreviewOffsetFromViewportOrigin(nextOriginX, Math.max(0, 1 - nextViewportWidth))
      );
      setDraftCoverImageOffsetY(
        getTemplatePreviewOffsetFromViewportOrigin(nextOriginY, Math.max(0, 1 - nextViewportHeight))
      );
      return;
    }

    const deltaX = (event.clientX - dragState.startX) / dragState.width;
    const deltaY = (event.clientY - dragState.startY) / dragState.height;
    const nextOriginX = Math.max(0, Math.min(dragState.maxOriginX, dragState.startOriginX + deltaX));
    const nextOriginY = Math.max(0, Math.min(dragState.maxOriginY, dragState.startOriginY + deltaY));
    setDraftCoverImageOffsetX(getTemplatePreviewOffsetFromViewportOrigin(nextOriginX, dragState.maxOriginX));
    setDraftCoverImageOffsetY(getTemplatePreviewOffsetFromViewportOrigin(nextOriginY, dragState.maxOriginY));
  };

  const handleCoverPreviewPointerUp = (event) => {
    if (coverPreviewDragRef.current?.pointerId === event.pointerId) {
      coverPreviewDragRef.current = null;
    }
  };

  const handleCoverStageImageLoad = (event) => {
    setCoverImageNaturalSize({
      width: event.currentTarget.naturalWidth || 0,
      height: event.currentTarget.naturalHeight || 0,
    });
  };

  return {
    coverFileInputRef,
    coverImageOffsetX,
    coverImageOffsetY,
    coverImageScale,
    coverImageUrl,
    coverStageRef,
    draftCoverImageOffsetX,
    draftCoverImageOffsetY,
    draftCoverStageCropRect,
    draftCoverPreviewStyle,
    handleCoverPreviewPointerDown,
    handleCoverPreviewPointerMove,
    handleCoverPreviewPointerUp,
    handleCoverPreviewResizePointerDown,
    handleCoverStageImageLoad,
    handleDraftCoverImageOffsetXChange,
    handleDraftCoverImageOffsetYChange,
    handleUploadCover,
    hasPendingCoverFrameChanges,
    isCoverEditorOpen,
    isUploadingCover,
    openCoverEditor,
    closeCoverEditor,
    resetCoverPreviewFrame,
    saveCoverPreviewFrame,
    savedCoverPreviewStyle,
  };
}
