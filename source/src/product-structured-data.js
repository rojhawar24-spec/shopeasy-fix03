const OPTION_PROPERTIES = new Map([
  ['size', 'https://schema.org/size'],
  ['sizes', 'https://schema.org/size'],
  ['maat', 'https://schema.org/size'],
  ['maatvoering', 'https://schema.org/size'],
  ['color', 'https://schema.org/color'],
  ['colour', 'https://schema.org/color'],
  ['kleur', 'https://schema.org/color'],
  ['material', 'https://schema.org/material'],
  ['materiaal', 'https://schema.org/material'],
  ['pattern', 'https://schema.org/pattern'],
  ['patroon', 'https://schema.org/pattern'],
  ['age', 'https://schema.org/suggestedAge'],
  ['suggested age', 'https://schema.org/suggestedAge'],
  ['gender', 'https://schema.org/suggestedGender'],
  ['geslacht', 'https://schema.org/suggestedGender']
]);

function cleanText(value, max = 500) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
}

function optionPropertyName(optionName) {
  const name = cleanText(optionName, 80).toLocaleLowerCase('en').replace(/\s+/g, ' ');
  return OPTION_PROPERTIES.get(name) || null;
}

/**
 * Build server-rendered Schema.org markup. ProductGroup markup is emitted only
 * for option names Google explicitly supports for product variants; arbitrary
 * store-specific options remain a regular Product rather than claiming a
 * variant model we cannot accurately describe.
 */
export function buildProductStructuredData({ product, variants = [], productUrl, currency, price, imageUrl = '', available = true }) {
  // Missing public-origin configuration must not make an otherwise valid product
  // page fail while constructing variant URLs. Omit rich results until the
  // canonical product URL can be represented honestly as an absolute HTTPS URL.
  let canonicalProductUrl;
  try {
    const parsed = new URL(productUrl);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.hash) return null;
    canonicalProductUrl = parsed.toString();
  } catch { return null; }
  productUrl = canonicalProductUrl;
  const description = cleanText(product?.short_description || product?.description, 500);
  const safeImage = cleanText(imageUrl, 2000);
  const hasImage = /^https:\/\//i.test(safeImage);
  const productFields = {
    name: cleanText(product?.name, 200),
    ...(description ? { description } : {}),
    ...(cleanText(product?.sku, 120) ? { sku: cleanText(product.sku, 120) } : {}),
    url: productUrl,
    ...(hasImage ? { image: [safeImage] } : {})
  };
  const baseOffer = {
    '@type': 'Offer',
    url: productUrl,
    priceCurrency: currency,
    price: String(price),
    availability: available ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
    itemCondition: 'https://schema.org/NewCondition'
  };

  const first = Array.isArray(variants) ? variants[0] : null;
  const optionSpecs = first ? [{ name:first.option_name, valueKey:'option_value' }] : [];
  if (cleanText(first?.option_name_2, 80)) optionSpecs.push({ name:first.option_name_2, valueKey:'option_value_2' });
  const variesBy = optionSpecs.map(option => optionPropertyName(option.name));
  const validVariants = Array.isArray(variants) && variants.length > 0 &&
    optionSpecs.length > 0 && variesBy.every(Boolean) && new Set(variesBy).size === variesBy.length &&
    variants.every(variant => Number.isInteger(Number(variant.id)) && Number(variant.id) > 0 &&
      cleanText(variant.sku, 120) && optionSpecs.every(option => {
        const value = cleanText(variant[option.valueKey], 120);
        const actualName = cleanText(option.valueKey === 'option_value' ? variant.option_name : variant.option_name_2, 80);
        return value && actualName.toLocaleLowerCase('en') === cleanText(option.name, 80).toLocaleLowerCase('en');
      }) &&
      cleanText(variant.option_name, 80).toLocaleLowerCase('en') === cleanText(first.option_name, 80).toLocaleLowerCase('en') &&
      cleanText(variant.option_name_2, 80).toLocaleLowerCase('en') === cleanText(first.option_name_2, 80).toLocaleLowerCase('en'));

  if (validVariants) {
    return {
      '@context': 'https://schema.org',
      '@type': 'ProductGroup',
      name: productFields.name,
      ...(description ? { description } : {}),
      ...(cleanText(product?.sku, 120) ? { productGroupID: cleanText(product.sku, 120) } : {}),
      url: productUrl,
      variesBy,
      hasVariant: variants.map(variant => {
        const variantProperties = Object.fromEntries(optionSpecs.map(option => [
          optionPropertyName(option.name).slice('https://schema.org/'.length),
          cleanText(variant[option.valueKey], 120)
        ]));
        const optionLabel = optionSpecs.map(option => cleanText(variant[option.valueKey], 120)).join(' - ');
        const variantImage = cleanText(variant.image_url, 2000);
        const image = /^https:\/\//i.test(variantImage) ? variantImage : safeImage;
        return {
          '@type': 'Product',
          name: `${productFields.name} - ${optionLabel}`,
          sku: cleanText(variant.sku, 120),
          ...variantProperties,
          ...(image && /^https:\/\//i.test(image) ? { image: [image] } : {}),
          offers: {
            ...baseOffer,
            url: (() => { const target = new URL(productUrl); target.searchParams.set('variant', String(Number(variant.id))); return target.toString(); })(),
            availability: Number(variant.available_stock) > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock'
          }
        };
      })
    };
  }

  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    ...productFields,
    offers: baseOffer
  };
}
