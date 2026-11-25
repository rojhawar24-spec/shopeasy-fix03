export const MAX_PRODUCT_GALLERY_IMAGES = 6;
export const MAX_ADDITIONAL_GALLERY_UPLOADS = MAX_PRODUCT_GALLERY_IMAGES - 1;

/** Keep a deterministic unique gallery with the main image always first. */
export function normalizeProductGallery(primaryImageUrl, galleryInput = []) {
  const gallery = [];
  const candidates = [primaryImageUrl, ...(Array.isArray(galleryInput) ? galleryInput : [])];
  for (const candidate of candidates) {
    const url = String(candidate ?? '').trim().slice(0, 500);
    if (url && !gallery.includes(url)) gallery.push(url);
  }
  if (gallery.length > MAX_PRODUCT_GALLERY_IMAGES) throw new Error('IMAGE_GALLERY_LIMIT');
  return gallery;
}
