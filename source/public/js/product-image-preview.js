/* ShopEasy V17: preview the selected product cover and compress large photos before upload. */
(() => {
  'use strict';
  const input = document.querySelector('[data-product-cover-input]');
  const preview = document.querySelector('[data-product-cover-preview]');
  if (!(input instanceof HTMLInputElement) || !(preview instanceof HTMLElement)) return;

  const form = input.closest('form');
  const image = preview.querySelector('[data-product-cover-preview-image]');
  const title = preview.querySelector('[data-product-cover-preview-title]');
  const status = preview.querySelector('[data-product-cover-preview-status]');
  if (!(image instanceof HTMLImageElement) || !(title instanceof HTMLElement) || !(status instanceof HTMLElement)) return;

  const MAX_BYTES = 2 * 1024 * 1024;
  const validTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
  let currentObjectUrl = '';
  let selectionToken = 0;

  const releasePreviewUrl = () => {
    if (currentObjectUrl) URL.revokeObjectURL(currentObjectUrl);
    currentObjectUrl = '';
  };
  const showFile = (file) => {
    releasePreviewUrl();
    currentObjectUrl = URL.createObjectURL(file);
    const selectedUrl = currentObjectUrl;
    preview.dataset.previewProcessing = 'true';
    delete preview.dataset.previewInvalid;
    delete preview.dataset.previewQuality;
    image.src = '/assets/product-placeholder.svg';
    status.textContent = 'Checking the selected photo…';
    // Decode only the actual selected file, never the visible fallback image.
    const probe = new Image();
    probe.onload = () => {
      if (currentObjectUrl !== selectedUrl) return;
      delete preview.dataset.previewProcessing;
      const width = probe.naturalWidth, height = probe.naturalHeight;
      if (!width || !height) {
        markInvalid('This photo cannot be opened. Choose a valid JPG, PNG or WebP and try again.');
        return;
      }
      image.src = selectedUrl;
      const lowResolution = width < 500 || height < 500;
      const nonSquare = Math.abs(width / height - 1) > 0.1;
      preview.dataset.previewQuality = lowResolution || nonSquare ? 'review' : 'good';
      const issues = [
        lowResolution ? 'Too small: use at least 500 × 500 px for Google Merchant.' : '',
        nonSquare ? 'ShopEasy crops to square. Keep the whole item centred.' : ''
      ].filter(Boolean);
      const baseStatus = `${width} × ${height} px · ${(file.size / 1024).toFixed(0)} KB.`;
      status.textContent = issues.length ? `${baseStatus} PHOTO CHECK: ${issues.join(' ')}` : `${baseStatus} Ready to save.`;
    };
    probe.onerror = () => {
      if (currentObjectUrl !== selectedUrl) return;
      delete preview.dataset.previewProcessing;
      markInvalid('This photo cannot be opened. Choose a valid JPG, PNG or WebP and try again.');
      image.src = '/assets/product-placeholder.svg';
    };
    probe.src = selectedUrl;
    preview.hidden = false;
  };
  const markInvalid = (message) => {
    preview.dataset.previewInvalid = 'true';
    status.textContent = message;
  };
  const resetPreview = () => {
    selectionToken++;
    releasePreviewUrl();
    preview.hidden = true;
    delete preview.dataset.previewProcessing;
    delete preview.dataset.previewInvalid;
    delete preview.dataset.previewQuality;
    image.onload = null;
    image.onerror = null;
    image.removeAttribute('srcset');
    image.src = '/assets/product-placeholder.svg';
    title.textContent = 'Selected product photo';
    status.textContent = 'Select a JPG, PNG or WebP photo. Large photos are optimized automatically.';
    delete preview.dataset.previewInvalid;
  };

  const toBlob = (canvas, type, quality) => new Promise((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('IMAGE_ENCODE_FAILED')), type, quality);
  });

  async function optimizeLargeImage(file) {
    if (file.size <= MAX_BYTES) return file;
    if (typeof createImageBitmap !== 'function') throw new Error('IMAGE_OPTIMIZER_UNAVAILABLE');
    const bitmap = await createImageBitmap(file);
    try {
      let scale = Math.min(1, 1800 / Math.max(bitmap.width, bitmap.height));
      const qualities = [0.86, 0.78, 0.68, 0.58];
      for (let dimensionsAttempt = 0; dimensionsAttempt < 3; dimensionsAttempt++) {
        const width = Math.max(1, Math.round(bitmap.width * scale));
        const height = Math.max(1, Math.round(bitmap.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d', { alpha: true });
        if (!context) throw new Error('IMAGE_CANVAS_UNAVAILABLE');
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = 'high';
        context.drawImage(bitmap, 0, 0, width, height);
        for (const quality of qualities) {
          const blob = await toBlob(canvas, 'image/webp', quality);
          if (blob.size <= MAX_BYTES) {
            const baseName = file.name.replace(/\.[^.]+$/, '') || 'product-photo';
            return new File([blob], `${baseName}.webp`, { type: 'image/webp', lastModified: Date.now() });
          }
        }
        scale *= 0.72;
      }
      throw new Error('IMAGE_STILL_TOO_LARGE');
    } finally {
      bitmap.close?.();
    }
  }

  input.addEventListener('change', async () => {
    const token = ++selectionToken;
    releasePreviewUrl();
    delete preview.dataset.previewInvalid;
    delete preview.dataset.previewProcessing;
    delete preview.dataset.previewQuality;
    const originalFile = input.files && input.files[0];
    if (!originalFile) {
      resetPreview();
      return;
    }
    preview.hidden = false;
    if (!originalFile.size) {
      image.src = '/assets/product-placeholder.svg';
      title.textContent = 'This photo is empty';
      markInvalid('Choose a non-empty JPG, PNG or WebP photo.');
      return;
    }
    if (!validTypes.has(originalFile.type)) {
      image.src = '/assets/product-placeholder.svg';
      title.textContent = 'Unsupported photo format';
      markInvalid('Use a JPG, PNG or WebP photo. HEIC and other formats must be converted before upload.');
      return;
    }

    title.textContent = originalFile.name;
    if (originalFile.size <= MAX_BYTES) {
      showFile(originalFile);
      return;
    }

    image.src = '/assets/product-placeholder.svg';
    preview.dataset.previewProcessing = 'true';
    status.textContent = `${(originalFile.size / (1024 * 1024)).toFixed(1)} MiB · Optimizing a copy for upload…`;
    try {
      const optimizedFile = await optimizeLargeImage(originalFile);
      if (token !== selectionToken) return;
      const transfer = new DataTransfer();
      transfer.items.add(optimizedFile);
      input.files = transfer.files;
      delete preview.dataset.previewProcessing;
      delete preview.dataset.previewInvalid;
      showFile(optimizedFile);
      title.textContent = optimizedFile.name;
    } catch {
      if (token !== selectionToken) return;
      delete preview.dataset.previewProcessing;
      image.src = '/assets/product-placeholder.svg';
      title.textContent = 'Photo could not be optimized';
      markInvalid('ShopEasy accepts photos up to 2 MiB after optimization. Choose a smaller JPG, PNG or WebP image and try again.');
    }
  });

  // Show the actual newly selected gallery photos without uploading or modifying them.
  const galleryInput = form?.querySelector('[data-gallery-upload]');
  const stagedGallery = form?.querySelector('[data-gallery-stage]');
  const stagedGrid = stagedGallery?.querySelector('[data-gallery-stage-grid]');
  const stagedTitle = stagedGallery?.querySelector('[data-gallery-stage-title]');
  let stagedUrls = [];
  const clearStaged = () => {
    for (const url of stagedUrls) URL.revokeObjectURL(url);
    stagedUrls = [];
    if (stagedGrid) stagedGrid.replaceChildren();
  };
  if (galleryInput && stagedGallery && stagedGrid && stagedTitle) {
    galleryInput.addEventListener('change', () => {
      clearStaged();
      const files = [...(galleryInput.files || [])];
      stagedGallery.hidden = files.length === 0;
      stagedTitle.textContent = `${files.length} new photo${files.length === 1 ? '' : 's'} selected`;
      files.slice(0, 6).forEach(file => {
        const item = document.createElement('div');
        item.className = 'product-staged-gallery-item';
        const photo = document.createElement('img');
        photo.alt = `New product photo preview: ${file.name}`;
        const label = document.createElement('small');
        label.textContent = `${file.name} · ${Math.round(file.size / 1024)} KB`;
        if (validTypes.has(file.type) && file.size <= MAX_BYTES && file.size > 0) {
          const url = URL.createObjectURL(file);
          stagedUrls.push(url);
          photo.onload = () => {
            const review = photo.naturalWidth < 500 || photo.naturalHeight < 500 || Math.abs(photo.naturalWidth / photo.naturalHeight - 1) > 0.1;
            label.textContent = `${file.name} · ${photo.naturalWidth} × ${photo.naturalHeight} px · ${review ? 'Review crop/resolution' : 'Ready to save'}`;
            item.dataset.photoQuality = review ? 'review' : 'good';
          };
          photo.onerror = () => {
            label.textContent = `${file.name} · Cannot display this photo; choose another file.`;
            item.dataset.photoQuality = 'review';
          };
          photo.src = url;
        } else {
          item.dataset.photoQuality = 'review';
          label.textContent = `${file.name} · Unsupported or larger than 2 MiB`;
        }
        item.append(photo, label);
        stagedGrid.append(item);
      });
    });
  }
  form?.addEventListener('submit', event => {
    if (preview.dataset.previewInvalid === 'true' || preview.dataset.previewProcessing === 'true') {
      event.preventDefault();
      status.textContent = preview.dataset.previewProcessing === 'true'
        ? 'Please wait for photo optimization to finish before saving.'
        : 'The selected photo could not be read. Select a valid JPG, PNG or WebP before saving.';
      input.focus();
    }
  });

  window.addEventListener('pagehide', () => { releasePreviewUrl(); clearStaged(); }, { once: true });
})();
