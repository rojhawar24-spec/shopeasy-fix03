# Google Ads & Merchant Center launch checks — 5 November 2026

**Status: NOT APPROVED / NOT LIVE-TESTED.** This document is a source-backed launch checklist, not approval by Google. The ShopEasy application has not been run on a public HTTPS server in this audit environment.

## Official rules checked

1. **Google Ads destination requirements:** landing pages must be functional, publicly accessible to the target audience and Google AdsBot, useful, safe, easy to navigate, and match the ad's domain. Error responses, forced authentication, confusing redirects and obtrusive popups can lead to disapproval. Source: https://support.google.com/adspolicy/answer/6368661?hl=en
2. **Merchant Center editorial and professional requirements:** complete identity/contact information, public returns/refunds policy, functioning product pages, no placeholder images or text, working guest purchase when applicable. Source: https://support.google.com/merchants/answer/6150244
3. **Merchant Center product data:** the advertised price and availability must match the landing page, checkout and structured product data. Source: https://support.google.com/merchants/answer/7052112?hl=en
4. **Google merchant listing structured data:** use real `Product`/`Offer`, accurately represent the product, and validate with the Google Rich Results Test. Source: https://developers.google.com/search/docs/appearance/structured-data/merchant-listing
5. **Consent mode v2:** before installing Google Ads conversion or remarketing tags, establish and test the appropriate privacy consent mechanism. Parameters include `ad_storage`, `analytics_storage`, `ad_user_data`, and `ad_personalization`. Source: https://developers.google.com/tag-platform/security/guides/consent
6. **Google e-commerce navigation:** link from catalogue and category to actual product pages using crawlable anchors. Source: https://developers.google.com/search/docs/specialty/ecommerce/help-google-understand-your-ecommerce-site-structure

## Manager tasks before enabling an actual ad campaign

- Enter and verify your **actual legal business name, contact address, usable email/phone, registrations and tax number**. Ensure that public `/contact` and `/imprint` match the Merchant Center account. Do not use example or invented details.
- Provide **specific reviewed shipping regions, costs, estimated delivery times, return conditions, refund times and customer support** for the target market in `/shipping-returns`, `/terms`, `/privacy` and `/cookies`.
- Add products with **real images, accurate price, authentic category, descriptive name, description and stock**. Newly-created products start hidden until explicitly published in the R10 editor. This does not retroactively check existing products.
- In each country targeted by ads, confirm that **the actual guest checkout works** through confirmation; payment provider eligibility and tax may differ by country. The ad lander may not lead to an inaccessible or non-purchasable product.
- Configure a real HTTPS `BASE_URL`, stable DNS and certificates. Verify `robots.txt`, the dynamic sitemap and GoogleAdsBot access (including relevant geographical regions).
- Confirm that no marketing tracking fires before valid consent. The R10 changes **do not install Google Ads tags, conversion tracking or remarketing**. Do not add tags without a compliant and verified consent process.
- Match ads' final URLs and landing products to the same domain and brand. No misleading prices, unsubstantiated discounts, invented reviews, misleading urgency claims or restricted-product promotions.
- Verify that Merchant Center country settings, feeds, legal requirements and Google Ads account pass Google's own verification. **No script can certify that Google will approve the account or ads.**

## Commands

```bash
npm ci
npm run audit:ads -- --static
npm run audit:ads -- --url https://YOUR-REAL-PUBLIC-DOMAIN.example
npm test
```

The `--static` mode checks declared routes, files and the absence of injected Google tracking code. `--url` uses anonymous GET requests to public routes only; it does not place orders, test payments or verify business identity. **Never place API keys in URLs or commit secrets to the repository.**

## Known blockers and explicit uncertainty

- The audited copy has no working Node 24/npm dependencies; therefore, real web pages, Google AdsBot reachability, payment confirmation, tax, locale and performance behavior were **NOT TESTED**.
- No actual business registration, public domain, campaign account, Google Ads account or Merchant Center account was supplied; approval is **NOT TESTED**.
- French public pages remain partially untranslated and intentionally `noindex`; targeting French-language ads requires a fully reviewed French landing experience.
- Google Ads and Merchant Center enforcement can change; check the official policies at campaign launch and verify restrictions for each product category/country.
