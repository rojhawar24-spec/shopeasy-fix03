import { customerText } from './customer-page-copy.js';
import { pageText } from './home-login-copy.js';
import { privacyActionCopy } from './privacy-action-copy.js';
import express from 'express';
import ejs from 'ejs';
import cloudflareViewSources from '../generated/cloudflare-views.js';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { createMfaQr } from './mfa-qr.js';
import { createShopRateLimiter } from './shared-rate-limiter.js';
import cookieParser from 'cookie-parser';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { buildProductStructuredData } from './product-structured-data.js';
import { authDestination, managerMustCompleteMfa } from './auth-navigation.js';
import { parseLocalRedirect } from './local-navigation.js';
import { canCancelOpenOrder, canRequestOrderCancellation, hasPendingCancellationRequest } from './order-cancellation-rules.js';
import { registrationNotice } from './registration-copy.js';
import { buildStoreOrganizationStructuredData, serializeJsonLdSafely } from './organization-structured-data.js';
import { buildProductDeleteRedirect } from './product-list-navigation.js';
import db, { cleanupSessions, getSetting, setSetting, setSettings, saveStoreSettingsWithCurrency, baseEffectivePrice, effectivePrice as dbEffectivePrice, listCategories, createCategory, updateCategory, deleteCategory, listProducts, countProducts, getProductBySlug, getProductById, getCategoryBySlug, listProductVariants, listProductImages, getProductVariantById, getActiveStories, listStories, getStory, listCoupons, getCoupon, getCouponById, createAudit, listAuditLogs, listOrders, countOrders, getOrder, findOrderByPaymentReference, updatePendingOrderPaymentDetails, attachReconciledMolliePaymentReference, recordMolliePaymentFinancialSnapshot, markProviderOrderPaid, cancelProviderPendingOrder, listOrderStatusHistory, listOrderReturns, listOrderReturnRequests, claimOrderEmailDelivery, finishOrderEmailDelivery, createOrderReturnRequest, processOrderReturn, listLowStockInventory, listUserOrders, countUserOrders, getOrderByClientToken, createOrderAtomic, confirmBankTransferOrderPaid, cancelPendingOrder, requestOrderCancellation, decideOrderCancellationRequest, confirmLegacyPendingOrderAsCod, saveSessionCart, mutateSessionCart, saveSessionCoupon, saveSessionCheckoutQuote, clearSessionCartAfterOrder, getSessionCheckoutCredentials, rotateSessionCheckoutCredentials, createUser, deleteAdminUser, updateUserEmail, promoteBootstrapAdminToManager, setOrderStatus, saveSessionWishlist, adminCreateOrUpdateProduct, archiveProduct, restoreProduct, permanentlyDeleteProduct, restockProduct, restockProductVariant, adminCreateOrUpdateStory, deleteStory, adminCreateOrUpdateCoupon, deleteCoupon, listCustomers, countCustomers, getDashboardStats, getUserAuthByEmail, getUserMfaById, setManagerMfaSecret, createMfaLoginChallenge, getMfaLoginChallenge, activateManagerMfa, updateManagerTotpStep, replaceManagerRecoveryHashes, disableManagerMfa, consumeMfaAttempt, clearMfaAttempts, createSession, setSessionCsrf, setSessionExpiresAt, destroySession, updateUserPassword, createPasswordResetToken, resetPasswordWithCode, createEmailVerificationToken, verifyEmailToken, getCustomerForVerification, isAccountLoginBlocked, recordAccountLoginFailure, clearAccountLoginFailures, findOrderForLookup, exportGdprCustomerData, deleteGdprCustomerData, listGdprAuditLogs, deleteProductImage } from './db.js';
import { getRow, getRows, run, isPostgresPreview } from './database.js';
import { validatePeppolInvoiceForm, peppolPayloadHash, requestRecommand } from './services/peppol-recommand.js';
import { claimPeppolSubmission, finishPeppolSubmission, listPeppolSubmissions } from './db.js';
import { issueGiftCard, listGiftCards, getGiftCardLedger, refundGiftCardOrderCredit } from './db.js';
import { toggleWishlist, countOrderReturnRequests, approveCustomerRegistration, getOrderEmailDeliveries, reconcileOrderEmailDelivery } from './db.js';
import { getEmailVerificationChallenge } from './db.js';
import { attachAuth, authenticate, login, logout, requireAuth, requireManager, requireDashboardAccess, cookieOptions, sessionCookieName, setSessionCookie } from './auth.js';
import { encryptTotpSecret, decryptTotpSecret, generateTotpSecret, buildTotpUri, verifyTotpCode, generateRecoveryCodes, hashRecoveryCodes, parseRecoveryCodeHashes, findRecoveryCodeHashIndex } from './mfa.js';
import { hashPassword, verifyPassword } from './password-hashing.js';
import { safeMinorUnitsAdd, safeMinorUnitsMultiply, safePercentOfMinorUnits } from './pricing.js';
import { calculateBundleDiscount, normalizeBundleRules } from './bundle-promotions.js';
import { checkoutIntentMatchesOrder } from './services/checkout-intent.js';
import { privatePageRobotsHeader } from './robots-policy.js';
import { resolveCatalogueSeoPagination, buildIndexableSeoLinks, indexedLocaleFromQuery, isIndexableStorefrontPath, sitemapLocalePaths, withSelectedPublicLanguage } from './seo-locales.js';
import { selectedAvailableVariantId, parseLegacyVariantRows } from './product-variants.js';
import { parseCartProductId, parseCartVariantId, parseCartQuantity } from './cart-form-inputs.js';
import { MAX_ADDITIONAL_GALLERY_UPLOADS, normalizeProductGallery } from './product-images.js';
import { readImageDimensions } from './image-dimensions.js';
import { getLicenseInfo, warnIfLicenseMetadataIncomplete } from './license.js';
import { evaluateLaunchReadiness, launchGateMessage, minimumCustomerTermsLength, MARKET_SETUP_MODES, normalizeMarketSetupMode, effectiveLaunchMode } from './launch-gate.js';
import { csrfToken, verifyCsrf, cleanText, validId, optionalFormId, moneyCents, formatDateTimeLocal, formatDateTimeDisplay, dateTimeLocalToISOString, isSafeUrl, isSafeLocalPath, assertUploadSignature, isValidCurrency, SUPPORTED_CURRENCIES, currencyMinorUnitFactor, currencyMinorUnitDigits, formatMoneyInput, isStrongEnoughPassword, isValidPhone, normalizeDeliveryCountries, matchDeliveryCountry, escapeHtml, parseStoredTimestamp } from './security.js';
let aiService = null;
try { aiService = await import('./services/ai.js'); } catch (error) {
  if (!(error?.code === 'ERR_MODULE_NOT_FOUND' && String(error?.message || '').includes('services/ai.js'))) throw error;
}
import { emailEnabled, sendPasswordResetCodeEmail, sendEmailVerificationEmail, sendReturnRequestEmail, prepareOrderNotificationEmail, sendPreparedOrderNotificationEmail, sendEngagementEmail, sendNewsletterCampaignEmail } from './services/email.js';
import { recordLoginFailure } from './services/security-events.js';
import { DEFAULT_STORE_CURRENCY, SUPPORTED_UI_LOCALES, UI_LOCALE_OPTIONS, getDefaultUiLocale, getIntlLocaleForUi, getUiLanguagePreferences, getStoreName, getStoreTimezone } from './store-config.js';
import { resolvePublicBaseUrl, warnIfProductionBaseUrlMisconfigured } from './startup-config.js';
import { resolveSettingsCurrency, resolveDeliveryCountries, readSettingsStringField, CURRENCY_SENSITIVE_COUPON_WHERE } from './settings-inputs.js';
import { readShopFilters } from './shop-filters.js';
import { normalizeAppearance, appearanceCss, APPEARANCE_SWITCHES, validPrimary, safeHex, allowedFonts } from './store-appearance.js';
import { emailAddress, validActionToken, subscribeNewsletter, confirmNewsletter, unsubscribeNewsletter, createStockAlert, confirmStockAlert, claimStockAlerts, finishStockAlert, userCanReview, submitVerifiedReview, visibleReviews, reviewSummary, pendingReviews, moderateReview, createNewsletterCampaign, listNewsletterCampaigns, newsletterSubscriberCount, newsletterSubscriberActive, claimNewsletterBatch, finishNewsletterDelivery } from './customer-engagement.js';
import { parseShippingZoneRules, parseTaxRules, selectCommerceRule, calculateConfiguredTax, normalizeCommerceRuleText, normalizeCommerceDestinationValue, normalizeCommercePostalCode } from './commerce-rules.js';
import { PAYMENT_MODES, PAYMENT_PROVIDER_IDS, PAYMENT_PROVIDER_DIRECTORY, MERCHANT_COUNTRY_OPTIONS, getPaymentProviderStatus, normalizePaymentMode, normalizePaymentProvider, createMollieCardPayment, getMolliePayment, validateMolliePaymentForOrder, parseProviderAmount, parseMollieFinancialSnapshot, buildMollieCredentialFingerprint } from './services/payment-providers.js';
import { normalizeBankTransferConfig, parseBankTransferSnapshot } from './services/bank-transfer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname,'..');
const isCloudflareWorker = process.env.CLOUDFLARE_WORKER === '1';
const usesDatabaseImageStorage = isPostgresPreview || isCloudflareWorker || (process.env.NODE_ENV === 'test' && process.env.TEST_IMAGE_STORAGE_IN_DATABASE === '1');
const app = express();
// Static cache keys change with each preview commit. Local and Worker URLs are unchanged.
app.locals.assetRevision=isPostgresPreview && /^[a-f0-9]{40}$/i.test(process.env.VERCEL_GIT_COMMIT_SHA||'') ? '-'+process.env.VERCEL_GIT_COMMIT_SHA.slice(0,12) : '';
app.locals.themeRevision=appearance=>isPostgresPreview?crypto.createHash('sha256').update(appearanceCss(appearance)).digest('hex').slice(0,24):'';
// Rejections before storefront middleware still need a safe interface translator.
app.locals.customerText = (value, parameters) => customerText('en', value, parameters);
app.locals.pageText = (value, parameters) => pageText('en', value, parameters);
Object.assign(app.locals, {parseLocalRedirect, canCancelOpenOrder, canRequestOrderCancellation, hasPendingCancellationRequest});
if (isCloudflareWorker) {
  // Workers use an immutable bundle; EJS includes are read from this generated map, not the ephemeral FS.
  ejs.fileLoader = (filePath) => {
    const relative = path.relative(path.join(root,'views'), filePath).replace(/\\/g,'/');
    const source = cloudflareViewSources[relative];
    if (typeof source !== 'string') throw new Error(`View not included in Cloudflare bundle: ${relative}`);
    return source;
  };
}
app.set('view engine','ejs');
app.locals.demoCheckoutOnly=isPostgresPreview;
if(isPostgresPreview) app.enable('view cache');
app.set('views',path.join(root,'views'));
app.disable('x-powered-by');
// This deployment is an authenticated evaluation environment, not a commercial launch.
if (isPostgresPreview) {
  app.use((req,res,next)=>{
    res.set('X-Robots-Tag','noindex, nofollow');
    const started=performance.now();
    const originalWriteHead=res.writeHead;
    res.writeHead=function(...args){
      if(!this.headersSent) this.setHeader('Server-Timing','app;dur='+(performance.now()-started).toFixed(1));
      return originalWriteHead.apply(this,args);
    };
    if (!['GET','HEAD','OPTIONS'].includes(req.method) && (req.path.startsWith('/checkout/') || req.path.startsWith('/payments/') || req.path.startsWith('/admin/peppol') || req.path.startsWith('/admin/newsletter/send'))) {
      return res.status(503).type('text/plain').send('Live sales and external deliveries are disabled in this staging environment.');
    }
    return next();
  });
}

const isProd = process.env.NODE_ENV === 'production';
// Warn at startup when production public URLs are not configured for HTTPS.
warnIfProductionBaseUrlMisconfigured({
  nodeEnv: process.env.NODE_ENV,
  baseUrl: process.env.BASE_URL
});
function logOperationalFailure(context, error) {
  if (isProd) console.error(`${context} failed.`);
  else console.error(`${context} failed`, error);
}
// Audit logging is a secondary observability step. A completed business mutation
// must not be turned into a 500 just because audit storage is temporarily unavailable.
async function safeAudit(userId, action, targetType, targetId, meta={}) {
  try {
    await createAudit(userId, action, targetType, targetId, meta);
  } catch (error) {
    logOperationalFailure(`Audit log (${action})`, error);
  }
}
function emailLocaleFor(requestLocale='en') {
  const override=String(process.env.EMAIL_LOCALE||'').trim().toLowerCase().split('-')[0];
  if(['nl','en','ckb','ar','fr'].includes(override)) return override;
  return requestLocale;
}

async function maybeSendOrderNotification(orderId,eventType,eventKeyOverride='') {
  const allowed=eventType==='confirmation'
    ? process.env.ORDER_CONFIRMATION_EMAILS==='1'
    : eventType==='status'&&process.env.ORDER_STATUS_EMAILS==='1';
  if(!allowed||!emailEnabled())return {sent:false,skipped:true};
  let order,claim,eventKey;
  try {
    order=await getOrder(orderId);
    if(!order)return {sent:false,skipped:true};
    eventKey=eventKeyOverride||(eventType==='confirmation'?'confirmation':`status:${order.status}`);
    if(eventKey!=='confirmation'&&!/^status:(pending|paid|processing|shipped|completed|cancelled)$/.test(eventKey))return {sent:false,skipped:true};
    const storeName=await getSetting('store_name',storeNameFallback);
    let trackingUrl='';
    if(order.user_id&&process.env.BASE_URL){try{const base=new URL(process.env.BASE_URL);if(['https:','http:'].includes(base.protocol))trackingUrl=new URL(`/account/order/${order.id}`,base).toString();}catch{}}
    // A reconciled historical status event must keep the status named by its
    // ledger key, even if the order advanced while delivery was unresolved.
    const emailOrder=eventType==='status'?{...order,status:eventKey.slice('status:'.length)}:order;
    const prepared=await prepareOrderNotificationEmail({order:emailOrder,eventType,items:order.items||[],storeName,locale:emailLocaleFor(order.terms_locale||'en'),trackingUrl});
    if(!prepared?.payload)return {sent:false,skipped:true};
    const limitValue=Number.parseInt(process.env.ORDER_EMAIL_DAILY_LIMIT||'10',10);
    const dailyLimit=Math.min(100,Math.max(1,Number.isFinite(limitValue)?limitValue:10));
    claim=await claimOrderEmailDelivery(order.id,eventKey,eventType,order.email,dailyLimit,{payload:prepared.payload,providerFingerprint:prepared.providerFingerprint});
    if(!claim.claimed)return {sent:false,skipped:true,reason:claim.reason};
  } catch(error) {
    logOperationalFailure('Prepare or claim order email delivery',error);
    return {sent:false,skipped:true};
  }
  try {
    const result=await sendPreparedOrderNotificationEmail({payload:claim.payload,providerFingerprint:claim.providerFingerprint,idempotencyKey:claim.idempotencyKey});
    if(!result?.sent){await finishOrderEmailDelivery(order.id,eventKey,{claimToken:claim.claimToken,sent:false,errorCode:result?.skipped?'sender-disabled':'provider-no-send'});return result;}
    await finishOrderEmailDelivery(order.id,eventKey,{claimToken:claim.claimToken,sent:true,providerMessageId:result.id||null});
    return result;
  } catch(error) {
    const errorCode=error?.message==='ORDER_EMAIL_TIMEOUT'?'timeout':error?.message==='ORDER_EMAIL_CREDENTIAL_CHANGED'?'ORDER_EMAIL_PROVIDER_CHANGED':'provider-failure';
    try{await finishOrderEmailDelivery(order.id,eventKey,{claimToken:claim.claimToken,sent:false,errorCode});}catch(finishError){logOperationalFailure('Record order email failure',finishError);}
    logOperationalFailure('Send order notification email',error);
    return {sent:false,failed:true};
  }
}
const trustProxy = Number(process.env.TRUST_PROXY ?? (isCloudflareWorker ? '1' : '0'));
app.set('trust proxy', Number.isInteger(trustProxy) && trustProxy >= 0 ? trustProxy : false);
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:["'self'"],
      scriptSrc:["'self'"],
      styleSrc:["'self'"],
      // Local file previews use browser-owned object URLs. This does not allow blob scripts.
      imgSrc:["'self'","data:","https:","blob:"],
      fontSrc:["'self'"],
      connectSrc:["'self'"],
      objectSrc:["'none'"],
      frameAncestors:["'none'"],
      baseUri:["'self'"],
      formAction:["'self'"],
      upgradeInsecureRequests: isProd ? [] : null
    }
  }
}));
app.use(cookieParser());
// Prevent crawlers from indexing private routes even when they never render an EJS page.
app.use(privatePageRobotsHeader);

const makeRateLimiter=(name,options)=>{
  const {onLimit,onUnavailable,...rateOptions}=options;
  const fallback=rateLimit(onLimit?{...rateOptions,handler:(req,res,next)=>onLimit(req,res,next)}:rateOptions);
  return createShopRateLimiter({name,...rateOptions,onLimit,onUnavailable,fallback,isCloudflareWorker});
};
const generalLimiter=makeRateLimiter('general',{windowMs:60*1000,max:300,standardHeaders:true,legacyHeaders:false,message:'Too many requests. Please slow down.'});
const loginLimiter=makeRateLimiter('login',{windowMs:15*60*1000,max:10,standardHeaders:true,legacyHeaders:false,message:'Too many authentication attempts. Please try again later.'});
// Browser-only emergency recovery is separately rate-limited and is available only
// on a local development server backed by a local SQLite file.
const localManagerRecoveryLimiter=rateLimit({windowMs:15*60*1000,max:5,standardHeaders:true,legacyHeaders:false,message:'Too many local recovery attempts. Please try again later.'});
// Manager account security actions use a separate bucket from sign-in attempts.
// A legitimate email/password change must not consume or be blocked by failed logins.
const managerAccountLimiter=makeRateLimiter('manager-account',{windowMs:15*60*1000,max:10,standardHeaders:true,legacyHeaders:false,message:'Too many Manager account changes. Please try again later.'});
// Registration is rate-limited independently from password sign-in attempts.
// A customer who mistypes a password must not consume the new-account creation budget.
const registerLimiter=makeRateLimiter('register',{windowMs:15*60*1000,max:10,standardHeaders:true,legacyHeaders:false,message:'Too many account creation attempts. Please try again later.'});
const passwordResetLimiter=makeRateLimiter('password-reset',{windowMs:15*60*1000,max:5,standardHeaders:true,legacyHeaders:false,message:'Too many password reset attempts. Please try again later.'});
const emailVerificationResendLimiter=makeRateLimiter('email-verification-resend',{windowMs:15*60*1000,max:3,standardHeaders:true,legacyHeaders:false,message:'Too many verification requests. Please try again later.'});
const emailVerificationConfirmLimiter=makeRateLimiter('email-verification-confirm',{windowMs:15*60*1000,max:10,standardHeaders:true,legacyHeaders:false,message:'Too many verification attempts. Please try again later.'});
const orderLookupLimiter=makeRateLimiter('order-lookup',{windowMs:15*60*1000,max:10,standardHeaders:true,legacyHeaders:false,message:'Too many order lookup attempts. Please try again later.'});
const returnRequestLimiter=makeRateLimiter('return-request',{windowMs:15*60*1000,max:5,standardHeaders:true,legacyHeaders:false,message:'Too many return requests. Please try again later.'});
const aiLimiter=makeRateLimiter('ai',{windowMs:15*60*1000,max:3,standardHeaders:true,legacyHeaders:false,message:'AI usage limit reached. Please try again later.'});
const cartLimiter=makeRateLimiter('cart',{windowMs:60*1000,max:90,standardHeaders:true,legacyHeaders:false,message:'Too many cart requests. Please slow down.'});
const couponLimiter=makeRateLimiter('coupon',{windowMs:60*1000,max:10,standardHeaders:true,legacyHeaders:false,message:'Too many coupon attempts. Please try again later.'});
const checkoutLimiter=makeRateLimiter('checkout',{windowMs:10*60*1000,max:20,standardHeaders:true,legacyHeaders:false,message:'Too many checkout attempts. Please try again later.'});
// Track POST /checkout failures from the first shared middleware onward. A failure
// can happen before the checkout route (for example in session, CSRF or storefront
// settings middleware), so route-local try/catch alone is not sufficient.
function isCheckoutPost(req) { return req?.method==='POST' && req?.path==='/checkout'; }
function markCheckoutDiagnosticStage(req,stage) {
  if (!isCheckoutPost(req)) return;
  if (!req.shopEasyCheckoutDiagnosticId) req.shopEasyCheckoutDiagnosticId=`CKO-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
  req.shopEasyCheckoutDiagnosticStage=stage;
}
function checkoutDiagnosticStage(stage) {
  return (req,res,next)=>{ markCheckoutDiagnosticStage(req,stage); next(); };
}
function redactCheckoutDiagnosticText(value) {
  return String(value||'')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,'[redacted-email]')
    .replace(/((?:csrf|session|cookie|authorization|idempotency|guest.?token)\s*[:=]\s*)[^\s,;]+/gi,'$1[redacted]')
    .slice(0,6000);
}
const adminLimiter=makeRateLimiter('admin',{windowMs:60*1000,max:120,standardHeaders:true,legacyHeaders:false,message:'Too many admin requests. Please slow down.'});
const searchLimiter=makeRateLimiter('search',{windowMs:60*1000,max:60,standardHeaders:true,legacyHeaders:false,message:'Too many searches. Please slow down.'});
const skipOptionalAiSearch=(req,res,next)=>{req.aiSearchRateLimited=true;return next();};
const aiProductSearchLimiter=makeRateLimiter('ai-product-search',{windowMs:15*60*1000,max:3,standardHeaders:true,legacyHeaders:false,message:'AI search allowance reached. Standard product search remains available.',onLimit:skipOptionalAiSearch,onUnavailable:skipOptionalAiSearch});
const healthLimiter=makeRateLimiter('health',{windowMs:60*1000,max:30,standardHeaders:true,legacyHeaders:false,message:'Too many health checks. Please slow down.'});
const readyLimiter=makeRateLimiter('ready',{windowMs:60*1000,max:30,standardHeaders:true,legacyHeaders:false,message:'Too many readiness checks. Please slow down.'});
const paymentWebhookLimiter=makeRateLimiter('mollie-webhook',{windowMs:60*1000,max:120,standardHeaders:true,legacyHeaders:false,message:'Payment webhook rate limit reached.'});
const uploadAssetLimiter=makeRateLimiter('upload-assets',{windowMs:60*1000,max:120,standardHeaders:true,legacyHeaders:false,message:'Too many image requests. Please slow down.'});
const storeTimeZone=getStoreTimezone(process.env.STORE_TIMEZONE);
const storeNameFallback=getStoreName(process.env.STORE_NAME);
const licenseInfo = warnIfLicenseMetadataIncomplete(getLicenseInfo(process.env));
if (process.env.NODE_ENV !== 'test' && !emailEnabled()) console.warn('[email] Resend is disabled: configure RESEND_API_KEY and a valid EMAIL_FROM. Orders will continue without email delivery.');
if (process.env.NODE_ENV !== 'test' && String(process.env.RESET_CODE_SECRET||'').trim().length<24) console.warn('[password-reset] Password-reset emails are disabled until RESET_CODE_SECRET contains at least 24 characters.');
const upload=multer({
  storage:multer.memoryStorage(),
  // Hard limits apply to every authenticated upload. The product editor supports
  // up to 50 SKU-level variants plus a cover and five additional gallery photos.
  limits:{
    fileSize:2*1024*1024,
    files:6,
    fields:400,
    fieldSize:32*1024,
    fieldNameSize:100,
    // Product variants use bounded numeric indexes; reject oversized sparse-array indexes.
    fieldArrayIndexLimit:100,
    parts:420,
    fieldNestingDepth:10,
    headerPairs:100
  },
  fileFilter:(req,file,cb)=>{
    if(!['image/jpeg','image/png','image/webp'].includes(file.mimetype)) return cb(new Error('INVALID_IMAGE_TYPE'));
    return cb(null,true);
  }
});
let categoryNavCache={expiresAt:0,items:[]};
function onlyCategoriesWithActiveAncestors(rows){
  const byId=new Map(rows.map(c=>[Number(c.id),c]));
  const hasActiveAncestors=category=>{
    const seen=new Set([Number(category.id)]);
    let parentId=category.parent_id?Number(category.parent_id):0;
    while(parentId){
      if(seen.has(parentId)) return false;
      seen.add(parentId);
      const parent=byId.get(parentId);
      if(!parent || Number(parent.active)!==1) return false;
      parentId=parent.parent_id?Number(parent.parent_id):0;
    }
    return true;
  };
  return rows.filter(c=>Number(c.active)===1 && hasActiveAncestors(c));
}
async function getCategoryNav(){
  if(!isPostgresPreview && categoryNavCache.expiresAt>Date.now()) return categoryNavCache.items;
  const visible=onlyCategoriesWithActiveAncestors(await listCategories());
  categoryNavCache={expiresAt:Date.now()+10_000,items:visible};
  return visible;
}
function invalidateCategoryNav(){ categoryNavCache={expiresAt:0,items:[]}; }
function categoryTree(rows){
  const byId=new Map(rows.map(c=>[Number(c.id),{...c,children:[]} ]));
  const roots=[];
  for(const item of byId.values()) {
    const parent=item.parent_id?byId.get(Number(item.parent_id)):null;
    if(parent) parent.children.push(item); else roots.push(item);
  }
  return roots;
}
function buildCategoryPath(rows, categoryId){
  const byId=new Map(rows.map(c=>[Number(c.id),c]));
  const path=[]; const seen=new Set(); let cursor=Number(categoryId)||0;
  while(cursor && !seen.has(cursor)){
    seen.add(cursor); const row=byId.get(cursor); if(!row) break;
    path.unshift(row); cursor=row.parent_id?Number(row.parent_id):0;
  }
  return path;
}

const BRANDING_LOCALES = Object.freeze(['en','ckb','ar','nl','fr']);
const BRANDING_FIELDS = Object.freeze(['eyebrow','title','accent','description']);
const BRANDING_DEFAULTS = Object.freeze({
  en: Object.freeze({
    eyebrow: 'GOOD FINDS, MADE SIMPLE',
    title: 'Find something',
    accent: 'you will love.',
    description: 'Explore useful finds, clear prices and an easy way to order. Pay when your delivery arrives.'
  }),
  ckb: Object.freeze({
    eyebrow: 'بەرهەمی باش، بە ئاسانی',
    title: 'شتێک بدۆزەرەوە',
    accent: 'کە حەزت لێیە.',
    description: 'بەرهەمی بەسوود ببینە، نرخە ڕوونەکان ببینە و بە ئاسانی داوا بکە. پارەکە بدە کاتێک گەیاندنەکەت دەگات.'
  }),
  ar: Object.freeze({
    eyebrow: 'منتجات مميزة، واختيار أسهل',
    title: 'اكتشف شيئًا',
    accent: 'يناسب يومك.',
    description: 'تصفّح المنتجات، وقارن الأسعار الواضحة، واطلب بسهولة. ادفع نقدًا عند الاستلام.'
  }),
  fr: Object.freeze({
    eyebrow: 'DE BELLES DÉCOUVERTES, TOUT SIMPLEMENT',
    title: 'Trouvez un article',
    accent: 'qui vous plaît.',
    description: 'Découvrez des produits utiles, des prix clairs et une commande facile. Payez à la livraison lorsque ce mode est disponible.'
  }),
  nl: Object.freeze({
    eyebrow: 'MOOIE VONDSTEN, EENVOUDIG GEVONDEN',
    title: 'Ontdek iets',
    accent: 'waar je blij van wordt.',
    description: 'Ontdek handige producten, duidelijke prijzen en bestel eenvoudig. Betaal wanneer je bestelling wordt geleverd.'
  })
});

async function loadBrandingFormData(overrides = null) {
  const storeName = overrides && Object.hasOwn(overrides, 'storeName')
    ? overrides.storeName
    : await getSetting('store_name','');
  const locales = await Promise.all(BRANDING_LOCALES.map(async code => {
    const fields = await Promise.all(BRANDING_FIELDS.map(async field => {
      const submitted = overrides?.locales?.[code]?.[field];
      const value = submitted !== undefined ? submitted : await getSetting(`hero_${field}_${code}`, BRANDING_DEFAULTS[code][field]);
      return [field, value];
    }));
    return { code, label: UI_LOCALE_OPTIONS.find(option=>option.code===code)?.label || code, dir: ['ckb','ar'].includes(code) ? 'rtl' : 'ltr', ...Object.fromEntries(fields) };
  }));
  const storedHeroImage = overrides && Object.hasOwn(overrides, 'heroImage') ? overrides.heroImage : await getSetting('hero_image','');
  const storedHeroMode = overrides && Object.hasOwn(overrides, 'heroImageMode')
    ? overrides.heroImageMode
    : await getSetting('hero_image_mode','catalogue');
  const safeCustomHero = storedHeroMode === 'custom' && typeof storedHeroImage === 'string' &&
    (/^\/uploads\/[a-f0-9]{32}\.(?:png|jpg|webp)$/i.test(storedHeroImage.trim()) || /^https:\/\//i.test(storedHeroImage.trim()));
  // Old releases stored a fallback/hero path without recording an explicit choice.
  // Treat those records as catalogue-led until the manager intentionally re-uploads a hero.
  const heroImage = safeCustomHero ? storedHeroImage.trim() : '';
  return { storeName, locales, heroImage, heroImageMode: safeCustomHero ? 'custom' : 'catalogue' };
}

// Cloudflare serves /public files directly from its global static-assets CDN.
// On the supported local Node path, static files are served before the dynamic-request limiter.
if (!isCloudflareWorker) {
  const { createStaticAssetCompression } = await import('./static-asset-compression.js');
  app.use(createStaticAssetCompression({ publicRoot: path.join(root, 'public'), isProd }));
  app.use(express.static(path.join(root,'public'),{index:false,maxAge:isProd?'7d':0}));
}
// Assign a short reference before rate limiting or body parsing can reject the request.
app.use((req,res,next)=>{ if(isCheckoutPost(req)) markCheckoutDiagnosticStage(req,'request-ingress'); next(); });
// Apply the general ingress limit BEFORE parsing untrusted request bodies. Otherwise a
// client could force URL-encoded/JSON parsing work before any rate limiter runs.
app.use(checkoutDiagnosticStage('general-rate-limit'));
app.use(generalLimiter);
// Public catalogue suggestions have no session-dependent fields. Keep both request limits.
if(isPostgresPreview) app.get('/api/search',searchLimiter,async(req,res)=>{
  res.set('Cache-Control','private, no-store');
  const enabled=await getSetting('feature_autocomplete_enabled','1');
  if(enabled==='0')return res.status(404).json({error:'Autocomplete disabled'});
  const q=cleanText(req.query.q,80);
  if(!q) return res.json({results:[]});
  const [results,currency]=await Promise.all([listProducts({search:q,onlyActive:true,limit:6,offset:0}),getSetting('currency',DEFAULT_STORE_CURRENCY)]);
  return res.json({results:results.map(p=>({id:p.id,name:p.name,slug:p.slug,image:app.locals.safeImageUrl(p.image_url),price:app.locals.formatPrice(app.locals.effectivePrice(p),currency),discount:app.locals.discountPercent(p)}))});
});
// The theme contains only allowlisted public colors/font. It needs no login,
// customer session, cart, checkout readiness, or private page middleware.
if(isPostgresPreview) app.get('/theme/shop.css',async(req,res,next)=>{
  try {
    const [brandPrimary,brandAccent,font]=await Promise.all([
      getSetting('appearance_brand_primary',''),
      getSetting('appearance_brand_accent',''),
      getSetting('appearance_font','')
    ]);
    const appearance=normalizeAppearance({brandPrimary,brandAccent,font});
    const css=appearanceCss(appearance);
    const revision=app.locals.themeRevision(appearance);
    // Do not cache a mismatched old URL with newly changed theme bytes.
    const versioned=typeof req.query.appearance==='string' && req.query.appearance===revision;
    res.type('text/css; charset=utf-8').set('Cache-Control',versioned?'private, max-age=86400':'private, no-store');
    return res.send(css);
  } catch(error) { return next(error); }
});
// Settings can contain four policy texts in English, Sorani, Arabic and Dutch (up to 160k
// characters total). URL-encoded UTF-8 can expand Arabic/Kurdish text substantially,
// so allow up to 2 MiB while keeping the request body explicitly bounded.
app.use(checkoutDiagnosticStage('request-body-parsing'));
app.use(express.urlencoded({extended:false,limit:'2mb'}));
app.use(express.json({limit:'128kb'}));

app.get('/uploads/:filename',uploadAssetLimiter,async(req,res,next)=>{
  const filename=String(req.params.filename||'');
  if(!/^[a-f0-9]{32}\.(?:png|jpg|webp)$/i.test(filename)) return res.sendStatus(404);
  try {
    // Uploaded images live in the same Turso database as this app. Cloudflare caches
    // immutable URLs at the edge so normal repeat views do not re-read the BLOB.
    const cacheKey = isCloudflareWorker
      ? new Request(new URL(req.originalUrl, `${req.protocol}://${req.get('host')}`), { method: 'GET' })
      : null;
    const cache = isCloudflareWorker ? caches.default : null;
    if (cacheKey) {
      const cached = await cache.match(cacheKey);
      if (cached) return res.status(cached.status).set('Content-Type',cached.headers.get('Content-Type')||'image/webp').set('Cache-Control','public, max-age=31536000, immutable').set('X-Content-Type-Options','nosniff').send(Buffer.from(await cached.arrayBuffer()));
    }
    if (!usesDatabaseImageStorage) return res.sendStatus(404);
    const asset=await getRow('SELECT content_type,data FROM uploaded_assets WHERE path=?',[`/uploads/${filename}`]);
    if(!asset) return res.sendStatus(404);
    if(!['image/jpeg','image/png','image/webp'].includes(asset.content_type)) return res.sendStatus(404);
    const bytes=Buffer.from(asset.data);
    const headers={ 'Content-Type': asset.content_type, 'Cache-Control':'public, max-age=31536000, immutable', 'X-Content-Type-Options':'nosniff' };
    if (cacheKey) await cache.put(cacheKey,new Response(bytes,{status:200,headers}));
    return res.status(200).type(asset.content_type).set('Cache-Control',headers['Cache-Control']).set('X-Content-Type-Options','nosniff').send(bytes);
  } catch(error) { return next(error); }
});
// Liveness answers only whether the process can serve requests. Dependency checks belong to readiness.
app.get('/health',healthLimiter,(req,res)=>res.status(200).json({ok:true}));
app.get('/ready',readyLimiter,async(req,res)=>{ try { await db.execute('SELECT 1'); return res.status(200).json({ok:true,ready:true}); } catch { return res.status(503).json({ok:false,ready:false}); } });

function xmlEscape(value) { return String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\"/g,'&quot;').replace(/'/g,'&apos;'); }
function siteBase(req) {
  // Shared resolver also protects email verification URLs: production must never
  // derive public links from an attacker-controlled Host / forwarded-host header.
  return resolvePublicBaseUrl({
    nodeEnv: process.env.NODE_ENV,
    baseUrl: process.env.BASE_URL,
    requestProtocol: req.protocol,
    requestHost: req.get('host')
  });
}
function sitemapUrlset(base,paths) { return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${paths.map(path=>`<url><loc>${xmlEscape(base+path)}</loc></url>`).join('')}</urlset>`; }
// Keep crawler-facing routes outside session/auth/template-local middleware. Bots should
// not create sessions or trigger the personalized settings bundle just to fetch XML/text.
app.get('/robots.txt',(req,res)=>{
  const base=siteBase(req);
  const sitemap=base?`Sitemap: ${base}/sitemap.xml\n`:'';
  res.type('text/plain').send(`User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /account\nDisallow: /checkout\n${sitemap}`);
});
app.get('/sitemap.xml',async(req,res)=>{
  const base=siteBase(req);
  if(!base) return res.status(503).type('text/plain').send('Sitemap unavailable until BASE_URL is configured.');
  const total=await countProducts({onlyActive:true}),pageSize=5000,pageCount=Math.ceil(total/pageSize);
  const sitemapPaths=['/sitemap-static.xml',...Array.from({length:pageCount},(_,index)=>`/sitemap-products-${index+1}.xml`)];
  const xml=`<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${sitemapPaths.map(path=>`<sitemap><loc>${xmlEscape(base+path)}</loc></sitemap>`).join('')}</sitemapindex>`;
  res.type('application/xml').send(xml);
});
app.get('/sitemap-static.xml',async(req,res)=>{
  const base=siteBase(req);
  if(!base) return res.status(503).type('text/plain').send('Sitemap unavailable until BASE_URL is configured.');
  const categories=onlyCategoriesWithActiveAncestors(await listCategories());
  const storiesEnabled=(await getSetting('feature_stories_enabled','1'))!=='0';
  const paths=['/','/shop','/faq','/contact','/privacy','/cookies','/terms','/shipping-returns','/imprint','/withdrawal-form',...categories.map(c=>`/category/${encodeURIComponent(c.slug)}`)];
  if(storiesEnabled) paths.splice(2,0,'/stories');
  const preferences=getUiLanguagePreferences(
    await getSetting('ui_default_locale',getDefaultUiLocale(process.env.DEFAULT_LOCALE)),
    await getSetting('ui_enabled_locales',JSON.stringify(SUPPORTED_UI_LOCALES)),
    process.env.DEFAULT_LOCALE
  );
  return res.type('application/xml').send(sitemapUrlset(base,sitemapLocalePaths(paths,preferences.enabledLocales,preferences.defaultLocale)));
});
app.get('/sitemap-products-:page.xml',async(req,res)=>{
  const base=siteBase(req);
  if(!base) return res.status(503).type('text/plain').send('Sitemap unavailable until BASE_URL is configured.');
  const total=await countProducts({onlyActive:true}),pageSize=5000;
  const page=Number(req.params.page),pageCount=Math.ceil(total/pageSize);
  if(!Number.isSafeInteger(page)||page<1||page>pageCount) return res.status(404).type('text/plain').send('Sitemap not found');
  const startOffset=(page-1)*pageSize,remaining=Math.min(pageSize,total-startOffset),products=[];
  for(let offset=0;offset<remaining;offset+=500){
    const batch=await listProducts({onlyActive:true,limit:Math.min(500,remaining-offset),offset:startOffset+offset});
    if(!batch.length) break;
    products.push(...batch);
  }
  const preferences=getUiLanguagePreferences(
    await getSetting('ui_default_locale',getDefaultUiLocale(process.env.DEFAULT_LOCALE)),
    await getSetting('ui_enabled_locales',JSON.stringify(SUPPORTED_UI_LOCALES)),
    process.env.DEFAULT_LOCALE
  );
  return res.type('application/xml').send(sitemapUrlset(base,sitemapLocalePaths(products.map(product=>`/product/${encodeURIComponent(product.slug)}`),preferences.enabledLocales,preferences.defaultLocale)));
});
// Dynamic responses can contain authenticated state, session cookies or fresh
// CSRF fields even when an early middleware rejects the request. Set the policy
// before authentication/challenge/CSRF handling, not just before normal routes.
app.use((req,res,next)=>{
  res.set('Cache-Control','private, no-store, max-age=0');
  res.set('Pragma','no-cache');
  next();
});
// Rate-limit admin traffic before session creation and settings/database lookups.
// This keeps abusive admin requests from doing expensive personalized work first.
app.use('/admin',adminLimiter);
// Early middleware can reject a request before the database-backed storefront
// locals below have been loaded (notably the global CSRF guard). Give shared
// error-page templates safe defaults first; normal request locals overwrite them
// once the request passes the security checks.
app.use((req,res,next)=>{
  const requestPath=typeof req.path==='string'&&req.path.startsWith('/')?req.path:'/';
  const cookieLocale=String(req.cookies?.shop_lang||'');
  const fallbackLocale=SUPPORTED_UI_LOCALES.includes(cookieLocale)?cookieLocale:getDefaultUiLocale(process.env.DEFAULT_LOCALE);
  Object.assign(res.locals,{
    storeName:storeNameFallback,
    locale:fallbackLocale,
    availableUiLocales:SUPPORTED_UI_LOCALES,
    uiLocaleOptions:UI_LOCALE_OPTIONS,
    csrf:'',
    user:null,
    isLoggedIn:false,
    cartCount:0,
    wishlistCount:0,
    wishlistIds:new Set(),
    supportEmail:'',
    legalName:'',
    businessAddress:'',
    businessPhone:'',
    enterpriseNumber:'',
    vatNumber:'',
    path:requestPath,
    isAdminRoute:requestPath.startsWith('/admin'),
    isCheckoutRoute:requestPath.startsWith('/checkout'),
    canonicalBase:'',
    seoCanonicalUrl:'',
    seoAlternateLinks:[],
    seoNoIndex:true,
    returnTo:typeof req.originalUrl==='string'&&req.originalUrl?req.originalUrl:'/',
    navCategories:[],
    paymentMode:'cash_on_delivery',
    checkoutCardEnabled:false,
    bankTransferEnabled:false,
    // Early CSRF and rate-limit errors render the shared header before
    // database-backed settings have loaded. AI must be off by default.
    aiEnabled:false,
    featureStoriesEnabled:true,
    featureWishlistEnabled:true,
    featureAutocompleteEnabled:true,
    featureRelatedProductsEnabled:true,
    appearance:normalizeAppearance(),
    shopLogo:'/assets/logo.svg'
  });
  next();
});
app.use(checkoutDiagnosticStage('session-authentication'));
app.use(attachAuth);
// A password-authenticated Manager challenge is deliberately not a logged-in user session.
// Until its TOTP step completes, every unrelated request is redirected to that challenge.
app.use(checkoutDiagnosticStage('manager-mfa-challenge-check'));
app.use(async(req,res,next)=>{
  try {
    const challenge = await getMfaLoginChallenge(req.sessionId);
    if (challenge && !['/mfa/setup','/mfa/verify','/mfa/disable','/mfa/cancel','/logout','/session/csrf','/language','/local-manager-recovery'].includes(req.path)) {
      return res.redirect(303,challenge.mode==='setup'?'/mfa/setup':'/mfa/verify');
    }
    next();
  } catch(error) { next(error); }
});
app.use(checkoutDiagnosticStage('csrf-token-loading'));
app.use(csrfToken);
// Enforce CSRF validation for every state-changing route by default. Multipart
// forms are parsed by Multer at their route, so their existing route-level
// verifyCsrf middleware validates the token after parsing; all other requests
// can be checked here before any mutation handler runs.
app.use(checkoutDiagnosticStage('csrf-validation'));
app.use(async(req,res,next)=>{
  const multipartTokenParsedAtRoute = req.is('multipart/form-data') &&
    ['/admin/products/save','/admin/stories/save','/admin/branding','/admin/appearance'].includes(req.path);
  if (multipartTokenParsedAtRoute) return next();
  // Mollie server-to-server webhooks do not have a browser CSRF token. The route
  // independently authenticates every event by fetching the payment from Mollie
  // with the secret API key and comparing its order, amount, currency and ID.
  if (req.method==='POST' && req.path==='/payments/mollie/webhook') return next();
  // The MFA challenge row has its own five-minute expiry; its anonymous session
  // may remain in the session store longer. A stale browser POST must return to
  // login instead of showing a generic CSRF error when that challenge is gone.
  // Only a missing/expired MFA challenge skips token comparison; a live challenge
  // still goes through the normal CSRF check and the MFA route's own validation.
  if (req.method==='POST' && ['/mfa/setup','/mfa/verify'].includes(req.path)) {
    try {
      const challenge = await getMfaLoginChallenge(req.sessionId);
      if (!challenge || String(challenge.role).toLowerCase()!=='manager') {
        return res.redirect(303,'/login?mfa=expired');
      }
    } catch(error) { return next(error); }
  }
  return verifyCsrf(req,res,next);
});
app.get('/session/csrf', (req,res)=>{
  res.set('Cache-Control','private, no-store, max-age=0');
  return res.json({csrf:req.session?.csrf||null});
});

// Worker runtimes do not keep a reliable setInterval alive between requests.
// Run expiry maintenance on the first request per warm Worker instance every five minutes.
// Failures are logged generically and must not turn a normal storefront request into a 500.
let lastRequestMaintenanceAt=0;
let requestMaintenancePromise=null;
app.use(async(req,res,next)=>{
  if((process.env.CLOUDFLARE_WORKER!=='1' && !isPostgresPreview) || Date.now()-lastRequestMaintenanceAt<5*60*1000) return next();
  if(!requestMaintenancePromise){
    lastRequestMaintenanceAt=Date.now();
    requestMaintenancePromise=(async()=>{
      await cleanupSessions();
    })().catch(()=>{
      lastRequestMaintenanceAt=0;
      console.error('[maintenance] session cleanup failed');
    }).finally(()=>{requestMaintenancePromise=null;});
  }
  await requestMaintenancePromise;
  next();
});

app.locals.formatDateTimeLocal = formatDateTimeLocal;
app.locals.formatDateTimeDisplay = formatDateTimeDisplay;
app.locals.formatRelativeTime = (value)=>{ const timestamp=parseStoredTimestamp(value).getTime(); if(!Number.isFinite(timestamp)) return 'Unknown date'; const seconds=Math.max(0,Math.floor((Date.now()-timestamp)/1000)); if(seconds<60) return 'Just now'; if(seconds<3600){const n=Math.floor(seconds/60);return `${n} ${n===1?'minute':'minutes'} ago`;} if(seconds<86400){const n=Math.floor(seconds/3600);return `${n} ${n===1?'hour':'hours'} ago`;} if(seconds<2592000){const n=Math.floor(seconds/86400);return `${n} ${n===1?'day':'days'} ago`;} if(seconds<31536000){const n=Math.floor(seconds/2592000);return `${n} ${n===1?'month':'months'} ago`;} const n=Math.floor(seconds/31536000);return `${n} ${n===1?'year':'years'} ago`; };
app.locals.storeTimeZone = storeTimeZone;
app.locals.licenseInfo = licenseInfo;
app.locals.formatPrice = (minorUnits,currency=DEFAULT_STORE_CURRENCY) => { const code=isValidCurrency(currency)?String(currency).toUpperCase():'EUR'; const digits=currencyMinorUnitDigits(code); return new Intl.NumberFormat('en-GB',{style:'currency',currency:code,minimumFractionDigits:digits,maximumFractionDigits:digits}).format(Number(minorUnits||0)/currencyMinorUnitFactor(code)); };
app.locals.formatMoneyInput = formatMoneyInput;
app.locals.baseEffectivePrice = (p) => baseEffectivePrice(p);
app.locals.effectivePrice = (p) => dbEffectivePrice(p);
app.locals.discountPercent = (p) => {
  const current=app.locals.effectivePrice(p);
  return p.price_cents>0 && current<p.price_cents ? Math.min(99,Math.max(1,Math.round((1-current/p.price_cents)*100))) : 0;
};
app.locals.safeImageUrl = (value,fallback='/assets/product-placeholder.svg') => {
  const candidate=String(value||'').trim();
  // Never recycle the old generic hero artwork as if it were real product photography.
  if(!candidate || /^(?:\.\/)?(?:public\/)?assets\/hero-editorial\.webp$/i.test(candidate) || candidate==='/assets/hero-editorial.webp') return fallback;
  return isSafeUrl(candidate) ? candidate : fallback;
};
app.locals.safeStoryHref = (value) => isSafeUrl(value) ? (value || '/stories') : '/stories';
app.locals.escapeHtml = escapeHtml;
app.use(checkoutDiagnosticStage('shared-storefront-settings-and-navigation'));
app.use(async(req,res,next)=>{
  // Dynamic pages contain cookie/session-aware navigation, wishlist counts and cart state.
  // Never let a shared cache replay one customer's personalized HTML to another visitor.
  if (req.method === 'GET' || req.method === 'HEAD') res.set('Cache-Control','private, no-store');
  try {
  const [storeName,currency,aiEnabled,launch,supportEmail,legalName,businessAddress,businessPhone,enterpriseNumber,vatNumber,uiDefaultSetting,uiEnabledSetting,featureStoriesSetting,featureWishlistSetting,featureAutocompleteSetting,featureRelatedProductsSetting,appearanceRaw,navRows]=await Promise.all([
    getSetting('store_name',storeNameFallback),getSetting('currency',DEFAULT_STORE_CURRENCY),aiIsEnabled(),storeLaunchConfig(),getSetting('support_email',''),getSetting('legal_name',''),getSetting('business_address',''),getSetting('business_phone',''),getSetting('enterprise_number',''),getSetting('vat_number',''),
    getSetting('ui_default_locale',getDefaultUiLocale(process.env.DEFAULT_LOCALE)),getSetting('ui_enabled_locales',JSON.stringify(SUPPORTED_UI_LOCALES)),getSetting('feature_stories_enabled','1'),getSetting('feature_wishlist_enabled','1'),getSetting('feature_autocomplete_enabled','1'),getSetting('feature_related_products_enabled','1'),
    Promise.all([
    ...['brand_primary','brand_accent','font','logo','free_shipping_minimum'].map(key=>getSetting(`appearance_${key}`,'')),
    ...Object.entries(APPEARANCE_SWITCHES).map(([key,enabled])=>getSetting(`appearance_${key}`,enabled?'1':'0'))
  ]),
    getCategoryNav()
  ]);
  res.locals.storeName=storeName;
  res.locals.currency=currency;
  res.locals.aiEnabled=aiEnabled;
  res.locals.emailEnabled=emailEnabled();
  res.locals.storeReady=launch.ready;
  res.locals.supportEmail=supportEmail;
  res.locals.legalName=legalName;
  res.locals.businessAddress=businessAddress;
  res.locals.businessPhone=businessPhone;
  res.locals.enterpriseNumber=enterpriseNumber;
  res.locals.vatNumber=vatNumber;
  res.locals.featureStoriesEnabled=featureStoriesSetting!=='0';
  res.locals.featureWishlistEnabled=featureWishlistSetting!=='0';
  res.locals.featureAutocompleteEnabled=featureAutocompleteSetting!=='0';
  res.locals.featureRelatedProductsEnabled=featureRelatedProductsSetting!=='0';
  res.locals.appearance=normalizeAppearance({
    brandPrimary:appearanceRaw[0]||undefined,brandAccent:appearanceRaw[1]||undefined,
    font:appearanceRaw[2]||undefined,logo:appearanceRaw[3]||undefined,
    freeShippingMinimum:appearanceRaw[4]||0,
    ...Object.fromEntries(Object.keys(APPEARANCE_SWITCHES).map((key,index)=>[key,appearanceRaw[5+index]]))
  });
  res.locals.shopLogo=res.locals.appearance.logo||'/assets/logo.svg';
  res.locals.cartCount=req.session.cart.reduce((s,i)=>s+Number(i.quantity||0),0);
  res.locals.wishlistCount=Array.isArray(req.session.wishlist)?req.session.wishlist.length:0;
  res.locals.wishlistIds=new Set(Array.isArray(req.session.wishlist)?req.session.wishlist:[]);
  res.locals.path=req.path;
  res.locals.pageText = (value, parameters) => pageText(res.locals.locale, value, parameters);
  res.locals.customerText = (value, parameters) => customerText(res.locals.locale, value, parameters);
  res.locals.newsletterNotice=req.path==='/' && ['check-email','invalid','unavailable'].includes(String(req.query.newsletter||'')) ? String(req.query.newsletter) : '';
  try {
    const configuredBase=new URL(String(process.env.BASE_URL||'').trim());
    res.locals.canonicalBase=configuredBase.protocol==='https:'&&!configuredBase.username&&!configuredBase.password&&configuredBase.pathname==='/'?configuredBase.origin:'';
  } catch { res.locals.canonicalBase=''; }
  res.locals.isAdminRoute=req.path.toLowerCase().startsWith('/admin');
  res.locals.isCheckoutRoute=req.path.toLowerCase().startsWith('/checkout');
  res.locals.app={locals:app.locals};
  const languagePreferences=getUiLanguagePreferences(uiDefaultSetting,uiEnabledSetting,process.env.DEFAULT_LOCALE);
  const acceptedLocales=new Set(languagePreferences.enabledLocales);
  const cookieLocale=String(req.cookies?.shop_lang||'');
  const explicitLocale=(req.method==='GET'||req.method==='HEAD')
    ? indexedLocaleFromQuery(req.query?.lang,languagePreferences.enabledLocales,req.path)
    : null;
  const locale=explicitLocale||(acceptedLocales.has(cookieLocale)?cookieLocale:languagePreferences.defaultLocale);
  // A public URL must identify one language independent of visitor cookies.
  // Keep the existing preference, but redirect it to its own indexable URL.
  if ((req.method==='GET'||req.method==='HEAD') && !explicitLocale &&
      isIndexableStorefrontPath(req.path) && locale!==languagePreferences.defaultLocale) {
    const destination=withSelectedPublicLanguage(req.originalUrl,locale,languagePreferences.defaultLocale);
    if (destination!==req.originalUrl) return res.redirect(302,destination);
  }
  // Opening a shared language URL should also keep that language while the visitor
  // follows normal store links, without altering the merchant's default language.
  if (explicitLocale && explicitLocale !== cookieLocale) {
    res.cookie('shop_lang',explicitLocale,{httpOnly:false,sameSite:'lax',secure:isProd,path:'/',maxAge:1000*60*60*24*365});
  }
  res.locals.locale=locale;
  const unfilteredPageNumber=/^[1-9][0-9]{0,4}$/.test(String(req.query?.page||'')) ? Number(req.query.page) : 1;
  const seoLinks=buildIndexableSeoLinks({baseUrl:res.locals.canonicalBase,pathname:req.path,locale,enabledLocales:languagePreferences.enabledLocales,defaultLocale:languagePreferences.defaultLocale,pageNumber:unfilteredPageNumber});
  // Faceted and search URLs have no stable product corpus: avoid indexing combinations.
  const discoveryParameters=['search','sort','minPrice','maxPrice','min','max','inStock','stock','category','tag'];
  res.locals.seoNoIndex=(req.path==='/shop'||req.path.startsWith('/category/')) &&
    discoveryParameters.some(key=>Object.hasOwn(req.query||{},key));
  res.locals.socialImageUrl='';
  res.locals.breadcrumbJsonLdSafe='';
  res.locals.seoCanonicalUrl=seoLinks.canonical;
  res.locals.seoAlternateLinks=seoLinks.alternates;
  res.locals.organizationJsonLdSafe=req.path==='/' && seoLinks.canonical
    ? serializeJsonLdSafely(buildStoreOrganizationStructuredData({
      legalName,businessAddress,supportEmail,businessPhone,enterpriseNumber,vatNumber,storeName,
      baseUrl:res.locals.canonicalBase
    })) : '';
  res.locals.availableUiLocales=languagePreferences.enabledLocales;
  res.locals.uiLocaleOptions=UI_LOCALE_OPTIONS;
  // Keep language formatting separate from store currency/time-zone configuration.
  const displayLocale=getIntlLocaleForUi(locale);
  res.locals.formatDateTimeDisplay=(value,timeZone=storeTimeZone)=>formatDateTimeDisplay(value,timeZone,displayLocale);
  res.locals.formatPrice = (minorUnits,currency=DEFAULT_STORE_CURRENCY) => { const code=isValidCurrency(currency)?String(currency).toUpperCase():DEFAULT_STORE_CURRENCY; const loc=displayLocale; const digits=currencyMinorUnitDigits(code); return new Intl.NumberFormat(loc,{style:'currency',currency:code,minimumFractionDigits:digits,maximumFractionDigits:digits}).format(Number(minorUnits||0)/currencyMinorUnitFactor(code)); };
  const filterDigits = currencyMinorUnitDigits(res.locals.currency);
  res.locals.priceFilterStep = filterDigits === 0 ? '1' : `0.${'0'.repeat(filterDigits-1)}1`;
  res.locals.formatMoneyInput = formatMoneyInput;
  res.locals.escapeHtml = escapeHtml;
  res.locals.returnTo=req.originalUrl;
  res.locals.paymentMode=launch.paymentMode||PAYMENT_MODES.CASH_ON_DELIVERY;
  res.locals.checkoutCardEnabled=Boolean(launch.paymentStatus?.checkoutCardEnabled);
  res.locals.bankTransferEnabled=Boolean(launch.bankTransferReady);
  res.locals.navCategories=categoryTree(navRows);
  // Only the GET dashboard reuses this request's already fetched launch data.
  if(isPostgresPreview && req.method==='GET' && req.path==='/admin') req.shopLaunchSnapshot=launch;
  next();
  } catch(error) { next(error); }
});
app.post('/language',async(req,res)=>{
  const [defaultSetting,enabledSetting]=await Promise.all([
    getSetting('ui_default_locale',getDefaultUiLocale(process.env.DEFAULT_LOCALE)),
    getSetting('ui_enabled_locales',JSON.stringify(SUPPORTED_UI_LOCALES))
  ]);
  const preferences=getUiLanguagePreferences(defaultSetting,enabledSetting,process.env.DEFAULT_LOCALE);
  const requested=String(req.body.language||'').trim().toLowerCase();
  const locale=preferences.enabledLocales.includes(requested)?requested:preferences.defaultLocale;
  const target=cleanText(req.body.returnTo,500);
  res.cookie('shop_lang',locale,{httpOnly:false,sameSite:'lax',secure:isProd,path:'/',maxAge:1000*60*60*24*365});
  return res.redirect(303,withSelectedPublicLanguage(isSafeLocalPath(target)?target:'/',locale,preferences.defaultLocale));
});

function safeCartError(value) {
  const code=String(value||'').trim();
  return ['unavailable','option','quantity','stock'].includes(code)?code:null;
}
function render(res,view,data={}) {
  const defaults={cartError:null,error:null,returnRequested:false,bankTransferInfo:null,checkoutRecoveryUrl:null,passwordReset:false,mode:'login',next:'',email:'',fullName:'',title:'',description:'',products:[],categories:[],search:'',category:'',sort:'featured',page:1,pageSize:24,hasNext:false,hasPrev:false,resultCount:0,aiSearchUsed:false,securityNotice:null,categoryInfo:null,categoryPath:[],childCategories:[]};
  // Express gives explicit render() options precedence over res.locals. Do not put
  // session/request-local values such as csrf, locale, user, cart or wishlist into
  // the defaults, otherwise every view would silently override the live middleware
  // state and forms would submit an empty CSRF token.
  return res.render(view,{...defaults,...data,...res.locals});
}
function localRedirect(req,res,fallback='/') {
  const ref=req.get('referer');
  try { const u=ref ? new URL(ref) : null; if (u && `${req.protocol}:`===u.protocol && u.host===req.get('host') && u.pathname.startsWith('/') && !u.pathname.startsWith('//')) return res.redirect(303,u.pathname + u.search); } catch {}
  return res.redirect(303,fallback);
}
function cartAddReturnPath(req,slug) {
  const fallback=`/product/${encodeURIComponent(slug)}?added=1`;
  try {
    const ref=req.get('referer');
    const u=ref?new URL(ref):null;
    if(!u || `${req.protocol}:`!==u.protocol || u.host!==req.get('host')) return fallback;
    const allowed=u.pathname==='/' || u.pathname==='/shop' || u.pathname.startsWith('/category/') || u.pathname.startsWith('/product/');
    if(!allowed) return fallback;
    u.searchParams.set('added','1');
    u.searchParams.delete('cartError');
    return `${u.pathname}${u.search}`;
  } catch { return fallback; }
}
function safeNavigationTarget(value, fallback='/account') { const target=cleanText(value,200); return isSafeLocalPath(target) ? target : fallback; }
function guestOrderCookieName(orderId) { return `guest_order_${Number(orderId)}`; }
function isTrustedMollieCheckoutUrl(value) {
  try {
    const url=new URL(String(value||''));
    const host=url.hostname.toLowerCase();
    return url.protocol==='https:'&&!url.username&&!url.password&&!url.port&&
      (host==='mollie.com'||host.endsWith('.mollie.com'));
  } catch { return false; }
}
function guestOrderTokenMatches(order,token) {
  const stored=Buffer.from(String(order?.guest_access_token_hash||''),'hex');
  if(stored.length!==32||!token) return false;
  const supplied=crypto.createHash('sha256').update(String(token)).digest();
  return crypto.timingSafeEqual(stored,supplied);
}
function validGuestOrderToken(req,order) {
  if (!order || order.user_id != null) return '';
  // No bearer is accepted in a URL: it must come from the HttpOnly order cookie
  // or the explicit private-code POST field. Never echo failed codes into a form.
  const candidates=[req.cookies?.[guestOrderCookieName(order.id)],req.body?.guestAccessToken];
  return candidates.find(token=>typeof token==='string'&&token.length<=200&&guestOrderTokenMatches(order,token))||'';
}
function canAccessOrder(req,order) {
  if (!order) return false;
  return order.user_id != null
    ? Boolean(req.user&&Number(order.user_id)===Number(req.user.id))
    : Boolean(validGuestOrderToken(req,order));
}
function rememberGuestOrderAccess(req,res,order) {
  const token=validGuestOrderToken(req,order);
  if (!token) return;
  const options={httpOnly:true,sameSite:'lax',secure:isProd};
  // The original narrower cookie is visible only on the confirmation route.
  // Migrate it after proof so lookup and return forms work on the same browser.
  res.cookie(guestOrderCookieName(order.id),token,{...options,path:'/',maxAge:1000*60*60*24*365});
  res.clearCookie(guestOrderCookieName(order.id),{...options,path:'/checkout/success'});
}
async function aiIsEnabled() {
  return Boolean((await getSetting('ai_enabled','0')) === '1' && aiService?.aiEnabled?.());
}
async function expandCatalogSearch(search,locale='en') {
  if(!String(search||'').trim()||!(await aiIsEnabled())||typeof aiService?.expandProductSearchQueries!=='function') return [];
  try {
    const alternatives=await aiService.expandProductSearchQueries(search,locale);
    return Array.isArray(alternatives)?alternatives.slice(0,3):[];
  } catch {
    // AI is an optional relevance aid. Provider failure falls back to parameterized
    // SQL keyword search; do not log or retain customer-entered search text.
    console.warn('[ai-search] Provider unavailable; using standard catalog search.');
    return [];
  }
}
async function optionalAiShopSearchLimiter(req,res,next) {
  try {
    if(!cleanText(req.query.search,80)||!(await aiIsEnabled())) return next();
    return aiProductSearchLimiter(req,res,next);
  } catch(error) { return next(error); }
}
function paymentNodeEnvironment() {
  // Cloudflare deployments are production even when NODE_ENV was not explicitly
  // supplied as a Worker variable. Local development never defaults to production.
  return process.env.NODE_ENV || (isCloudflareWorker ? 'production' : 'development');
}

async function readPaymentConfiguration() {
  const [modeSetting,providerSetting,merchantCountrySetting,currency,bankContactName,bankContactEmail,bankContactPhone,bankContactReference,
    bankTransferEnabled,bankTransferBankName,bankTransferAccountHolder,bankTransferAccount,bankTransferBic,bankTransferInstructions]=await Promise.all([
    getSetting('payment_mode',PAYMENT_MODES.CASH_ON_DELIVERY),getSetting('payment_provider','none'),getSetting('payment_merchant_country',''),
    getSetting('currency',DEFAULT_STORE_CURRENCY),getSetting('bank_contact_name',''),getSetting('bank_contact_email',''),getSetting('bank_contact_phone',''),getSetting('bank_contact_reference',''),
    getSetting('bank_transfer_enabled','0'),getSetting('bank_transfer_bank_name',''),getSetting('bank_transfer_account_holder',''),getSetting('bank_transfer_account',''),getSetting('bank_transfer_bic',''),getSetting('bank_transfer_instructions','')
  ]);
  const mode=normalizePaymentMode(modeSetting),provider=normalizePaymentProvider(providerSetting),merchantCountry=String(merchantCountrySetting||'').trim().toUpperCase();
  const status=getPaymentProviderStatus({mode,provider,merchantCountry,currency,apiKey:process.env.MOLLIE_API_KEY,baseUrl:process.env.BASE_URL,nodeEnv:paymentNodeEnvironment(),testCheckoutEnabled:process.env.MOLLIE_TEST_CHECKOUT_ENABLED==='true',liveMerchantApproved:process.env.MOLLIE_LIVE_CHECKOUT_APPROVED==='true'});
  const bankTransfer=normalizeBankTransferConfig({enabled:bankTransferEnabled,bankName:bankTransferBankName,accountHolder:bankTransferAccountHolder,account:bankTransferAccount,bic:bankTransferBic,instructions:bankTransferInstructions});
  return {mode,provider,merchantCountry,currency,status,bankContactName,bankContactEmail,bankContactPhone,bankContactReference,bankTransfer};
}

async function refreshMollieFinancialSnapshot(order,payment,actorUserId=null) {
  if(!validateMolliePaymentForOrder(payment,order)) throw new Error('PAYMENT_REFERENCE_MISMATCH');
  // Persist the provider's current financial position. A `paid` status alone does
  // not prove that no later refund or chargeback exists. Unknown/malformed amounts
  // fail closed, and this helper does not alter order fulfilment/status.
  const financialSnapshot=parseMollieFinancialSnapshot(payment,order.currency);
  const financials=await recordMolliePaymentFinancialSnapshot({
    orderId:order.id,paymentId:payment.id,currency:order.currency,refundedCents:financialSnapshot.refundedCents,chargedBackCents:financialSnapshot.chargedBackCents
  });
  if(financials.changed) await safeAudit(actorUserId,'provider_payment_financials_changed','order',order.id,{
    provider:'mollie',currency:financials.currency,refundedCents:financials.refundedCents,chargedBackCents:financials.chargedBackCents
  });
  return financials;
}

async function applyMolliePaymentState(order,payment) {
  if(!validateMolliePaymentForOrder(payment,order)) throw new Error('PAYMENT_REFERENCE_MISMATCH');
  await refreshMollieFinancialSnapshot(order,payment,null);
  const state=String(payment.status||'').toLowerCase();
  if(state==='paid') {
    const amountMinor=parseProviderAmount(payment.amount?.value,order.currency);
    const providerCurrency=String(payment.amount?.currency||'').toUpperCase();
    // Later callbacks can arrive after fulfilment already moved beyond `paid`. Do
    // not attempt to force those legitimate states back through the pending-only
    // transition; payment validation above has already checked the exact amount and
    // currency, and financial snapshots were refreshed independently.
    if(['paid','processing','shipped','completed'].includes(String(order.status||''))) return 'paid';
    const accepted=await markProviderOrderPaid(order.id,'mollie',payment.id,amountMinor,providerCurrency);
    if(!accepted) throw new Error('PAYMENT_ORDER_STATE_MISMATCH');
    return 'paid';
  }
  if(['canceled','expired','failed'].includes(state)&&order.status==='pending') {
    await cancelProviderPendingOrder(order.id,'mollie',payment.id,`Mollie reported payment status: ${state}`);
    return state;
  }
  if(['open','pending'].includes(state)) return 'pending';
  if(state==='authorized') return 'authorized';
  return state||'pending';
}

async function storeLaunchConfig() {
  const [storeName,supportEmail,businessPhone,enterpriseNumber,legalName,businessAddress,privacyPolicy,termsPolicy,shippingPolicy,returnsPolicy,pricesSetting,sellableProducts,shippingFee,currency,deliveryCountriesSetting,marketSetupSetting,currencyReviewSetting,shippingZoneRulesText,taxRulesText,paymentConfig]=await Promise.all([
    getSetting('store_name',storeNameFallback),getSetting('support_email',''),getSetting('business_phone',''),getSetting('enterprise_number',''),getSetting('legal_name',''),getSetting('business_address',''),getSetting('privacy_policy',''),getSetting('terms_policy',''),getSetting('shipping_policy',''),getSetting('returns_policy',''),getSetting('prices_include_tax','0'),getRow(`SELECT COUNT(*) AS c FROM products p WHERE p.active=1 AND p.price_cents>0 AND (CASE WHEN EXISTS(SELECT 1 FROM product_variants pv WHERE pv.product_id=p.id AND pv.active=1) THEN (SELECT COALESCE(SUM(MAX(pv.stock-pv.reserved_stock,0)),0) FROM product_variants pv WHERE pv.product_id=p.id AND pv.active=1) ELSE MAX(p.stock-p.reserved_stock,0) END)>0`),getSetting('shipping_fee_cents','0'),getSetting('currency',DEFAULT_STORE_CURRENCY),getSetting('delivery_countries',''),getSetting('market_setup_mode',MARKET_SETUP_MODES.STANDARD),getSetting('currency_price_review_required','0'),getSetting('shipping_zone_rules',''),getSetting('tax_rules',''),readPaymentConfiguration()
  ]);
  const policyChecks={privacy:String(privacyPolicy||'').trim().length>=40,terms:String(termsPolicy||'').trim().length>=40,shipping:String(shippingPolicy||'').trim().length>=40,returns:String(returnsPolicy||'').trim().length>=40};
  const pricesIncludeTax=pricesSetting==='1';
  const sellableProductCount=Number(sellableProducts?.c||0);
  const parsedCountries=normalizeDeliveryCountries(deliveryCountriesSetting);
  const deliveryCountries=Array.isArray(parsedCountries)?parsedCountries:[];
  const deliveryCountriesConfigured=deliveryCountries.length>0;
  // Shipping fee is stored in the store currency's minor units; 100,000 means major units.
  const shippingConfigured=Math.max(0,Number(shippingFee)||0)<=100000*currencyMinorUnitFactor(currency);
  const shippingRuleValidation=parseShippingZoneRules(shippingZoneRulesText,currency,deliveryCountries);
  const taxRuleValidation=parseTaxRules(taxRulesText,deliveryCountries);
  const pricingRulesValid=shippingRuleValidation.valid&&taxRuleValidation.valid;
  const pricingRulesErrors=[...shippingRuleValidation.errors,...taxRuleValidation.errors];
  const configuredMode=normalizeMarketSetupMode(marketSetupSetting);
  const setupMode=effectiveLaunchMode(configuredMode,deliveryCountries);
  const paymentMode=paymentConfig.mode;
  const currencyPriceReviewRequired=currencyReviewSetting==='1';
  const readinessInputs={mode:setupMode,deliveryCountries,storeName,supportEmail,businessPhone,enterpriseNumber,legalName,businessAddress,policies:setupMode===MARKET_SETUP_MODES.STANDARD ? Object.values(policyChecks).every(Boolean) : {terms:termsPolicy},pricesIncludeTax,shippingConfigured,deliveryCountriesConfigured,sellableProductCount,currencyReviewComplete:!currencyPriceReviewRequired};
  const configurationReady=evaluateLaunchReadiness({...readinessInputs,sellableProductCount:1})&&pricingRulesValid;
  const ready=evaluateLaunchReadiness(readinessInputs)&&pricingRulesValid;
  // Public checkout must not accept orders using the known demo identity or policies.
  const demoIdentity=[legalName,businessAddress,enterpriseNumber,supportEmail,businessPhone,privacyPolicy,termsPolicy,shippingPolicy,returnsPolicy].some(value=>/\b(?:demo|demonstration|simulated|testing purposes|teststraat|fake)\b|example\.(?:com|org|net)|\+32\s*000\s*00\s*00\s*00/i.test(String(value||'')));
  const gateMessage=!pricingRulesValid?'The manager must correct the regional delivery/tax rules in Settings before checkout can accept orders.':launchGateMessage(setupMode);
  return {demoIdentity,storeName,supportEmail,businessPhone,enterpriseNumber,legalName,businessAddress,policies:Object.values(policyChecks).every(Boolean),policyChecks,termsPolicy,pricesIncludeTax,sellableProductCount,shippingConfigured,deliveryCountries,deliveryCountriesConfigured,currencyPriceReviewRequired,paymentMode,paymentProvider:paymentConfig.provider,paymentMerchantCountry:paymentConfig.merchantCountry,paymentStatus:paymentConfig.status,bankTransferReady:paymentConfig.bankTransfer.ready,emailEnabled:emailEnabled(),marketSetupMode:setupMode,shippingZoneRulesText,taxRulesText,pricingRulesValid,pricingRulesErrors,configurationReady,ready,gateMessage};
}
const POLICY_FIELDS = Object.freeze({ privacy:'privacy_policy', terms:'terms_policy', shipping:'shipping_policy', returns:'returns_policy' });
const POLICY_LABELS = Object.freeze({
  en: { privacy:'Privacy policy', terms:'Terms & conditions', shipping:'Shipping policy', returns:'Returns & refunds policy', shippingReturns:'Shipping & returns' },
  ckb: { privacy:'سیاسەتی تایبەتمەندی', terms:'مەرج و ڕێساکان', shipping:'سیاسەتی گەیاندن', returns:'سیاسەتی گەڕاندنەوە و گەڕاندنەوەی پارە', shippingReturns:'گەیاندن و گەڕاندنەوە' },
  ar: { privacy:'سياسة الخصوصية', terms:'الشروط والأحكام', shipping:'سياسة الشحن', returns:'سياسة الإرجاع والاسترداد', shippingReturns:'الشحن والإرجاع' },
  nl: { privacy:'Privacybeleid', terms:'Algemene voorwaarden', shipping:'Verzendbeleid', returns:'Retour- en terugbetalingsbeleid', shippingReturns:'Verzending & retouren' },
  fr: { privacy:'Politique de confidentialité', terms:'Conditions générales', shipping:'Politique de livraison', returns:'Politique de retour et de remboursement', shippingReturns:'Livraison et retours' }
});
async function resolvePolicy(field, locale='en') {
  const baseKey=POLICY_FIELDS[field];
  const [rawFallback,setupMode]=await Promise.all([
    getSetting(baseKey,''),
    getSetting('market_setup_mode',MARKET_SETUP_MODES.STANDARD)
  ]);
  // Incomplete admin drafts must not be published to customers. The English terms
  // threshold follows the selected checkout profile; other policies need 40 chars.
  const fallbackMinimum=field==='terms'
    ? minimumCustomerTermsLength(setupMode)
    : 40;
  const fallbackText=String(rawFallback||'').trim().length>=fallbackMinimum?String(rawFallback):'';
  if(locale==='en') return { body:fallbackText, actualLocale:'en', fallback:false };
  const translated=await getSetting(`${baseKey}_${locale}`,'');
  if(String(translated).trim().length>=40) return { body:translated, actualLocale:locale, fallback:false };
  return { body:fallbackText, actualLocale:'en', fallback:Boolean(String(fallbackText).trim()), requestedLocale:locale };
}

async function policySetForSettings() {
  const values={};
  for(const field of Object.keys(POLICY_FIELDS)){
    values[field]={};
    values[field].en=await getSetting(POLICY_FIELDS[field],'');
    values[field].ckb=await getSetting(`${POLICY_FIELDS[field]}_ckb`,'');
    values[field].ar=await getSetting(`${POLICY_FIELDS[field]}_ar`,'');
    values[field].nl=await getSetting(`${POLICY_FIELDS[field]}_nl`,'');
    values[field].fr=await getSetting(`${POLICY_FIELDS[field]}_fr`,'');
  }
  return values;
}

async function buildAdminSettingsData(overrides={}) {
  const [launch,dbStoreName,currency,dbLegalName,dbBusinessAddress,dbSupportEmail,dbBusinessPhone,dbEnterpriseNumber,dbVatNumber,dbShippingFeeCents,dbDeliveryCountries,pricesSetting,dbAiEnabled,dbFeatures,dbPolicies,marketSetupMode,productsCount,orderCurrencyRows,couponsCount,currencyPriceReviewSetting,dbShippingZoneRules,dbTaxRules,paymentConfig,uiDefaultSetting,uiEnabledSetting]=await Promise.all([
    storeLaunchConfig(),getSetting('store_name',storeNameFallback),getSetting('currency',DEFAULT_STORE_CURRENCY),getSetting('legal_name',''),getSetting('business_address',''),getSetting('support_email',''),getSetting('business_phone',''),getSetting('enterprise_number',''),getSetting('vat_number',''),getSetting('shipping_fee_cents','0'),getSetting('delivery_countries',''),getSetting('prices_include_tax','0'),aiIsEnabled(),Promise.all(['stories','wishlist','autocomplete','related_products'].map(name=>getSetting(`feature_${name}_enabled`,'1'))),policySetForSettings(),getSetting('market_setup_mode',MARKET_SETUP_MODES.STANDARD),
    getRow('SELECT COUNT(*) AS c FROM products'),getRows('SELECT UPPER(currency) AS currency,COUNT(*) AS c FROM orders GROUP BY UPPER(currency) ORDER BY UPPER(currency)'),getRow(`SELECT COUNT(*) AS c FROM coupons WHERE ${CURRENCY_SENSITIVE_COUPON_WHERE}`),getSetting('currency_price_review_required','0'),getSetting('shipping_zone_rules',''),getSetting('tax_rules',''),readPaymentConfiguration(),
    getSetting('ui_default_locale',getDefaultUiLocale(process.env.DEFAULT_LOCALE)),getSetting('ui_enabled_locales',JSON.stringify(SUPPORTED_UI_LOCALES))
  ]);
  const currencyPriceReviewRequired=currencyPriceReviewSetting==='1';
  const currencyProductCount=Number(productsCount?.c||0);
  const currencyCouponCount=Number(couponsCount?.c||0);
  const currencyOrderCurrencies=(Array.isArray(orderCurrencyRows)?orderCurrencyRows:[]).map(row=>({currency:String(row.currency||'').toUpperCase(),count:Number(row.c||0)})).filter(row=>row.currency&&row.count>0);
  const currencyOrderCount=currencyOrderCurrencies.reduce((sum,row)=>sum+row.count,0);
  const selectedCurrencyForOrderCheck=String(overrides.currency||currency).toUpperCase();
  // Historical totals are safe only if every order already uses the selected target currency.
  // This also lets a legacy mismatched setting be corrected back to the currency in its order snapshots.
  const currencyChangeBlockedByOrders=currencyOrderCount>0&&currencyOrderCurrencies.some(row=>row.currency!==selectedCurrencyForOrderCheck);
  const policyLocales=UI_LOCALE_OPTIONS;
  const uiLanguagePreferences=getUiLanguagePreferences(uiDefaultSetting,uiEnabledSetting,process.env.DEFAULT_LOCALE);
  const uiDefaultLocale=overrides.uiDefaultLocale||uiLanguagePreferences.defaultLocale;
  const uiEnabledLocales=Array.isArray(overrides.uiEnabledLocales)?normalizeUiLocalesForForm(overrides.uiEnabledLocales):uiLanguagePreferences.enabledLocales;
  const policies={...dbPolicies,...(overrides.policies||{})};
  for(const field of Object.keys(POLICY_FIELDS)) policies[field]={...dbPolicies[field],...(overrides.policies?.[field]||{})};
  return {launch,storeName:dbStoreName,currency,storedCurrency:currency,uiDefaultLocale,uiEnabledLocales,uiLocaleOptions:UI_LOCALE_OPTIONS,availableCurrencies:SUPPORTED_CURRENCIES,currencyProductCount,currencyCouponCount,currencyOrderCount,currencyOrderCurrencies,currencyChangeBlockedByOrders,currencyChangeNeedsReview:false,currencyPriceReviewRequired,confirmCurrencyPriceReview:false,currencyChanged:false,deliveryCountriesWarning:false,shippingRulesReset:false,marketSetupMode:normalizeMarketSetupMode(marketSetupMode),effectiveMarketSetupMode:launch.marketSetupMode,marketSetupModes:MARKET_SETUP_MODES,legalName:dbLegalName,businessAddress:dbBusinessAddress,supportEmail:dbSupportEmail,businessPhone:dbBusinessPhone,enterpriseNumber:dbEnterpriseNumber,vatNumber:dbVatNumber,shippingFeeCents:Math.max(0,Number(dbShippingFeeCents)||0),deliveryCountries:dbDeliveryCountries,shippingZoneRules:dbShippingZoneRules,taxRules:dbTaxRules,pricingRulesWarning:!launch.pricingRulesValid,pricesIncludeTax:pricesSetting==='1',paymentMode:paymentConfig.mode,paymentProvider:paymentConfig.provider,paymentMerchantCountry:paymentConfig.merchantCountry,paymentStatus:paymentConfig.status,paymentProviders:PAYMENT_PROVIDER_DIRECTORY,merchantCountries:MERCHANT_COUNTRY_OPTIONS,bankContactName:paymentConfig.bankContactName,bankContactEmail:paymentConfig.bankContactEmail,bankContactPhone:paymentConfig.bankContactPhone,bankContactReference:paymentConfig.bankContactReference,bankTransferEnabled:paymentConfig.bankTransfer.enabled,bankTransferBankName:paymentConfig.bankTransfer.bankName,bankTransferAccountHolder:paymentConfig.bankTransfer.accountHolder,bankTransferAccount:paymentConfig.bankTransfer.account,bankTransferBic:paymentConfig.bankTransfer.bic,bankTransferInstructions:paymentConfig.bankTransfer.instructions,bankTransferReady:paymentConfig.bankTransfer.ready,paymentModes:PAYMENT_MODES,paymentProviderIds:PAYMENT_PROVIDER_IDS,aiEnabled:dbAiEnabled,featureStoriesEnabled:dbFeatures[0]!=='0',featureWishlistEnabled:dbFeatures[1]!=='0',featureAutocompleteEnabled:dbFeatures[2]!=='0',featureRelatedProductsEnabled:dbFeatures[3]!=='0',emailEnabled:emailEnabled(),sellableProductCount:launch.sellableProductCount,storeReady:launch.ready,policies,policyLocales,...overrides,privacyPolicy:overrides.policies?.privacy?.en??dbPolicies.privacy.en,termsPolicy:overrides.policies?.terms?.en??dbPolicies.terms.en,shippingPolicy:overrides.policies?.shipping?.en??dbPolicies.shipping.en,returnsPolicy:overrides.policies?.returns?.en??dbPolicies.returns.en};
}

function normalizeUiLocalesForForm(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(item=>String(item||'').trim().toLowerCase()).filter(code=>SUPPORTED_UI_LOCALES.includes(code)))];
}

async function uniqueSlug(base,id=null) {
  // Keep Unicode letters/numbers (including Sorani/Arabic) instead of collapsing
  // non-Latin product names to an opaque `item-*` fallback. URLs are encoded by
  // the storefront, so Unicode slugs remain safe and meaningful.
  const cleaned=String(base||'').normalize('NFKC').toLocaleLowerCase().trim().replace(/[^\p{L}\p{N}\s-]/gu,'').replace(/[\s-]+/gu,'-').replace(/^-+|-+$/gu,'').slice(0,70);
  const rootSlug=cleaned || `item-${Date.now()}`;
  let slug=rootSlug, n=2;
  while(await getRow('SELECT 1 FROM products WHERE slug=? AND id<>?',[slug,id||0])) slug=`${rootSlug.slice(0,60)}-${n++}`;
  return slug;
}
async function uniqueSku(name,id=null) {
  const base=name.toUpperCase().trim().replace(/[^A-Z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,50) || 'ITEM';
  let sku=base,n=2;
  while(await getRow('SELECT 1 FROM products WHERE LOWER(sku)=LOWER(?) AND id<>?',[sku,id||0])) {
    const suffix=`-${n++}`;
    sku=`${base.slice(0,60-suffix.length)}${suffix}`;
  }
  return sku;
}
async function uniqueCategorySlug(base,id=null) {
  const cleaned=String(base||'').normalize('NFKC').toLocaleLowerCase().trim().replace(/[^\p{L}\p{N}\s-]/gu,'').replace(/[\s-]+/gu,'-').replace(/^-+|-+$/gu,'').slice(0,70);
  const rootSlug=cleaned || `category-${Date.now()}`;
  let slug=rootSlug,n=2;
  while(await getRow('SELECT 1 FROM categories WHERE slug=? AND id<>?',[slug,id||0])) slug=`${rootSlug.slice(0,60)}-${n++}`;
  return slug;
}
async function safeImagePath(buffer,mime) {
  // Reject truncated or implausibly large compressed photos before persistence.
  // PNG data is inflated within a fixed budget; JPEG/WebP use complete
  // structural checks without full entropy/pixel decoding.
  if(!assertUploadSignature(buffer,mime) || !readImageDimensions(buffer,mime)) return null;
  const ext=mime==='image/png'?'png':mime==='image/webp'?'webp':'jpg';
  const name=`${crypto.randomBytes(16).toString('hex')}.${ext}`;
  if(usesDatabaseImageStorage){
    const assetPath=`/uploads/${name}`;
    const size=Buffer.byteLength(buffer);
    // Reserve against the app's conservative 2 GiB image budget inside Turso Free.
    // Do not release a reservation after an ambiguous write error unless a query
    // proves the object is absent: over-counting is safer than under-counting.
    const reservation=await run('UPDATE asset_storage_quota SET used_bytes=used_bytes+? WHERE id=1 AND used_bytes+?<=max_bytes',[size,size]);
    if(reservation.changes!==1) throw new Error('IMAGE_STORAGE_QUOTA_REACHED');
    try {
      await db.execute({sql:'INSERT INTO uploaded_assets(path,content_type,data) VALUES(?,?,?)',args:[assetPath,mime,new Uint8Array(buffer)]});
    } catch(error) {
      try {
        const confirmed=await getRow('SELECT path FROM uploaded_assets WHERE path=?',[assetPath]);
        if(!confirmed) await run('UPDATE asset_storage_quota SET used_bytes=MAX(0,used_bytes-?) WHERE id=1',[size]);
      } catch {}
      throw error;
    }
    return assetPath;
  }
  const dir=path.join(root,'public/uploads'); fs.mkdirSync(dir,{recursive:true}); fs.writeFileSync(path.join(dir,name),buffer,{flag:'wx'}); return `/uploads/${name}`;
}
function isRetryableSqliteBusy(error) {
  const visited = new Set();
  const pending = [error];
  while (pending.length) {
    const current = pending.pop();
    if (!current || (typeof current !== 'object' && typeof current !== 'string') || (typeof current === 'object' && visited.has(current))) continue;
    if (typeof current === 'object') visited.add(current);
    if (current?.retryableSqliteBusy === true) return true;
    const code = String(typeof current === 'object' ? (current.code ?? current.rawCode ?? current.sqliteCode ?? '') : '').toUpperCase();
    if (['SQLITE_BUSY','SQLITE_LOCKED','5','6'].includes(code)) return true;
    const message = typeof current === 'string' ? current : String(current.message ?? current);
    if (/\bSQLITE_(?:BUSY|LOCKED)\b|\bdatabase (?:is )?locked\b/i.test(message)) return true;
    if (typeof current === 'object') {
      if (current.cause) pending.push(current.cause);
      if (current.originalError) pending.push(current.originalError);
      if (current.error && current.error !== current) pending.push(current.error);
    }
  }
  return false;
}
async function withBusyRetry(operation, attempts=6) {
  for(let attempt=0;;attempt++){
    try { return await operation(); }
    catch(error){
      // Retry the complete checkout operation, including BEGIN, all SQL, and
      // COMMIT. libSQL can wrap the native SQLITE_BUSY code or expose it only
      // in the message when COMMIT reports statements still in progress.
      if(!isRetryableSqliteBusy(error) || attempt>=attempts-1) throw error;
      await new Promise(resolve=>setTimeout(resolve,25*(2**attempt)));
    }
  }
}
async function uploadedAssetIsReferenced(value, tx = null) {
  // Keep a shared upload alive while any primary image, gallery item, variant,
  // story or category still references it.
  const reference = await getRow(`
    SELECT 1 AS used FROM products WHERE image_url=?
    UNION ALL SELECT 1 AS used FROM product_images WHERE image_url=?
    UNION ALL SELECT 1 AS used FROM product_variants WHERE image_url=?
    UNION ALL SELECT 1 AS used FROM stories WHERE image_url=?
    UNION ALL SELECT 1 AS used FROM categories WHERE image_url=?
    UNION ALL SELECT 1 AS used FROM settings WHERE key IN ('hero_image','appearance_logo') AND value=?
    LIMIT 1`, [value, value, value, value, value, value], tx);
  return Boolean(reference);
}
async function deleteUploadedAsset(url) {
  const value=String(url||'');
  const match=value.match(/^\/uploads\/([a-f0-9]{32}\.(?:png|jpg|webp))$/i);
  if(!match) return;
  if(usesDatabaseImageStorage){
    // Keep the in-use check and BLOB delete within one write transaction. The
    // AFTER DELETE trigger refunds exactly OLD.data bytes in that same transaction.
    await withBusyRetry(async()=>{
      const tx=await db.transaction('write');
      try {
        if(await uploadedAssetIsReferenced(value,tx)) {
          await tx.rollback();
          return;
        }
        await run('DELETE FROM uploaded_assets WHERE path=?',[value],tx);
        await tx.commit();
      } catch(error) {
        try { await tx.rollback(); }
        catch(rollbackError) { logOperationalFailure('Uploaded asset cleanup rollback failed',rollbackError); }
        throw error;
      }
    });
    return;
  }
  // For filesystem-backed local development, the owner mutation is already
  // committed. If any other record still refers to the same path, retain the file.
  if(await uploadedAssetIsReferenced(value)) return;
  try {
    fs.unlinkSync(path.join(root,'public/uploads',match[1]));
  } catch(error) {
    // Missing files are already clean. Any other filesystem failure must remain
    // observable so callers can log it and recover instead of silently orphaning assets.
    if(error?.code!=='ENOENT') throw error;
  }
}
async function safeProductImage(req) {
  const primaryFile=req.file || req.files?.image?.[0];
  if (primaryFile) return safeImagePath(primaryFile.buffer,primaryFile.mimetype);
  const url=cleanText(req.body.imageUrl,500);
  if (url && !isSafeUrl(url)) throw new Error('URL');
  return url || '';
}
async function cartItems(req) {
  const raw=Array.isArray(req.session.cart)?req.session.cart:[];
  const items=[];
  for(const row of raw){
    const id=Number(row?.productId), qty=Number(row?.quantity);
    const rawVariantId=row?.variantId==null||row?.variantId===''?null:Number(row.variantId);
    const variantId=rawVariantId===0?null:rawVariantId;
    if(!Number.isSafeInteger(id)||id<1||!Number.isSafeInteger(qty)||qty<1||qty>100000000||(variantId!==null&&(!Number.isSafeInteger(variantId)||variantId<1))) continue;
    const p=await getProductById(id);
    // Preserve stale cart lines when a product is archived or its option is
    // disabled. Silently dropping them can make the customer place a smaller
    // order than the one they intended.
    if(!p) continue;
    const variants=await listProductVariants(id);
    let variant=null;
    let availableStock=Number(p.available_stock)||0;
    let stockIssue=null;
    if(!p.active){
      stockIssue='product_unavailable';
      availableStock=0;
    }
    if(variants.length){
      variant=variants.find(v=>Number(v.id)===variantId)||null;
      if(!variant){
        variant={id:variantId,option_name:'Option',option_value:'Unavailable'};
        stockIssue=stockIssue||'variant_unavailable';
        availableStock=0;
      } else if(!stockIssue) availableStock=Number(variant.available_stock)||0;
    } else if(variantId!==null){
      variant={id:variantId,option_name:'Option',option_value:'Unavailable'};
      stockIssue=stockIssue||'variant_unavailable';
      availableStock=0;
    }
    if(!stockIssue && availableStock<=0) stockIssue='out_of_stock';
    if(!stockIssue && qty>availableStock) stockIssue='quantity_exceeds_stock';
    if(!stockIssue && qty>99) stockIssue='quantity_exceeds_limit';
    // Preserve the requested quantity when it is too high. Never silently drop
    // the cart line: show an actionable message and let the customer reduce it.
    const quantity=qty;
    const basePrice=app.locals.baseEffectivePrice(p);
    const price=app.locals.effectivePrice(p);
    items.push({productId:id,variantId:variantId!==null?Number(variantId):null,variant,availableStock,quantity,stockIssue,product:p,basePrice,price,total:safeMinorUnitsMultiply(price,quantity),automaticDiscountPercent:Number(p.automatic_discount_percent)||0,automaticDiscount:safeMinorUnitsMultiply(Math.max(0,basePrice-price),quantity)});
  }
  return items;
}
function cartLinesFingerprint(lines) {
  const grouped = new Map();
  for (const line of (Array.isArray(lines) ? lines : [])) {
    const productId = Number(line?.productId ?? line?.product_id ?? line?.product?.id);
    const quantity = Number(line?.quantity);
    const rawVariantId = line?.variantId ?? line?.variant_id;
    const variantId = rawVariantId == null || rawVariantId === '' ? 0 : Number(rawVariantId);
    if (!Number.isSafeInteger(productId) || productId < 1 || !Number.isSafeInteger(quantity) || quantity < 1 ||
        !Number.isSafeInteger(variantId) || variantId < 0) continue;
    const key = `${productId}:${variantId}`;
    grouped.set(key, (grouped.get(key) || 0) + quantity);
  }
  return [...grouped.entries()].map(([key, quantity]) => `${key}:${quantity}`).sort();
}

async function clearCheckoutCartIfUnchanged(req, purchasedItems) {
  const cartSnapshot = Array.isArray(req.session?.cart) ? structuredClone(req.session.cart) : [];
  if (!cartSnapshot.length || JSON.stringify(cartLinesFingerprint(cartSnapshot)) !== JSON.stringify(cartLinesFingerprint(purchasedItems))) return false;
  const couponSnapshot = req.session?.coupon || null;
  const cartRevisionSnapshot = Number(req.session?.cart_revision);
  const cleared = await clearSessionCartAfterOrder(req.sessionId, cartSnapshot, couponSnapshot, cartRevisionSnapshot);
  if (cleared) {
    req.session.cart = [];
    req.session.coupon = null;
  }
  return cleared;
}

async function cartSummary(req, destination=null) {
  const items=await cartItems(req);
  const normalized=items.map(i=>({productId:i.productId,variantId:i.variantId,variant:i.variant,availableStock:i.availableStock,quantity:i.quantity,stockIssue:i.stockIssue,product:i.product,price:i.price,basePrice:i.basePrice,total:i.total,automaticDiscount:i.automaticDiscount,automaticDiscountPercent:i.automaticDiscountPercent}));
  const stockIssues=normalized.filter(i=>Boolean(i.stockIssue));
  const subtotalBeforeAutomaticDiscount=items.reduce((s,i)=>safeMinorUnitsAdd(s,safeMinorUnitsMultiply(i.basePrice,i.quantity)),0);
  const automaticDiscount=items.reduce((s,i)=>safeMinorUnitsAdd(s,i.automaticDiscount),0);
  const subtotal=subtotalBeforeAutomaticDiscount-automaticDiscount;
  const bundleSettings=await Promise.all([getSetting('feature_bundle_enabled','0'),getSetting('bundle_rules_json','[]')]);
  const bundleRules=bundleSettings[0]==='1'?normalizeBundleRules(bundleSettings[1]):[];
  const bundleResult=calculateBundleDiscount(normalized,bundleRules);
  const bundleDiscount=bundleResult.discountCents;
  const bundleConfiguration={enabled:bundleSettings[0],rules:bundleSettings[1]};
  const rawCoupon=req.session.coupon?await getCoupon(req.session.coupon):null;
  const coupon=rawCoupon && subtotal-bundleDiscount>=rawCoupon.min_subtotal_cents ? rawCoupon : null;
  let discount=0;
  if(coupon) discount=coupon.type==='percent'?Math.min(subtotal-bundleDiscount,safePercentOfMinorUnits(subtotal-bundleDiscount,coupon.value)):Math.min(subtotal-bundleDiscount,coupon.value);
  const [shippingSetting,currency,shippingZoneRulesText,taxRulesText,pricesIncludeTaxSetting,deliveryCountriesSetting]=await Promise.all([
    getSetting('shipping_fee_cents','0'),getSetting('currency',DEFAULT_STORE_CURRENCY),getSetting('shipping_zone_rules',''),getSetting('tax_rules',''),getSetting('prices_include_tax','0'),getSetting('delivery_countries','')
  ]);
  const deliveryCountries=normalizeDeliveryCountries(deliveryCountriesSetting)||[];
  const shippingValidation=parseShippingZoneRules(shippingZoneRulesText,currency,deliveryCountries);
  const taxValidation=parseTaxRules(taxRulesText,deliveryCountries);
  const pricingRulesValid=shippingValidation.valid&&taxValidation.valid;
  const baseShipping=Math.max(0,Math.min(100000*currencyMinorUnitFactor(currency),Number(shippingSetting)||0));
  const destinationHasCountry=Boolean(String(destination?.country||'').trim());
  const shippingRule=pricingRulesValid&&destinationHasCountry?selectCommerceRule(shippingValidation.rules,destination):null;
  const shipping=shippingRule?shippingRule.feeCents:baseShipping;
  const taxConfigured=taxValidation.rules.length>0;
  const taxRule=pricingRulesValid&&destinationHasCountry?selectCommerceRule(taxValidation.rules,destination):null;
  const taxNeedsDestination=taxConfigured&&!destinationHasCountry;
  const taxRuleMissing=taxConfigured&&destinationHasCountry&&!taxRule;
  const productTaxBase=Math.max(0,subtotal-bundleDiscount-discount);
  const taxCents=taxRule?calculateConfiguredTax({taxableItemsCents:productTaxBase,shippingCents:shipping,rateBps:taxRule.rateBps,includesTax:pricesIncludeTaxSetting==='1',shippingTaxable:taxRule.shippingTaxable}):0;
  const taxIncluded=Boolean(taxRule&&pricesIncludeTaxSetting==='1');
  const totalBeforeTax=safeMinorUnitsAdd(productTaxBase,shipping);
  const total=taxIncluded?totalBeforeTax:safeMinorUnitsAdd(totalBeforeTax,taxCents);
  const pricingRulesActive=Boolean(String(shippingZoneRulesText||'').trim()||String(taxRulesText||'').trim());
  const pricingConfiguration={currency:String(currency||DEFAULT_STORE_CURRENCY),shippingFeeSetting:String(shippingSetting??'0'),shippingZoneRulesText:String(shippingZoneRulesText??''),taxRulesText:String(taxRulesText??''),pricesIncludeTaxSetting:String(pricesIncludeTaxSetting??'0'),bundleEnabledSetting:bundleConfiguration.enabled,bundleRulesText:bundleConfiguration.rules,deliveryCountriesText:String(deliveryCountriesSetting??'')};
  const pricingConfigHash=crypto.createHash('sha256').update(JSON.stringify(pricingConfiguration)).digest('hex');
  const shippingRuleSnapshot=shippingRule?`${shippingRule.country} | ${shippingRule.city} | ${shippingRule.postalPrefix} | ${shippingRule.feeCents} ${currency} minor units`:'Flat delivery fee fallback';
  const taxRuleSnapshot=taxRule?`${taxRule.country} | ${taxRule.city} | ${taxRule.postalPrefix} | ${(taxRule.rateBps/100).toFixed(2)}% | shipping taxable: ${taxRule.shippingTaxable?'yes':'no'}`:'';
  return {items:normalized,stockIssues,hasStockIssues:stockIssues.length>0,subtotalBeforeAutomaticDiscount,automaticDiscount,bundleDiscount,bundleApplied:bundleResult.applied,subtotal,discount,totalDiscount:safeMinorUnitsAdd(safeMinorUnitsAdd(automaticDiscount,bundleDiscount),discount),shipping,taxCents,taxRateBps:taxRule?taxRule.rateBps:null,taxIncluded,taxConfigured,taxRuleMissing,taxNeedsDestination,pricingRulesActive,pricingRulesValid,pricingRulesErrors:[...shippingValidation.errors,...taxValidation.errors],shippingRuleSnapshot,taxRuleSnapshot,pricingConfiguration,pricingConfigHash,total,coupon,couponIneligible:Boolean(rawCoupon && !coupon)};
}
function checkoutPricingFingerprint(summary,couponCode='') {
  return crypto.createHash('sha256').update(JSON.stringify({
    items:summary.items.map(item=>[item.productId,Number(item.variantId)||0,item.quantity,item.basePrice,item.price,item.total]).sort((a,b)=>String(a[0]+':'+a[1]).localeCompare(String(b[0]+':'+b[1]))),
    subtotalBeforeAutomaticDiscount:summary.subtotalBeforeAutomaticDiscount,automaticDiscount:summary.automaticDiscount,bundleDiscount:summary.bundleDiscount,subtotal:summary.subtotal,discount:summary.discount,coupon:String(couponCode||'').trim().toUpperCase(),currency:summary.pricingConfiguration.currency
  })).digest('hex');
}
function makeCheckoutPricingQuote(req,summary,destination) {
  return {id:crypto.randomBytes(18).toString('base64url'),createdAt:Date.now(),cartRevision:Number(req.session?.cart_revision)||0,cartFingerprint:checkoutPricingFingerprint(summary,req.session?.coupon),pricingConfigHash:summary.pricingConfigHash,country:normalizeCommerceDestinationValue(destination.country),city:normalizeCommerceDestinationValue(destination.city),postalCode:normalizeCommercePostalCode(destination.postalCode),shippingCents:summary.shipping,taxCents:summary.taxCents,taxRateBps:summary.taxRateBps,taxIncluded:summary.taxIncluded,total:summary.total,shippingRuleSnapshot:summary.shippingRuleSnapshot,taxRuleSnapshot:summary.taxRuleSnapshot};
}
function checkoutPricingQuoteMatches(quote,quoteId,req,summary,destination) {
  if(!quote||typeof quote!=='object'||!quoteId||quote.id!==quoteId) return false;
  if(!Number.isFinite(Number(quote.createdAt))||Date.now()-Number(quote.createdAt)>15*60*1000||Date.now()<Number(quote.createdAt)) return false;
  return Number(quote.cartRevision) === (Number(req.session?.cart_revision)||0) &&
    quote.cartFingerprint===checkoutPricingFingerprint(summary,req.session?.coupon) &&
    quote.pricingConfigHash===summary.pricingConfigHash &&
    quote.country===normalizeCommerceDestinationValue(destination.country) &&
    quote.city===normalizeCommerceDestinationValue(destination.city) &&
    quote.postalCode===normalizeCommercePostalCode(destination.postalCode) &&
    quote.shippingCents===summary.shipping && quote.taxCents===summary.taxCents &&
    quote.taxRateBps===summary.taxRateBps && quote.taxIncluded===summary.taxIncluded && quote.total===summary.total;
}

function boundedPage(value,total,pageSize) {
  const parsed=Number(value);
  const requested=Number.isSafeInteger(parsed)&&parsed>0?Math.min(parsed,1000000):1;
  const pages=Math.max(1,Math.ceil(Math.max(0,Number(total)||0)/pageSize));
  return Math.min(requested,pages);
}

app.get('/',async(req,res)=>{
  const [featuredProducts,latestProducts,categories,heroSettings]=await Promise.all([
    listProducts({onlyActive:true,featured:true,sort:'featured',limit:8,offset:0}),
    listProducts({onlyActive:true,sort:'newest',limit:32,offset:0}),
    listCategories({activeOnly:true}),
    Promise.all([
      ...BRANDING_FIELDS.map(field=>getSetting(`hero_${field}_${BRANDING_LOCALES.includes(res.locals.locale)?res.locals.locale:'en'}`,BRANDING_DEFAULTS[BRANDING_LOCALES.includes(res.locals.locale)?res.locals.locale:'en'][field])),
      getSetting('hero_image',''),getSetting('hero_image_mode','catalogue')
    ])
  ]);
  const products=featuredProducts.length ? featuredProducts : latestProducts.slice(0,8);
  // Always give recent, non-featured products a visible place instead of hiding
  // them whenever the store already has four older featured items.
  const homepageIds=new Set(products.map(product=>Number(product.id)));
  const newProducts=latestProducts.filter(product=>!homepageIds.has(Number(product.id))).slice(0,4);
  // A legacy/default /assets hero is not a manager-selected image. Only a real
  // uploaded asset or trusted HTTPS image may override the current catalogue photo.
  // This prevents the old editorial placeholder from masking the seller's product.
  const [heroEyebrow,heroTitle,heroAccent,heroDescription,savedHeroImage,savedHeroImageMode]=heroSettings;
  const rawHeroImage=String(savedHeroImage||'').trim();
  // Only the explicit Manager choice `custom` can replace the product spotlight.
  // Legacy `hero_image` settings are treated as stale defaults and cannot mask new products.
  const heroImage=(savedHeroImageMode==='custom' && (/^\/uploads\/[a-f0-9]{32}\.(?:png|jpg|webp)$/i.test(rawHeroImage)||/^https:\/\//i.test(rawHeroImage)))?rawHeroImage:'';
  // Only a real, store-owned upload or explicit HTTPS product image can be the hero.
  // A legacy /assets path or placeholder must never masquerade as the seller's product.
  const hasRealProductImage=product=>{
    const image=String(product?.image_url||'').trim();
    return /^\/uploads\/[a-f0-9]{32}\.(?:png|jpg|webp)$/i.test(image)||/^https:\/\//i.test(image);
  };
  const heroProduct=latestProducts.find(hasRealProductImage)||null;
  const locale=BRANDING_LOCALES.includes(res.locals.locale)?res.locals.locale:'en';
  render(res,'home',{products,newProducts,hasFeaturedProducts:featuredProducts.length>0,heroProduct,categories,heroEyebrow,heroTitle,heroAccent,heroDescription,heroImage,added:req.query.added==='1'});
});
app.get('/category/:slug',async(req,res)=>{
  const categorySlug=cleanText(req.params.slug,80);
  const categoryInfo=await getCategoryBySlug(categorySlug,{activeOnly:true});
  if(!categoryInfo) return res.status(404).render('error',{title:'Category not found',message:'This category is not available.'});
  const search=cleanText(req.query.search,80),sort=cleanText(req.query.sort,30)||'featured',pageSize=24;
  const filters=readShopFilters(req.query,res.locals.currency||DEFAULT_STORE_CURRENCY);
  const productQuery={search,category:categorySlug,sort,onlyActive:true,minPriceCents:filters.minPriceCents,maxPriceCents:filters.maxPriceCents,inStockOnly:filters.inStockOnly};
  const resultCount=await countProducts(productQuery);
  const page=boundedPage(req.query.page,resultCount,pageSize),offset=(page-1)*pageSize;
  const resolvedSeo=resolveCatalogueSeoPagination({canonical:res.locals.seoCanonicalUrl,alternates:res.locals.seoAlternateLinks,pageNumber:page});
  res.locals.seoCanonicalUrl=resolvedSeo.canonical;
  res.locals.seoAlternateLinks=resolvedSeo.alternates;
  const [pageRows,categories]=await Promise.all([
    listProducts({...productQuery,limit:pageSize+1,offset}),listCategories({activeOnly:true})
  ]);
  const products=pageRows.slice(0,pageSize), allCategories=categories;
  const hasNext=pageRows.length>pageSize;
  const childCategories=allCategories.filter(c=>Number(c.parent_id)===Number(categoryInfo.id));
  const categoryPath=buildCategoryPath(allCategories,categoryInfo.id);
  render(res,'shop',{products,categories,search,category:categorySlug,sort,...filters,page,pageSize,hasNext,hasPrev:page>1,resultCount,aiSearchUsed:false,categoryInfo,childCategories,categoryPath,cartError:safeCartError(req.query.cartError),added:req.query.added==='1',securityNotice:req.query.notice==='security-refresh'});
});
app.get('/shop',optionalAiShopSearchLimiter,async(req,res)=>{
  const search=cleanText(req.query.search,80),category=cleanText(req.query.category,80),sort=cleanText(req.query.sort,30),pageSize=24;
  const filters=readShopFilters(req.query,res.locals.currency||DEFAULT_STORE_CURRENCY);
  // AI only expands the submitted catalog query. Autocomplete remains fast SQL;
  // this full-page search sends only the search text to the configured AI provider.
  const searchAlternatives=search&&!req.aiSearchRateLimited?await expandCatalogSearch(search,res.locals.locale||'en'):[];
  const productQuery={search,searchAlternatives,category,sort,onlyActive:true,minPriceCents:filters.minPriceCents,maxPriceCents:filters.maxPriceCents,inStockOnly:filters.inStockOnly};
  const resultCount=await countProducts(productQuery);
  const page=boundedPage(req.query.page,resultCount,pageSize),offset=(page-1)*pageSize;
  const resolvedSeo=resolveCatalogueSeoPagination({canonical:res.locals.seoCanonicalUrl,alternates:res.locals.seoAlternateLinks,pageNumber:page});
  res.locals.seoCanonicalUrl=resolvedSeo.canonical;
  res.locals.seoAlternateLinks=resolvedSeo.alternates;
  const [pageRows,categories]=await Promise.all([
    listProducts({...productQuery,limit:pageSize+1,offset}),listCategories({activeOnly:true})
  ]);
  const products=pageRows.slice(0,pageSize),hasNext=pageRows.length>pageSize;
  render(res,'shop',{products,categories,search,category,sort,...filters,page,pageSize,hasNext,hasPrev:page>1,resultCount,aiSearchUsed:searchAlternatives.length>0,categoryInfo:null,childCategories:[],categoryPath:[],cartError:safeCartError(req.query.cartError),added:req.query.added==='1',securityNotice:req.query.notice==='security-refresh'});
});
app.get('/api/search',searchLimiter,async(req,res)=>{
  if(!res.locals.featureAutocompleteEnabled)return res.status(404).json({error:'Autocomplete disabled'});
  const q=cleanText(req.query.q,80);
  if(!q) return res.json({results:[]});
  const [results,currency]=await Promise.all([listProducts({search:q,onlyActive:true,limit:6,offset:0}),getSetting('currency',DEFAULT_STORE_CURRENCY)]);
  return res.json({results:results.map(p=>({id:p.id,name:p.name,slug:p.slug,image:app.locals.safeImageUrl(p.image_url),price:app.locals.formatPrice(app.locals.effectivePrice(p),currency),discount:app.locals.discountPercent(p)}))});
});

app.get('/product/:slug',async(req,res)=>{
  const product=await getProductBySlug(cleanText(req.params.slug,100));
  if(!product||!product.active) return res.status(404).render('error',{title:'Product not found',message:'This product is not available.'});
  const isManager=String(req.user?.role||'').trim().toLowerCase()==='manager';
  // Fetch persisted history/reservation facts only for managers so the customer
  // page can show safe lifecycle controls without adding cost to normal browsing.
  const [currency,variants,images,relatedCandidates,shippingFeeSetting,shippingZoneRulesText,deliveryCountriesSetting,managerProduct,reviewData]=await Promise.all([
    getSetting('currency',DEFAULT_STORE_CURRENCY),
    listProductVariants(product.id),
    listProductImages(product.id),
    res.locals.featureRelatedProductsEnabled?listProducts({category:product.category_slug||'',onlyActive:true,limit:12,offset:0,sort:'featured'}):Promise.resolve([]),
    getSetting('shipping_fee_cents','0'),
    getSetting('shipping_zone_rules',''),
    getSetting('delivery_countries',''),
    isManager?getProductById(product.id):Promise.resolve(null),
    res.locals.appearance.reviews ? Promise.all([visibleReviews(product.id),reviewSummary(product.id),req.user?.role==='customer'?userCanReview(req.user.id,product.id):Promise.resolve(false)]) : Promise.resolve([[],{count:0,average:0},false])
  ]);
  const deliveryCountries=normalizeDeliveryCountries(deliveryCountriesSetting);
  const shippingRuleValidation=parseShippingZoneRules(shippingZoneRulesText,currency,deliveryCountries);
  const shippingDisplay={
    rulesConfigured:Boolean(String(shippingZoneRulesText||'').trim()),
    rulesValid:Boolean(shippingRuleValidation.valid&&shippingRuleValidation.rules.length),
    hasDestinationRules:Boolean(String(shippingZoneRulesText||'').trim()&&shippingRuleValidation.valid&&shippingRuleValidation.rules.length),
    feeCents:Math.max(0,Number(shippingFeeSetting)||0)
  };
  let relatedProducts=relatedCandidates.filter(item=>Number(item.id)!==Number(product.id)).slice(0,8);
  if(res.locals.featureRelatedProductsEnabled&&relatedProducts.length<4){
    const generalCandidates=await listProducts({onlyActive:true,limit:16,offset:0,sort:'featured'});
    const already=new Set([Number(product.id),...relatedProducts.map(item=>Number(item.id))]);
    for(const item of generalCandidates){ if(!already.has(Number(item.id))){relatedProducts.push(item);already.add(Number(item.id));} if(relatedProducts.length>=8)break; }
  }
  const base=siteBase(req);
  const productUrl=res.locals.seoCanonicalUrl||`${base}/product/${encodeURIComponent(product.slug)}`;
  const major=minor=>Number(minor||0)/currencyMinorUnitFactor(currency);
  const imageUrl=app.locals.safeImageUrl(product.image_url,'');
  const absoluteImageUrl=imageUrl?(imageUrl.startsWith('http')?imageUrl:`${base}${imageUrl}`):'';
  const selectedVariantId=selectedAvailableVariantId(variants,req.query.variant);
  const structuredVariants=variants.map(variant=>{
    const safeVariantImage=app.locals.safeImageUrl(variant.image_url,'');
    return {...variant,image_url:safeVariantImage?(safeVariantImage.startsWith('http')?safeVariantImage:`${base}${safeVariantImage}`):''};
  });
  const productJsonLd=buildProductStructuredData({
    product,variants:structuredVariants,productUrl,currency,
    price:major(app.locals.effectivePrice(product)).toFixed(currencyMinorUnitDigits(currency)),
    imageUrl:absoluteImageUrl,
    available:Number(product.available_stock)>0
  });
  const productJsonLdSafe=productJsonLd?serializeJsonLdSafely(productJsonLd):'';
  // Only genuine HTTPS product images are suitable for shared social previews.
  res.locals.socialImageUrl=absoluteImageUrl.startsWith('https://')?absoluteImageUrl:'';
  if(base.startsWith('https://')){
    const crumbs=[{'@type':'ListItem',position:1,name:'Home',item:`${base}/`},
      {'@type':'ListItem',position:2,name:'Shop',item:`${base}/shop`}];
    if(product.category_slug && product.category_name){
      crumbs.push({'@type':'ListItem',position:3,name:product.category_name,item:`${base}/category/${encodeURIComponent(product.category_slug)}`});
    }
    crumbs.push({'@type':'ListItem',position:crumbs.length+1,name:product.name,item:productUrl});
    res.locals.breadcrumbJsonLdSafe=serializeJsonLdSafely({'@context':'https://schema.org','@type':'BreadcrumbList',itemListElement:crumbs});
  }
  const [reviews,reviewStats,canReview]=reviewData;
  render(res,'product',{product,managerProduct,isManager,variants,images,shippingDisplay,selectedVariantId,relatedProducts,reviews,reviewStats,canReview,reviewNotice:cleanText(req.query.review,24),alertNotice:cleanText(req.query.alert,24),description:String(product.short_description||product.description||'').slice(0,290),productJsonLdSafe,cartError:safeCartError(req.query.cartError),added:req.query.added==='1'});
});

app.get('/wishlist',requireAuth,async(req,res)=>{
  if(!res.locals.featureWishlistEnabled)return res.status(404).render('error',{title:'Page not found',message:'The wishlist is currently unavailable.'});
  const ids=[...new Set((Array.isArray(req.session.wishlist)?req.session.wishlist:[]).filter(Number.isInteger))].slice(0,50);
  const products=(await Promise.all(ids.map(id=>getProductById(id)))).filter(p=>p&&p.active);
  // Rendering a GET must not overwrite a newer concurrent toggle with this
  // request's session snapshot. The atomic toggle prunes stale IDs itself.
  render(res,'wishlist',{products});
});
app.post('/wishlist/toggle',cartLimiter,requireAuth,async(req,res)=>{
  if(!res.locals.featureWishlistEnabled)return res.status(404).json({error:'Wishlist disabled'});
  const id=parseCartProductId(req.body.productId);
  if(!id) return res.status(404).render('error',{title:'Product not found',message:'This product is not available.'});
  const state=await toggleWishlist(req.sessionId,id);
  if(!state)return res.status(409).json({error:'Session expired. Refresh the page.'});
  req.session.wishlist=state.wishlist;
  if(state.reason==='product-unavailable')return res.status(404).json({error:'This product is not available.',saved:false,count:state.count});
  if(state.reason==='limit')return res.status(409).json({error:'Your wishlist can contain up to 50 products.',saved:false,count:state.count});
  return res.json({saved:state.saved,count:state.count});
});

async function commitCartIntent(req, mutation) {
  const state=await mutateSessionCart(req.sessionId,mutation);
  if(!state)throw new Error('CART_SESSION_EXPIRED');
  req.session.cart=state.cart;
  req.session.cart_json=JSON.stringify(state.cart);
  req.session.cart_revision=state.cart_revision;
}
function cartIntentFailure(req,res,error,slug=null) {
  const code=String(error?.message||'');
  if(code==='CART_QUANTITY'||code==='CART_STOCK')return res.redirect(303,`${slug?`/product/${encodeURIComponent(slug)}`:'/cart'}?cartError=${code==='CART_QUANTITY'?'quantity':'stock'}`);
  if(code==='CART_SESSION_EXPIRED')return res.redirect(303,'/cart?notice=security-refresh');
  if(code==='CART_CONCURRENT_CHANGE'||code==='CART_LINE_LIMIT') {
    const full=code==='CART_LINE_LIMIT';
    const copy={
      en:full?['Your bag is full','Your bag can contain up to 50 different product options. Remove an item before adding another option.']:['Your bag changed','Your bag changed in another request. Refresh the page and try again.'],
      nl:full?['Je winkelmandje is vol','Je winkelmandje kan maximaal 50 verschillende productopties bevatten. Verwijder een artikel voordat je een andere optie toevoegt.']:['Je winkelmandje is gewijzigd','Je winkelmandje is gewijzigd door een andere aanvraag. Vernieuw de pagina en probeer opnieuw.'],
      fr:full?['Votre panier est plein','Votre panier peut contenir jusqu’à 50 options de produit différentes. Retirez un article avant d’ajouter une autre option.']:['Votre panier a changé','Votre panier a été modifié par une autre demande. Actualisez la page et réessayez.'],
      ckb:full?['سەبەتەکەت پڕە','سەبەتەکەت دەتوانێت تا ٥٠ هەڵبژاردەی جیاوازی بەرهەم بگرێت. پێش زیادکردنی هەڵبژاردەیەکی تر کاڵایەک بسڕەوە.']:['سەبەتەکەت گۆڕاوە','سەبەتەکەت لە داواکارییەکی تردا گۆڕاوە. پەڕەکە نوێ بکەرەوە و دووبارە هەوڵ بدەرەوە.'],
      ar:full?['سلتك ممتلئة','يمكن أن تحتوي سلتك على 50 خيار منتج مختلفًا كحد أقصى. احذف منتجًا قبل إضافة خيار آخر.']:['تغيرت سلتك','تم تعديل سلتك من خلال طلب آخر. حدّث الصفحة وحاول مجددًا.']
    };
    const [title,message]=copy[res.locals.locale]||copy.en;
    return res.status(409).render('error',{title,message});
  }
  throw error;
}

app.post('/cart/add',cartLimiter,async(req,res)=>{
  const id=parseCartProductId(req.body.productId),qty=parseCartQuantity(req.body.quantity);
  const variantId=parseCartVariantId(req.body.variantId);
  if(!id||Number.isNaN(variantId)) return res.redirect(303,'/shop?cartError=unavailable');
  const submittedOptionValue=cleanText(req.body.variantValue||'',80).normalize('NFKC');
  const submittedOptionValue2=cleanText(req.body.variantValue2||'',80).normalize('NFKC');
  const p=await getProductById(id);
  if(!p||!p.active) return res.redirect(303,'/shop?cartError=unavailable');
  if(qty===null||qty<1||qty>99) return res.redirect(303,`/product/${encodeURIComponent(p.slug)}?cartError=quantity`);
  const variants=await listProductVariants(id);
  let selectedVariant=null;
  let availableStock=Number(p.available_stock)||0;
  if(variants.length){
    if(submittedOptionValue){
      selectedVariant=variants.find(v=>String(v.option_value).normalize('NFKC')===submittedOptionValue && String(v.option_value_2||'').normalize('NFKC')===submittedOptionValue2)||null;
      // When values are submitted, they must identify the same combination as an
      // explicit variant ID; never silently order a different colour/size.
      if(variantId!==null&&selectedVariant&&Number(selectedVariant.id)!==variantId) return res.redirect(303,`/product/${encodeURIComponent(p.slug)}?cartError=option`);
    } else selectedVariant=variants.find(v=>Number(v.id)===variantId)||null;
    if(!selectedVariant) return res.redirect(303,`/product/${encodeURIComponent(p.slug)}?cartError=option`);
    availableStock=Number(selectedVariant.available_stock)||0;
  } else if(variantId!==null || submittedOptionValue || submittedOptionValue2) return res.redirect(303,`/product/${encodeURIComponent(p.slug)}?cartError=option`);
  try {
    await commitCartIntent(req,cart=>{
      const existing=cart.find(x=>Number(x.productId)===id&&(Number(x.variantId)||0)===(selectedVariant?Number(selectedVariant.id):0));
      const nextQty=(Number(existing?.quantity)||0)+qty;
      if(nextQty>99)throw new Error('CART_QUANTITY');
      if(availableStock<=0||nextQty>availableStock)throw new Error('CART_STOCK');
      if(existing)existing.quantity=nextQty;
      else {if(cart.length>=50)throw new Error('CART_LINE_LIMIT');cart.push({productId:id,...(selectedVariant?{variantId:Number(selectedVariant.id)}:{}),quantity:qty});}
      return cart;
    });
  } catch(error){return cartIntentFailure(req,res,error,p.slug);}
  return res.redirect(303,cartAddReturnPath(req,p.slug));
});
app.post('/cart/update',cartLimiter,async(req,res)=>{
  const id=parseCartProductId(req.body.productId),qty=parseCartQuantity(req.body.quantity);
  const variantId=parseCartVariantId(req.body.variantId);
  if(!id||Number.isNaN(variantId)) return localRedirect(req,res,'/cart');
  const p=await getProductById(id);
  if(!p||qty===null) return localRedirect(req,res,'/cart');
  if(qty>99) return res.redirect(303,'/cart?cartError=quantity');
  if(qty>0){
    const variants=await listProductVariants(id);
    let availableStock=Number(p.available_stock)||0;
    if(variants.length){
      const variant=variants.find(v=>Number(v.id)===variantId);
      if(!variant) return res.redirect(303,'/cart?cartError=option');
      availableStock=Number(variant.available_stock)||0;
    } else if(variantId!==null) return localRedirect(req,res,'/cart');
    if(qty>availableStock) return res.redirect(303,'/cart?cartError=stock');
  }
  try {
    await commitCartIntent(req,cart=>{
      if(qty===0)return cart.filter(x=>!(Number(x.productId)===id&&(Number(x.variantId)||0)===(variantId||0)));
      const item=cart.find(x=>Number(x.productId)===id&&(Number(x.variantId)||0)===(variantId||0));
      if(item)item.quantity=qty;
      return cart;
    });
  } catch(error){return cartIntentFailure(req,res,error);}
  return localRedirect(req,res,'/cart');
});
app.post('/cart/remove',cartLimiter,async(req,res)=>{
  const id=parseCartProductId(req.body.productId),variantId=parseCartVariantId(req.body.variantId);
  if(!id||Number.isNaN(variantId)) return localRedirect(req,res,'/cart');
  try {await commitCartIntent(req,cart=>cart.filter(x=>!(Number(x.productId)===id&&(Number(x.variantId)||0)===(variantId||0))));}
  catch(error){return cartIntentFailure(req,res,error);}
  return localRedirect(req,res,'/cart');
});
app.get('/cart',async(req,res)=>{
  const summary=await cartSummary(req);
  const cleanCart=summary.items.map(i=>({productId:i.productId,...(i.variantId?{variantId:i.variantId}:{}),quantity:i.quantity}));
  const normalized=await saveSessionCart(req.sessionId,cleanCart,{expectedRevision:req.session.cart_revision,expectedCartJson:req.session.cart_json});
  if(normalized)req.session.cart_revision+=1;
  // Clear only the coupon/revision this request actually read. A newer tab's
  // valid coupon/cart must survive stale normalization and empty-bag rendering.
  if(req.session.coupon && (!summary.coupon||!summary.items.length)){
    await saveSessionCoupon(req.sessionId,null,{expectedRevision:req.session.cart_revision,expectedCouponCode:req.session.coupon});
    req.session.coupon=null;
  }
  const couponMessage=cleanText(req.query.couponMessage,40);
  const stockMessage=cleanText(req.query.stockMessage,40);
  render(res,'cart',{...summary,coupon:summary.items.length?summary.coupon:null,discount:summary.items.length?summary.discount:0,couponIneligible:summary.items.length?summary.couponIneligible:false,couponMessage,stockMessage,cartError:safeCartError(req.query.cartError),securityNotice:req.query.notice==='security-refresh'});
});
app.post('/cart/coupon',couponLimiter,async(req,res)=>{
  const action=cleanText(req.body.action,20);
  if(action==='remove'){
    req.session.coupon=null;
    await saveSessionCoupon(req.sessionId,null);
    return res.redirect(303,'/cart?couponMessage=cleared');
  }
  const code=cleanText(req.body.code,40).toUpperCase();
  if(!code) return res.redirect(303,'/cart?couponMessage=empty');
  const coupon=await getCoupon(code);
  // A typo or a code that misses its minimum must not erase a discount that
  // is already valid. Removal is an explicit, separate button above.
  if(!coupon) return res.redirect(303,'/cart?couponMessage=invalid');
  const summary=await cartSummary(req);
  const couponBase=summary.subtotal-summary.bundleDiscount;
  if(couponBase<coupon.min_subtotal_cents) return res.redirect(303,'/cart?couponMessage=minimum');
  req.session.coupon=code;
  await saveSessionCoupon(req.sessionId,code);
  return res.redirect(303,'/cart?couponMessage=applied');
});

const MFA_CHALLENGE_TTL_MS = 5 * 60 * 1000;
const MFA_RATE_WINDOW_MS = 15 * 60 * 1000;
const MFA_MAX_ATTEMPTS = 5;

async function beginManagerMfaChallenge(req,res,user,{rememberMe=false,nextPath='/admin'}={}) {
  // A dedicated encryption key is mandatory; never downgrade to plaintext TOTP seeds.
  const mfaRow = await getUserMfaById(user.id);
  if (!mfaRow || String(mfaRow.role).toLowerCase()!=='manager') throw new Error('MFA_MANAGER_NOT_FOUND');
  let mode = Number(mfaRow.mfa_enabled)===1 ? 'verify' : 'setup';
  if (mode==='setup') {
    const encryptedSecret = encryptTotpSecret(generateTotpSecret());
    if (!await setManagerMfaSecret(user.id,encryptedSecret,user.credentialProof)) throw new Error('MFA_SETUP_STATE_CHANGED');
  } else {
    // Fail closed if a migrated account has an enabled flag but no recoverable seed.
    if (!mfaRow.mfa_secret) throw new Error('MFA_SECRET_MISSING');
    decryptTotpSecret(mfaRow.mfa_secret);
  }

  const oldSession = req.session || {};
  const expiresAt = Date.now()+MFA_CHALLENGE_TTL_MS;
  const nextSid = await dbCreateMfaChallengeSession(oldSession,req.sessionId,user.id,{mode,rememberMe,nextPath,expiresAt,credentialProof:user.credentialProof});
  setSessionCookie(res,nextSid,{...cookieOptions(false),maxAge:MFA_CHALLENGE_TTL_MS});
  return res.redirect(303,mode==='setup'?'/mfa/setup':'/mfa/verify');
}

async function dbCreateMfaChallengeSession(oldSession,oldSessionId,userId,{mode,rememberMe,nextPath,expiresAt,credentialProof}) {
  const sid = await createSession(null,MFA_CHALLENGE_TTL_MS);
  try {
    const token = crypto.randomBytes(24).toString('base64url');
    await setSessionCsrf(sid,token);
    await saveSessionCart(sid,Array.isArray(oldSession.cart)?oldSession.cart:[]);
    await saveSessionWishlist(sid,Array.isArray(oldSession.wishlist)?oldSession.wishlist:[]);
    await saveSessionCoupon(sid,oldSession.coupon||null);
    // These cart helpers normally extend sessions to 14 days. Restore the intended
    // five-minute MFA challenge expiry after copying anonymous session state.
    if (!await setSessionExpiresAt(sid,expiresAt)) throw new Error('MFA_CHALLENGE_SESSION_EXPIRY_FAILED');
    await createMfaLoginChallenge(sid,{userId,mode,rememberMe,nextPath:safeNavigationTarget(nextPath,'/admin'),expiresAtMs:expiresAt,credentialProof});
    await destroySession(oldSessionId);
    return sid;
  } catch(error) {
    try { await destroySession(sid); } catch {}
    throw error;
  }
}

async function managerMfaChallengeForRequest(req) {
  const challenge = await getMfaLoginChallenge(req.sessionId);
  if (!challenge || String(challenge.role).toLowerCase()!=='manager') return null;
  return challenge;
}

async function recordMfaAttempt(challenge,req) {
  return consumeMfaAttempt(challenge.user_id,req.ip||req.socket?.remoteAddress||'unknown',Date.now(),MFA_RATE_WINDOW_MS,MFA_MAX_ATTEMPTS);
}

async function validateManagerMfaCode(userId,submittedCode,req) {
  const row = await getUserMfaById(userId);
  if (!row || String(row.role).toLowerCase()!=='manager' || Number(row.mfa_enabled)!==1 || !row.mfa_secret) return false;
  const code = String(submittedCode||'').trim();
  if (/^\d{6}$/.test(code)) {
    const seed = decryptTotpSecret(row.mfa_secret);
    const step = verifyTotpCode(seed,code,Date.now(),row.mfa_last_totp_step);
    if (step===null) return false;
    return await updateManagerTotpStep(userId,step);
  }
  const hashes = parseRecoveryCodeHashes(row.mfa_recovery_codes_hash);
  const matchedIndex = findRecoveryCodeHashIndex(code,hashes);
  if (matchedIndex<0) return false;
  const replacement = hashes.filter((_,index)=>index!==matchedIndex);
  return await replaceManagerRecoveryHashes(userId,row.mfa_recovery_codes_hash,JSON.stringify(replacement));
}

function renderMfaVerify(res,{error=null,email='',mode='verify'}={}) {
  return render(res,'mfa-verify',{title:mode==='setup'?'Verify authenticator':'Two-factor verification',error,email,mode});
}

// Emergency recovery is deliberately a browser page, but never a public recovery
// endpoint: require NODE_ENV=development, a local-file database, a loopback TCP
// peer, and a loopback Host header. Do not trust X-Forwarded-For for this decision.
function isLocalManagerRecoveryRequest(req) {
  if (process.env.NODE_ENV !== 'development' || process.env.CLOUDFLARE_WORKER === '1') return false;
  const databaseUrl=String(process.env.DATABASE_URL || process.env.SHOP_DATABASE_URL || '').trim();
  if (databaseUrl && !/^file:/i.test(databaseUrl)) return false;
  const remote=String(req.socket?.remoteAddress || '').toLowerCase();
  if (!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(remote)) return false;
  const host=String(req.headers?.host || '').trim().toLowerCase();
  return /^(localhost|127\.0\.0\.1|\[::1\])(?::[0-9]{1,5})?$/.test(host);
}

async function localManagerRecoveryData({error=null,success=null}={}) {
  const manager=await getRow("SELECT id,email,full_name FROM users WHERE role='manager' ORDER BY id LIMIT 1");
  let loginStatus='No Manager account was found in this database.';
  let blocked=false;
  if(manager) {
    const emailHash=crypto.createHash('sha256').update(String(manager.email||'').trim().toLowerCase()).digest('hex');
    const limit=await getRow('SELECT attempts,blocked_until_ms FROM account_login_limits WHERE email_hash=?',[emailHash]);
    const blockedUntil=Number(limit?.blocked_until_ms||0);
    blocked=blockedUntil>Date.now();
    loginStatus=blocked
      ? `The Manager login is blocked until ${new Date(blockedUntil).toLocaleString()}.`
      : Number(limit?.attempts||0)>0
        ? `${Number(limit.attempts)} failed login attempt(s) are recorded in the current window; the account is not currently blocked.`
        : 'No active account-level login block is recorded.';
  }
  return {title:'Local Manager recovery',managerEmail:manager?.email||'',managerName:manager?.full_name||'',managerFound:Boolean(manager),loginStatus,blocked,error,success};
}

app.get('/local-manager-recovery',async(req,res)=>{
  if(!isLocalManagerRecoveryRequest(req)) return res.status(404).render('error',{title:'Page not found',message:'The page you requested does not exist.'});
  res.set('X-Robots-Tag','noindex, nofollow');
  try { return render(res,'local-manager-recovery',await localManagerRecoveryData()); }
  catch(error) { logOperationalFailure('Local Manager recovery status',error); return res.status(503).render('error',{title:'Recovery status unavailable',message:'ShopEasy could not read the local Manager status. No account data was changed.'}); }
});

app.post('/local-manager-recovery',localManagerRecoveryLimiter,async(req,res)=>{
  if(!isLocalManagerRecoveryRequest(req)) return res.status(404).render('error',{title:'Page not found',message:'The page you requested does not exist.'});
  res.set('X-Robots-Tag','noindex, nofollow');
  let completedMessage=null;
  let managerEmailForResponse='';
  try {
    const manager=await getRow("SELECT id,email FROM users WHERE role='manager' ORDER BY id LIMIT 1");
    if(!manager) return res.status(409).render('local-manager-recovery',await localManagerRecoveryData({error:'No Manager account exists in this database. The recovery page will not create or promote an account.'}));
    managerEmailForResponse=String(manager.email||'');
    const suppliedEmail=cleanText(req.body.managerEmail,120).toLowerCase();
    if(suppliedEmail!==managerEmailForResponse.toLowerCase()) return res.status(400).render('local-manager-recovery',await localManagerRecoveryData({error:'Enter the exact Manager email shown on this page.'}));
    const emailHash=crypto.createHash('sha256').update(managerEmailForResponse.trim().toLowerCase()).digest('hex');
    const action=String(req.body.action||'');
    if(action==='unlock') {
      if(cleanText(req.body.confirmation,40)!=='UNLOCK MANAGER') return res.status(400).render('local-manager-recovery',await localManagerRecoveryData({error:'Type UNLOCK MANAGER exactly to confirm.'}));
      await clearAccountLoginFailures(emailHash);
      completedMessage='The account-level login block and failed-attempt counter were cleared. Your current password and MFA settings were not changed.';
      await safeAudit(null,'manager_login_unlocked_local','user',manager.id,{source:'loopback-development-recovery'});
      return render(res,'local-manager-recovery',await localManagerRecoveryData({success:completedMessage}));
    }
    if(action==='reset-password') {
      const password=String(req.body.newPassword??'');
      const confirmation=String(req.body.confirmPassword??'');
      if(!isStrongEnoughPassword(password)) return res.status(400).render('local-manager-recovery',await localManagerRecoveryData({error:'Use a password with 15–200 characters that is not common or repeated.'}));
      if(password!==confirmation) return res.status(400).render('local-manager-recovery',await localManagerRecoveryData({error:'The two new passwords do not match.'}));
      const changed=await updateUserPassword(manager.id,await hashPassword(password));
      if(!changed) return res.status(409).render('local-manager-recovery',await localManagerRecoveryData({error:'The Manager account changed during recovery. Refresh the page and check its current status.'}));
      // Password replacement and session revocation committed together. A later
      // login-block cleanup cannot leave old authenticated sessions active.
      completedMessage='The Manager password was updated. Existing MFA settings and recovery-code hashes were preserved. Sign in with the new password.';
      try { await clearAccountLoginFailures(emailHash); }
      catch(error) { logOperationalFailure('Clear Manager login failures after local password reset',error); completedMessage+=' The stored login-failure block could not be cleared; refresh this page and use “Clear login block” if it is still shown.'; }
      await safeAudit(null,'manager_password_reset_local','user',manager.id,{source:'loopback-development-recovery',mfaPreserved:true});
      return render(res,'local-manager-recovery',await localManagerRecoveryData({success:completedMessage}));
    }
    return res.status(400).render('local-manager-recovery',await localManagerRecoveryData({error:'Choose a valid recovery action.'}));
  } catch(error) {
    logOperationalFailure('Local Manager recovery',error);
    if(completedMessage) {
      return res.status(200).render('local-manager-recovery',{
        title:'Local Manager recovery',managerEmail:managerEmailForResponse,managerName:'Store Manager',managerFound:true,
        loginStatus:'Refresh this page to recheck the login-block status.',blocked:false,error:null,success:completedMessage
      });
    }
    try { return res.status(503).render('local-manager-recovery',await localManagerRecoveryData({error:'Recovery could not be completed. No successful change is confirmed; refresh this page and check the current status.'})); }
    catch { return res.status(503).render('error',{title:'Local recovery unavailable',message:'ShopEasy could not complete or verify the recovery request. Refresh the page and inspect the account status before trying again.'}); }
  }
});

app.get('/login',(req,res)=>{if(req.user&&!managerMustCompleteMfa(req.user))return res.redirect(303,authDestination(req.user.role,req.query.next));return render(res,'login',{error:req.query.notice==='security-refresh'?'Your sign-in form expired. Enter your password again to continue.':req.query.mfa==='required'?'Manager accounts must complete authenticator setup before managing the store.':req.query.mfa==='expired'?'Your five-minute sign-in security challenge expired. Enter your password again to start a fresh verification.':null,signInCancelled:req.query.mfa==='cancelled',next:safeNavigationTarget(req.query.next),mode:req.query.mode==='register'?'register':'login',email:cleanText(req.query.email,120),fullName:'',passwordReset:req.query.reset==='1',emailVerified:req.query.verified==='1'});});
app.get('/register',(req,res)=>{if(managerMustCompleteMfa(req.user))return res.redirect(303,'/login?mfa=required');if(req.user)return res.redirect(303,authDestination(req.user.role,req.query.next));return render(res,'login',{error:null,next:authDestination('customer',req.query.next),mode:'register',email:cleanText(req.query.email,120),fullName:''});});
app.post('/login',loginLimiter,async(req,res)=>{
  if(req.user&&!managerMustCompleteMfa(req.user))return res.redirect(303,authDestination(req.user.role,req.body?.next));
  const requestId=crypto.randomUUID();
  res.set('X-Request-ID',requestId);
  const email=cleanText(req.body.email,120).toLowerCase(),password=String(req.body.password||'');
  const next=cleanText(req.body.next,200);
  const emailHash=crypto.createHash('sha256').update(email).digest('hex');
  try { if(await isAccountLoginBlocked(emailHash)) return render(res,'login',{error:'Email or password does not match. New here? Create an account.',next,mode:'login',email}); }
  catch(error){logOperationalFailure('Account login limit lookup',error);return res.status(503).render('login',{error:'Sign in is temporarily unavailable. Please try again shortly.',next,mode:'login',email});}
  let user;
  try { user=await authenticate(email,password); }
  catch(error) {
    recordLoginFailure({email,ip:req.ip,requestId,reason:'authentication_unavailable'});
    try{await recordAccountLoginFailure(crypto.createHash('sha256').update(email).digest('hex'));}catch(limitError){logOperationalFailure('Account login limit update',limitError);}
    logOperationalFailure('Sign-in',error);
    return res.status(503).render('login',{error:'Sign in is temporarily unavailable. Please try again shortly.',next,mode:'login',email});
  }
  if(!user) {
    recordLoginFailure({email,ip:req.ip,requestId,reason:'invalid_credentials'});
    try{await recordAccountLoginFailure(crypto.createHash('sha256').update(email).digest('hex'));}catch(limitError){logOperationalFailure('Account login limit update',limitError);return res.status(503).render('login',{error:'Sign in is temporarily unavailable. Please try again shortly.',next,mode:'login',email});}
    return render(res,'login',{error:'Email or password does not match. New here? Create an account.',next,mode:'login',email});
  }
  try{await clearAccountLoginFailures(emailHash);}catch(error){logOperationalFailure('Account login limit reset',error);}
  if (String(user.role||'').trim().toLowerCase()==='manager') {
    try {
      return await beginManagerMfaChallenge(req,res,user,{rememberMe:req.body.rememberMe==='on',nextPath:authDestination('manager',next)});
    } catch(error) {
      recordLoginFailure({email,userId:user.id,ip:req.ip,requestId,reason:'mfa_challenge_creation_failed'});
      logOperationalFailure('Manager MFA challenge creation',error);
      const keyMissing=error?.code==='MFA_ENCRYPTION_KEY_NOT_CONFIGURED'||error?.message==='MFA_ENCRYPTION_KEY_NOT_CONFIGURED';
      return res.status(503).render('login',{error:keyMissing?'Manager MFA needs a dedicated 32-byte MFA_ENCRYPTION_KEY in the server .env file before sign-in can continue.':'Secure Manager MFA sign-in could not be prepared. Please try again or check server configuration.',next,mode:'login',email});
    }
  }
  try { await login(req,res,user.id,req.body.rememberMe==='on',user.credentialProof); }
  catch(error) {
    recordLoginFailure({email,userId:user.id,ip:req.ip,requestId,reason:'session_creation_failed'});
    logOperationalFailure('Sign-in session creation',error);
    return res.status(503).render('login',{error:'Your account was found, but sign-in could not be completed. Please try again.',next,mode:'login',email});
  }
  return res.redirect(303,authDestination(user.role,req.body.next));
});
app.get('/mfa/setup',async(req,res)=>{
  const challenge=await managerMfaChallengeForRequest(req);
  if(!challenge) return res.redirect(303,'/login?mfa=expired');
  if(challenge.mode!=='setup') return res.redirect(303,'/mfa/verify');
  if(Number(challenge.mfa_enabled)===1) return res.redirect(303,'/mfa/verify');
  const row=await getUserMfaById(challenge.user_id);
  if(!row?.mfa_secret) return res.status(503).render('error',{title:'Authenticator setup unavailable',message:'The authenticator secret is missing. Sign in again to restart secure setup.'});
  try {
    const secret=decryptTotpSecret(row.mfa_secret);
    const uri=buildTotpUri(secret,row.email,storeNameFallback||'ShopEasy');
    const svg=createMfaQr(uri).svg;
    const qrDataUrl=`data:image/svg+xml;base64,${Buffer.from(svg,'utf8').toString('base64')}`;
    return render(res,'mfa-setup',{title:'Set up two-factor authentication',email:row.email,secret,qrDataUrl,error:null});
  } catch(error) {
    logOperationalFailure('Manager MFA setup QR generation',error);
    return res.status(503).render('error',{title:'Authenticator setup unavailable',message:'ShopEasy could not prepare the authenticator setup. Check MFA_ENCRYPTION_KEY and try again.'});
  }
});

app.post('/mfa/setup',verifyCsrf,async(req,res)=>{
  const challenge=await managerMfaChallengeForRequest(req);
  if(!challenge) return res.redirect(303,'/login?mfa=expired');
  if(challenge.mode!=='setup') return res.status(403).render('error',{title:'MFA setup expired',message:'Sign in again to restart authenticator setup.'});
  try {
    const secret=encryptTotpSecret(generateTotpSecret());
    if(!await setManagerMfaSecret(challenge.user_id,secret,challenge.credentialProof)) return res.status(409).render('error',{title:'MFA setup changed',message:'The Manager MFA setup has changed. Sign in again.'});
    return res.redirect(303,'/mfa/setup');
  } catch(error) {
    logOperationalFailure('Manager MFA secret regeneration',error);
    return res.status(503).render('error',{title:'MFA setup unavailable',message:'ShopEasy could not restart authenticator setup. Check MFA_ENCRYPTION_KEY and try again.'});
  }
});

app.get('/mfa/verify',async(req,res)=>{
  const challenge=await managerMfaChallengeForRequest(req);
  if(!challenge) return res.redirect(303,'/login?mfa=expired');
  if(challenge.mode==='setup') return res.redirect(303,'/mfa/setup');
  if(Number(challenge.mfa_enabled)!==1) return res.redirect(303,'/login?mfa=required');
  return renderMfaVerify(res,{email:challenge.email,mode:'verify',error:null});
});

app.post('/mfa/verify',verifyCsrf,async(req,res)=>{
  const challenge=await managerMfaChallengeForRequest(req);
  if(!challenge) return res.redirect(303,'/login?mfa=expired');
  const attempt=await recordMfaAttempt(challenge,req);
  if(!attempt.allowed) return res.status(429).render('mfa-verify',{title:'Too many attempts',email:challenge.email,mode:challenge.mode,error:'Too many MFA attempts. Try again after 15 minutes.'});
  const code=String(req.body.code||'').trim();

  if(challenge.mode==='setup') {
    const row=await getUserMfaById(challenge.user_id);
    if(!row||String(row.role).toLowerCase()!=='manager'||Number(row.mfa_enabled)===1||!row.mfa_secret) return res.status(403).render('error',{title:'MFA setup expired',message:'The Manager setup state is no longer valid. Sign in again.'});
    let seed,step;
    try { seed=decryptTotpSecret(row.mfa_secret); step=verifyTotpCode(seed,code,Date.now(),row.mfa_last_totp_step); }
    catch(error) {
      logOperationalFailure('Manager MFA setup verification',error);
      return res.status(503).render('mfa-setup',{title:'Set up two-factor authentication',email:row.email,secret:'',qrDataUrl:'',error:'Authenticator setup is temporarily unavailable. Check MFA_ENCRYPTION_KEY and try again.'});
    }
    if(step===null) return res.status(400).render('mfa-setup',{title:'Set up two-factor authentication',email:row.email,secret:seed,qrDataUrl:`data:image/svg+xml;base64,${Buffer.from(createMfaQr(buildTotpUri(seed,row.email,storeNameFallback||'ShopEasy')).svg,'utf8').toString('base64')}`,error:'That code is invalid or expired. Check the authenticator app clock and try the current 6-digit code.'});
    const recoveryCodes=generateRecoveryCodes();
    const recoveryHashes=hashRecoveryCodes(recoveryCodes);
    try {
      if(!await activateManagerMfa(challenge.user_id,{lastTotpStep:step,recoveryHashes,expectedSecret:row.mfa_secret,credentialProof:challenge.credentialProof})) return res.status(409).render('error',{title:'MFA activation conflict',message:'The Manager MFA state changed during setup. Sign in again and check whether MFA is already active.'});
      await clearMfaAttempts(challenge.user_id,req.ip||req.socket?.remoteAddress||'unknown');
      await login(req,res,challenge.user_id,Boolean(challenge.remember_me),challenge.credentialProof);
      return render(res,'mfa-recovery-codes',{title:'Save your recovery codes',codes:recoveryCodes,nextPath:authDestination('manager',challenge.next_path)});
    } catch(error) {
      logOperationalFailure('Manager MFA activation',error);
      return res.status(503).render('error',{title:'MFA activation could not be completed',message:'ShopEasy could not confirm MFA activation. Do not close the setup screen; sign in again and verify the Manager MFA status.'});
    }
  }

  if(Number(challenge.mfa_enabled)!==1) return res.status(403).render('error',{title:'MFA required',message:'The Manager account must finish authenticator setup before sign-in.'});
  let valid=false;
  try { valid=await validateManagerMfaCode(challenge.user_id,code,req); }
  catch(error) {
    logOperationalFailure('Manager MFA login verification',error);
    return res.status(503).render('mfa-verify',{title:'Authenticator verification unavailable',email:challenge.email,mode:'verify',error:'Authenticator verification is temporarily unavailable. Check the server MFA key configuration.'});
  }
  if (!valid) {
    res.status(400);
    return renderMfaVerify(res,{email:challenge.email,mode:'verify',error:'The authenticator code or recovery code is invalid, expired, or already used.'});
  }
  await clearMfaAttempts(challenge.user_id,req.ip||req.socket?.remoteAddress||'unknown');
  try {
    await login(req,res,challenge.user_id,Boolean(challenge.remember_me),challenge.credentialProof);
  } catch(error) {
    logOperationalFailure('Manager MFA session creation',error);
    return res.status(503).render('mfa-verify',{title:'Sign-in unavailable',email:challenge.email,mode:'verify',error:'Your code was verified, but ShopEasy could not create a sign-in session. Please start sign-in again.'});
  }
  return res.redirect(303,authDestination('manager',challenge.next_path));
});

// Explicitly cancel a pending Manager MFA challenge. Browser Back alone cannot
// leave the challenge because the guard correctly redirects protected requests
// back to setup/verification until the challenge is completed or explicitly cleared.
app.post('/mfa/cancel',verifyCsrf,async(req,res)=>{
  try {
    await logout(req,res);
    return res.redirect(303,'/login?mfa=cancelled');
  } catch(error) {
    logOperationalFailure('Manager MFA challenge cancellation',error);
    return res.status(503).render('error',{title:'Could not cancel sign-in',message:'ShopEasy could not clear this sign-in challenge. Close this browser tab, then open the sign-in page in a new tab and retry.'});
  }
});

app.get('/mfa/disable',requireManager,async(req,res)=>{
  return render(res,'mfa-disable',{title:'Disable authenticator',error:null,email:req.user.email});
});

app.post('/mfa/disable',verifyCsrf,requireManager,async(req,res)=>{
  const attempt=await consumeMfaAttempt(req.user.id,req.ip||req.socket?.remoteAddress||'unknown',Date.now(),MFA_RATE_WINDOW_MS,MFA_MAX_ATTEMPTS);
  if(!attempt.allowed) return res.status(429).render('mfa-disable',{title:'Too many attempts',email:req.user.email,error:'Too many MFA attempts. Try again after 15 minutes.'});
  const account=await getUserAuthByEmail(String(req.user.email||'').trim().toLowerCase());
  const passwordValid=Boolean(account&&await verifyPassword(String(req.body.password||''),account.password_hash));
  if(!passwordValid) return res.status(400).render('mfa-disable',{title:'Disable authenticator',email:req.user.email,error:'The current password or authenticator/recovery code is invalid.'});
  let codeValid=false;
  try { codeValid=await validateManagerMfaCode(req.user.id,String(req.body.code||''),req); }
  catch(error) {
    logOperationalFailure('Manager MFA disable verification',error);
    return res.status(503).render('mfa-disable',{title:'Disable authenticator',email:req.user.email,error:'Authenticator verification is temporarily unavailable.'});
  }
  if(!codeValid) return res.status(400).render('mfa-disable',{title:'Disable authenticator',email:req.user.email,error:'The current password or authenticator/recovery code is invalid.'});
  try {
    if(!await disableManagerMfa(req.user.id)) return res.status(409).render('error',{title:'MFA state changed',message:'The Manager MFA state changed. Refresh and sign in again.'});
    await logout(req,res);
    return res.redirect(303,'/login?mfa=required');
  } catch(error) {
    logOperationalFailure('Manager MFA disable',error);
    return res.status(503).render('mfa-disable',{title:'Disable authenticator',email:req.user.email,error:'ShopEasy could not safely disable MFA. Your account state was not confirmed; refresh before retrying.'});
  }
});

app.post('/register',registerLimiter,async(req,res)=>{
  // A signed-in visitor cannot silently replace the active account by posting
  // a second registration form. Require an explicit logout first.
  if(req.user)return res.redirect(303,managerMustCompleteMfa(req.user)?'/login?mfa=required':authDestination(req.user.role,req.body?.next));
  const email=cleanText(req.body.email,120).toLowerCase(),password=String(req.body.password||'');
  const fullName=cleanText(req.body.fullName,120),confirmPassword=String(req.body.confirmPassword||''),termsAccepted=req.body.termsAccepted==='on';
  const registrationLocals={mode:'register',next:authDestination('customer',req.body.next),email,fullName};
  const notice=registrationNotice(res.locals.locale,emailEnabled());
  if(!fullName) return render(res,'login',{...registrationLocals,error:'Enter your full name.'});
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return render(res,'login',{...registrationLocals,error:'Enter a valid email address.'});
  if(!isStrongEnoughPassword(password)) return render(res,'login',{...registrationLocals,error:'Use a password with 15–200 characters that is not common or repeated.'});
  if(password!==confirmPassword) return render(res,'login',{...registrationLocals,error:'The passwords do not match. Please enter them again.'});
  if(!termsAccepted) return render(res,'login',{...registrationLocals,error:'Accept the Terms & Conditions and Privacy Policy to create an account.'});
  let userId, passwordHash;
  // Do the expensive password hash before checking whether the email already
  // exists, so the common duplicate-registration path does not skip PBKDF2.
  try { passwordHash=await hashPassword(password); }
  catch(error) { logOperationalFailure('Customer password hashing',error); return res.status(503).render('login',{...registrationLocals,error:'We could not create your account right now. Please try again shortly.'}); }
  try {
    if(await getUserAuthByEmail(email)) return render(res,'login',{...registrationLocals,mode:'login',fullName:'',notice});
    userId=await createUser(email,passwordHash,'customer',fullName,new Date().toISOString(),false);
  } catch(error) {
    if(error?.code==='SQLITE_CONSTRAINT_UNIQUE'||/unique constraint/i.test(String(error?.message||''))) return render(res,'login',{...registrationLocals,mode:'login',fullName:'',notice});
    logOperationalFailure('Customer account creation',error);
    return res.status(503).render('login',{...registrationLocals,error:'We could not create your account right now. Please try again shortly.'});
  }
  // Every public registration remains pending until ownership is verified.
  // Offline approval replaces the pending password; anonymous registration
  // never creates an authenticated session or exposes address availability.
  if(emailEnabled()) {
    const base=siteBase(req);
    // Do not mint a live verification token if there is no safe public origin.
    // The account remains pending and can be sent a link after BASE_URL is corrected.
    if(!base) {
      console.error('[email] Verification email not issued because BASE_URL is not a valid public origin.');
    } else {
      const token=crypto.randomBytes(32).toString('base64url');
      const tokenHash=crypto.createHash('sha256').update(token).digest('hex');
      try {
        const issued=await createEmailVerificationToken(userId,tokenHash,Date.now()+24*60*60*1000);
        if(issued.created) {
          // Do not let mail-provider response time reveal whether registration
          // created a new account. Delivery failures are logged; the user can resend.
          void (async()=>{const storeName=await getSetting('store_name',storeNameFallback);await sendEmailVerificationEmail({email,token,verifyUrl:`${base}/verify-email?token=${encodeURIComponent(token)}`,storeName,locale:emailLocaleFor(res.locals.locale)});})()
            .catch(error=>logOperationalFailure('Registration verification email',error));
        }
      } catch(error){logOperationalFailure('Registration verification email',error);}
    }
  }
  return render(res,'login',{...registrationLocals,mode:'login',fullName:'',notice});
});
app.get('/verify-email',async(req,res)=>{
  const token=typeof req.query.token==='string'?req.query.token:'';
  res.set({'Cache-Control':'no-store','Referrer-Policy':'no-referrer'});
  if(!/^[A-Za-z0-9_-]{40,60}$/.test(token))return res.status(400).render('error',{title:'Verification link unavailable',message:'This verification link is invalid or expired. Request a new verification email.'});
  try {
    const challenge=await getEmailVerificationChallenge(crypto.createHash('sha256').update(token).digest('hex'));
    if(!challenge)return res.status(400).render('error',{title:'Verification link unavailable',message:'This verification link is invalid, expired or already used. Request a new verification email.'});
    // Opening a link, including a mail scanner's GET, must never activate an
    // attacker-created registration. The original password is separate proof.
    return render(res,'verify-email',{title:'Verify your email address',token,error:null});
  }
  catch(error){logOperationalFailure('Email verification',error);return res.status(503).render('error',{title:'Verification temporarily unavailable',message:'Please try the verification link again later.'});}
});
app.post('/verify-email',emailVerificationConfirmLimiter,verifyCsrf,async(req,res)=>{
  const token=typeof req.body.token==='string'?req.body.token:'';
  const password=typeof req.body.password==='string'?req.body.password:'';
  const failure='This verification could not be completed. Check the link and the password you chose when registering, or request a new link.';
  const view={title:'Verify your email address',token:/^[A-Za-z0-9_-]{40,60}$/.test(token)?token:'',error:failure};
  res.set({'Cache-Control':'no-store','Referrer-Policy':'no-referrer'});
  if(!view.token||!password||password.length>200)return res.status(400).render('verify-email',view);
  try {
    const tokenHash=crypto.createHash('sha256').update(token).digest('hex');
    const challenge=await getEmailVerificationChallenge(tokenHash);
    if(!challenge)return res.status(400).render('verify-email',view);
    const failureKey=crypto.createHash('sha256').update(`email-verification:${challenge.userId}`).digest('hex');
    if(await isAccountLoginBlocked(failureKey))return res.status(429).render('verify-email',view);
    if(!await verifyPassword(password,challenge.passwordHash)){
      await recordAccountLoginFailure(failureKey);
      return res.status(400).render('verify-email',view);
    }
    // The database compares this hash within the token-consumption transaction.
    // A concurrent password reset or approval makes this proof stale.
    const result=await verifyEmailToken(tokenHash,{expectedPasswordHash:challenge.passwordHash});
    if(!result.ok)return res.status(400).render('verify-email',view);
    try {await clearAccountLoginFailures(failureKey);}
    catch(error){logOperationalFailure('Clear email verification attempts',error);}
    return res.redirect(303,'/login?verified=1');
  } catch(error) {
    logOperationalFailure('Email verification confirmation',error);
    return res.status(503).render('verify-email',{...view,error:'Verification is temporarily unavailable. Please try again later.'});
  }
});
app.post('/verify-email/resend',emailVerificationResendLimiter,verifyCsrf,async(req,res)=>{
  const email=cleanText(req.body.email,120).toLowerCase();
  if(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)&&emailEnabled()){
    const base=siteBase(req);
    if(base) {
      try {const user=await getCustomerForVerification(email);if(user&&Number(user.email_verification_required)===1&&!user.email_verified_at){const token=crypto.randomBytes(32).toString('base64url'),tokenHash=crypto.createHash('sha256').update(token).digest('hex');const issued=await createEmailVerificationToken(user.id,tokenHash,Date.now()+24*60*60*1000);if(issued.created){void (async()=>{const storeName=await getSetting('store_name',storeNameFallback);await sendEmailVerificationEmail({email:user.email,token,verifyUrl:`${base}/verify-email?token=${encodeURIComponent(token)}`,storeName,locale:emailLocaleFor(res.locals.locale)});})().catch(error=>logOperationalFailure('Resend verification email',error));}}}catch(error){logOperationalFailure('Resend verification email',error);}
    } else {
      console.error('[email] Verification resend not issued because BASE_URL is not a valid public origin.');
    }
  }
  return res.status(200).render('login',{mode:'login',next:'',email,error:null,notice:'If this account needs verification, a message will be sent shortly.'});
});
app.post('/logout',async(req,res)=>{await logout(req,res);res.redirect(303,'/')});
function resetCodePepper() {
  // Password-recovery codes use a dedicated secret. Never derive this protection
  // from unrelated infrastructure credentials such as the database or mail API key.
  const value=String(process.env.RESET_CODE_SECRET||'').trim();
  return value.length>=24?value:'';
}
function resetCodeDigest(email,code) {
  const pepper=resetCodePepper(); if(!pepper) throw new Error('RESET_CODE_SECRET_NOT_CONFIGURED');
  return crypto.createHmac('sha256',pepper).update(`${String(email).trim().toLowerCase()}:${String(code)}`).digest('hex');
}
app.get('/forgot-password',(req,res)=>render(res,'forgot-password',{sent:req.query.sent==='1',email:'',error:null,next:safeNavigationTarget(req.query.next)}));
app.post('/forgot-password',passwordResetLimiter,async(req,res)=>{
  const next=safeNavigationTarget(req.body.next);
  const email=cleanText(req.body.email,120).toLowerCase();
  const action=String(req.body.action||'send');
  if(action==='reset') {
    const code=String(req.body.code||'').trim();
    const password=String(req.body.password||'');
    const confirm=String(req.body.confirmPassword||'');
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).render('forgot-password',{sent:true,email,next,error:'Enter the same email address you requested the code for.'});
    if(!/^\d{6}$/.test(code)) return res.status(400).render('forgot-password',{sent:true,email,next,error:'Enter the six-digit code from your email.'});
    if(!isStrongEnoughPassword(password)||password!==confirm) return res.status(400).render('forgot-password',{sent:true,email,next,error:password!==confirm?'The passwords do not match.':'Use a password with 15–200 characters that is not common or repeated.'});
    let result={ok:false};
    try { result=await resetPasswordWithCode(email,resetCodeDigest(email,code),await hashPassword(password)); } catch(error) { console.error('[password-reset] code validation failed'); }
    if(!result.ok) return res.status(400).render('forgot-password',{sent:true,email,next,error:'That code is incorrect, expired or has reached its attempt limit. Request a new code and try again.'});
    await safeAudit(result.userId,'password_reset','user',result.userId);
    return res.redirect(303,`/login?reset=1&next=${encodeURIComponent(next)}`);
  }
  // The response does not reveal whether the account exists or whether mail delivery succeeded.
  if(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)&&emailEnabled()&&resetCodePepper()) {
    // Generate/hash a code whether the email exists or not. The email API runs
    // asynchronously so its network latency is not an account-existence oracle.
    const code=String(crypto.randomInt(0,1000000)).padStart(6,'0');
    const codeHash=resetCodeDigest(email,code);
    const user=await getUserAuthByEmail(email).catch(()=>null);
    if(user) {
      try {
        const issued=await createPasswordResetToken(user.id,codeHash,Date.now()+10*60*1000);
        if(issued) { void (async()=>{const storeName=await getSetting('store_name',storeNameFallback);await sendPasswordResetCodeEmail({email:user.email,code,storeName,locale:emailLocaleFor(res.locals.locale)});})().catch(error=>logOperationalFailure('Password-reset email',error)); }
      } catch(error) { logOperationalFailure('Password-reset request',error); }
    }
  }
  return res.status(200).render('forgot-password',{sent:true,email,next,error:null});
});
app.get('/order-lookup',(req,res)=>render(res,'order-lookup',{order:null,lookupAttempted:false,error:null,lookupEmail:'',lookupOrderNumber:/^\d{1,12}$/.test(String(req.query.order||''))?String(req.query.order):'',securityNotice:req.query.notice==='security-refresh'}));
app.post('/order-lookup',orderLookupLimiter,verifyCsrf,async(req,res)=>{
  res.set('Cache-Control','no-store'); res.set('Pragma','no-cache');
  const orderNumber=String(req.body.orderNumber||'').trim(),email=cleanText(req.body.email,120).toLowerCase();
  if(!/^\d{1,12}$/.test(orderNumber)||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return res.status(200).render('order-lookup',{order:null,lookupAttempted:true,error:'We could not find an order matching those details.',lookupEmail:email});
  try {
    const order=await findOrderForLookup(Number(orderNumber),email);
    if(!order||!canAccessOrder(req,order))return res.status(200).render('order-lookup',{order:null,lookupAttempted:true,error:'We could not find an order matching those details.',lookupEmail:email});
    rememberGuestOrderAccess(req,res,order);
    return render(res,'order-lookup',{order,bankTransferInfo:parseBankTransferSnapshot(order.payment_instructions_snapshot),lookupAttempted:true,error:null,lookupEmail:email});
  }
  catch(error){logOperationalFailure('Order lookup',error);return res.status(503).render('order-lookup',{order:null,lookupAttempted:true,error:'Order lookup is temporarily unavailable. Please try again later.',lookupEmail:email});}
});
app.post('/order/:id/return-request',returnRequestLimiter,verifyCsrf,async(req,res)=>{
  res.set('Cache-Control','no-store'); res.set('Pragma','no-cache');
  const orderId=validId(req.params.id)?Number(req.params.id):null;
  const email=cleanText(req.body.email||req.user?.email,120).toLowerCase();
  if(!orderId||!email||!/^\S+@[^\s@]+\.[^\s@]+$/.test(email))return res.status(404).render('error',{title:'Order not found',message:'This order is not available.'});
  const order=await findOrderForLookup(orderId,email);
  if(!order||order.status!=='completed'||!canAccessOrder(req,order))return res.status(404).render('error',{title:'Order not found',message:'This order is not available.'});
  rememberGuestOrderAccess(req,res,order);
  const orderItemId=validId(req.body.orderItemId)?Number(req.body.orderItemId):null,quantity=parseCartQuantity(req.body.quantity),requestType=String(req.body.requestType||''),reasonCode=String(req.body.reasonCode||'other');
  const reasonLabels={damaged:'Damaged item',wrong_item:'Wrong item received',not_as_described:'Not as described',changed_mind:'Changed my mind',other:'Other'};
  const note=cleanText(req.body.note||req.body.reason,800),reason=`${reasonLabels[reasonCode]||'Other'}${note?`: ${note}`:''}`;
  if(!reasonLabels[reasonCode]||note.length>800)return res.status(400).render('order-lookup',{order,bankTransferInfo:parseBankTransferSnapshot(order.payment_instructions_snapshot),lookupAttempted:true,error:'Choose a valid reason and try again.',lookupEmail:email});
  try {
    const rawDays=Number.parseInt(process.env.RETURN_WINDOW_DAYS||'0',10);
    const requestId=await createOrderReturnRequest({orderId,userId:order.user_id==null?null:order.user_id,orderItemId,quantity,requestType,reason,returnWindowDays:Number.isFinite(rawDays)?Math.max(0,rawDays):0});
    await sendReturnRequestEmail({email:order.email,orderId,requestId,status:'requested',storeName:await getSetting('store_name',storeNameFallback),locale:emailLocaleFor(res.locals.locale)}).catch(error=>logOperationalFailure('Return request email',error));
    return render(res,'order-lookup',{order,bankTransferInfo:parseBankTransferSnapshot(order.payment_instructions_snapshot),lookupAttempted:true,error:null,returnRequested:true,lookupEmail:email});
  } catch(error){if(!String(error?.message||'').startsWith('RETURN_'))logOperationalFailure('Customer return request',error);return res.status(400).render('order-lookup',{order,bankTransferInfo:parseBankTransferSnapshot(order.payment_instructions_snapshot),lookupAttempted:true,error:'The return request could not be submitted. Check the item and quantity, or contact the store.',lookupEmail:email});}
});
app.get('/account',requireAuth,async(req,res)=>{
  const total=await countUserOrders(req.user.id),pageSize=20,page=boundedPage(req.query.page,total,pageSize),offset=(page-1)*pageSize;
  const orders=await listUserOrders(req.user.id,pageSize,offset);
  render(res,'account',{orders,total,page,pageSize,hasNext:offset+orders.length<total,hasPrev:page>1});
});
app.get('/account/security',requireAuth,async(req,res)=>render(res,'account-security',{error:null,changed:req.query.changed==='1'}));
app.post('/account/security',loginLimiter,requireAuth,async(req,res)=>{
  const current=String(req.body.currentPassword||''),nextPassword=String(req.body.newPassword||''),confirm=String(req.body.confirmPassword||'');
  const auth=await getUserAuthByEmail(req.user.email);
  if(!auth || !await verifyPassword(current,auth.password_hash) || !isStrongEnoughPassword(nextPassword) || nextPassword!==confirm) return res.status(400).render('account-security',{error:'Check your current password and use a new password with 15–200 characters that is not common or repeated.',changed:false});
  if(!await updateUserPassword(req.user.id,await hashPassword(nextPassword),{keepSessionId:req.sessionId,expectedPasswordHash:auth.password_hash})) return res.status(500).render('account-security',{error:'The password could not be changed. Please try again.',changed:false});
  await safeAudit(req.user.id,'password_changed','user',req.user.id);
  return res.redirect(303,'/account/security?changed=1');
});

app.get('/account/order/:id',requireAuth,async(req,res)=>{
  const orderId=validId(req.params.id)?Number(req.params.id):null;
  const order=orderId?await getOrder(orderId):null;
  if(!order||order.user_id!==req.user.id)return res.status(404).render('error',{title:'Order not found',message:'This order is not available.'});
  const [orderHistory,returns]=await Promise.all([listOrderStatusHistory(order.id),listOrderReturns(order.id)]);
  return render(res,'order',{order,bankTransferInfo:parseBankTransferSnapshot(order.payment_instructions_snapshot),orderHistory,returns,cancelResult:cleanText(req.query.cancel,30),returnResult:cleanText(req.query.return,30),securityNotice:req.query.notice==='security-refresh'});
});
async function cancelCustomerOrder(order,reason,userId,{guest=false}={}) {
  if(hasPendingCancellationRequest(order))return 'already-requested';
  if(canRequestOrderCancellation(order)) {
    if(!reason)return 'reason-required';
    const changed=await requestOrderCancellation(order.id,reason,userId);
    if(changed) {
      await safeAudit(userId,'order_cancellation_requested','order',order.id,{reason,bankTransferPending:order.payment_provider==='bank_transfer'});
      return 'requested';
    }
    const current=await getOrder(order.id);
    return hasPendingCancellationRequest(current)?'already-requested':'unavailable';
  }
  if(canCancelOpenOrder(order)) {
    const changed=await cancelPendingOrder(order.id,reason,'customer',userId);
    if(!changed)return 'changed';
    await safeAudit(userId,guest?'guest_order_cancelled':'order_cancelled_by_customer','order',order.id,{reason:reason||'No reason provided'});
    await maybeSendOrderNotification(order.id,'status');
    return 'cancelled';
  }
  return order.status==='pending'&&order.payment_provider==='mollie'?'provider-pending':'unavailable';
}

app.post('/account/order/:id/cancel',requireAuth,checkoutLimiter,verifyCsrf,async(req,res)=>{
  const orderId=validId(req.params.id)?Number(req.params.id):null;
  const order=orderId?await getOrder(orderId):null;
  if(!order||order.user_id!==req.user.id)return res.status(404).render('error',{title:'Order not found',message:'This order is not available.'});
  const reason=cleanText(req.body.reason,500);
  const outcome=await cancelCustomerOrder(order,reason,req.user.id,{guest:false});
  return res.redirect(303,`/account/order/${order.id}?cancel=${encodeURIComponent(outcome)}`);
});

app.post('/account/order/:id/returns',requireAuth,checkoutLimiter,verifyCsrf,async(req,res)=>{
  const orderId=validId(req.params.id)?Number(req.params.id):null;
  const order=orderId?await getOrder(orderId):null;
  if(!order||order.user_id!==req.user.id)return res.status(404).render('error',{title:'Order not found',message:'This order is not available.'});
  const itemId=validId(req.body.orderItemId)?Number(req.body.orderItemId):null;
  const quantity=parseCartQuantity(req.body.quantity),requestType=cleanText(req.body.requestType,20),reason=cleanText(req.body.reason,1000);
  try {
    const rawDays=Number.parseInt(process.env.RETURN_WINDOW_DAYS||'0',10);
    const requestId=await createOrderReturnRequest({orderId:order.id,userId:req.user.id,orderItemId:itemId,quantity,requestType,reason,returnWindowDays:Number.isFinite(rawDays)?Math.max(0,rawDays):0});
    await sendReturnRequestEmail({email:order.email,orderId:order.id,requestId,status:'requested',storeName:await getSetting('store_name',storeNameFallback),locale:emailLocaleFor(res.locals.locale)}).catch(error=>logOperationalFailure('Return request email',error));
    await safeAudit(req.user.id,'order_return_requested','order',order.id,{requestType,orderItemId:itemId,quantity});
    return res.redirect(303,`/account/order/${order.id}?return=requested`);
  } catch(error) {
    const messages={GIFT_CARD_BALANCE:'The gift card cannot cover this order, is expired, or uses another currency.',GIFT_CARD_INVALID:'Enter the complete gift card code.',GIFT_CARD_DISABLED:'Gift-card checkout is not enabled.',RETURN_VALIDATION:'Choose an item, a valid quantity and a reason of at least five characters.',RETURN_ORDER_NOT_FOUND:'This order is not available.',RETURN_ORDER_NOT_DELIVERED:'Returns can only be requested after the order is marked delivered.',RETURN_ITEM_NOT_FOUND:'The selected item does not belong to this order.',RETURN_WINDOW_CLOSED:'The configured return window has passed. Contact the store to ask for a manual review.',RETURN_QUANTITY_EXCEEDED:'The quantity requested exceeds the remaining quantity available for return.'};
    const [orderHistory,returns]=await Promise.all([listOrderStatusHistory(order.id),listOrderReturns(order.id)]);
    return res.status(400).render('order',{order,bankTransferInfo:parseBankTransferSnapshot(order.payment_instructions_snapshot),orderHistory,returns,cancelResult:'',securityNotice:false,returnError:messages[error?.message]||'The return request could not be saved. Please refresh and try again.'});
  }
});

app.post('/payments/mollie/webhook',paymentWebhookLimiter,async(req,res)=>{
  const paymentId=cleanText(req.body?.id,80);
  if(!/^tr_[A-Za-z0-9]+$/.test(paymentId)) return res.sendStatus(400);
  let payment;
  try {
    payment=await getMolliePayment(paymentId,{apiKey:process.env.MOLLIE_API_KEY,nodeEnv:paymentNodeEnvironment()});
  } catch(error) {
    logOperationalFailure('Mollie webhook verification',error);
    // Return non-2xx so Mollie can retry if our provider API/key/network is down.
    return res.sendStatus(503);
  }
  let order;
  try {
    order=await findOrderByPaymentReference('mollie',paymentId);
    if(!order) {
      // Mollie can deliver the webhook after its POST succeeds but before checkout
      // persists payment_reference. Recover only through the provider's own order
      // metadata, and then verify the exact order, amount, currency and payment ID.
      // Never associate a payment by email, browser input, or a customer redirect.
      const metadataOrderId=String(payment?.metadata?.shopEasyOrderId||'');
      if(/^[1-9]\d{0,14}$/.test(metadataOrderId)) {
        const candidateId=Number(metadataOrderId);
        if(Number.isSafeInteger(candidateId)&&candidateId>0) {
          const candidate=await getOrder(candidateId);
          const candidateHasNoReference=!String(candidate?.payment_reference||'').trim();
          const candidateReferenceMatches=String(candidate?.payment_reference||'')===paymentId;
          if(candidate&&candidate.status==='pending'&&candidate.payment_provider==='mollie'&&
             (candidateHasNoReference||candidateReferenceMatches)&&
             validateMolliePaymentForOrder(payment,{...candidate,payment_reference:paymentId})) {
            const checkoutUrl=isTrustedMollieCheckoutUrl(payment?._links?.checkout?.href)?payment._links.checkout.href:null;
            const attached=await attachReconciledMolliePaymentReference(candidate.id,paymentId,checkoutUrl);
            if(attached) order=await getOrder(candidate.id);
          }
        }
      }
    }
  } catch(error) { logOperationalFailure('Mollie webhook order lookup/recovery',error); return res.sendStatus(503); }
  if(!order) {
    // No verified matching order means there is no safe mutation to apply. A random
    // or delayed event must never create an order or be associated by customer input.
    console.warn('[payments] Mollie event received without a verified matching ShopEasy order.');
    return res.sendStatus(200);
  }
  try {
    const beforeStatus=order.status;
    const resolved=await applyMolliePaymentState(order,payment);
    const refreshed=await getOrder(order.id);
    if(resolved==='paid'&&beforeStatus==='pending'&&refreshed?.status==='paid') {
      await safeAudit(null,'provider_payment_confirmed','order',order.id,{provider:'mollie',currency:order.currency,total:order.total_cents});
      await maybeSendOrderNotification(order.id,'confirmation');
    } else if(['canceled','expired','failed'].includes(resolved)&&beforeStatus==='pending'&&refreshed?.status==='cancelled') {
      await safeAudit(null,'provider_payment_not_completed','order',order.id,{provider:'mollie',providerStatus:resolved});
    }
    return res.sendStatus(200);
  } catch(error) {
    if(['PAYMENT_REFERENCE_MISMATCH','PAYMENT_ORDER_STATE_MISMATCH'].includes(error?.message)) {
      logOperationalFailure('Mollie webhook refused mismatched payment data',error);
      return res.sendStatus(200);
    }
    logOperationalFailure('Mollie webhook state transition',error);
    return res.sendStatus(503);
  }
});

function checkoutAccess(req,launch){
  const production=process.env.VERCEL_ENV==='production';
  const managerTest=isPostgresPreview&&production&&launch.demoIdentity;
  return {managerTest,quoteOnly:isPostgresPreview&&!production};
}
const checkoutPriceLimiter=makeRateLimiter('checkout-price',{windowMs:10*60*1000,max:120,standardHeaders:true,legacyHeaders:false,message:'Too many price requests. Please try again later.'});
app.post('/checkout-price',checkoutPriceLimiter,async(req,res)=>{
  res.set('Cache-Control','private, no-store');
  const launch=await storeLaunchConfig();
  const country=matchDeliveryCountry(cleanText(req.body.shippingCountry,80),launch.deliveryCountries);
  const city=cleanText(req.body.shippingCity,100);
  const postalCode=cleanText(req.body.shippingPostalCode,20);
  if(!launch.ready||!country||!city) return res.status(400).json({error:'Complete your delivery destination.'});
  const destination={country,city,postalCode};
  const summary=await cartSummary(req,destination);
  if(!summary.items.length||summary.hasStockIssues||!summary.pricingRulesValid&&summary.pricingRulesActive||summary.taxRuleMissing) return res.status(409).json({error:'Delivery pricing or stock is unavailable. Review your cart and destination.'});
  const quote=makeCheckoutPricingQuote(req,summary,destination);
  await saveSessionCheckoutQuote(req.sessionId,quote);
  const currency=String(await getSetting('currency',DEFAULT_STORE_CURRENCY)).trim().toUpperCase();
  const price=n=>res.locals.formatPrice(n,currency);
  return res.json({quoteId:quote.id,total:price(summary.total),shipping:price(summary.shipping),tax:price(summary.taxCents),taxRate:summary.taxRateBps===null?null:(summary.taxRateBps/100).toFixed(2),taxIncluded:summary.taxIncluded,subtotal:price(summary.subtotalBeforeAutomaticDiscount),discount:price(summary.discount),automaticDiscount:price(summary.automaticDiscount),bundleDiscount:price(summary.bundleDiscount)});
});
app.get('/checkout',async(req,res)=>{
  let summary=await cartSummary(req);
  if(!summary.items.length)return res.redirect('/cart');
  const credentials=await getSessionCheckoutCredentials(req.sessionId);
  const guestAccessToken=!req.user?String(credentials?.checkout_guest_token||''):'';
  const idempotencyKey=String(credentials?.checkout_idempotency_key||'');
  let recoveryOrder=null;
  if(idempotencyKey) {
    const prior=await getOrderByClientToken(idempotencyKey);
    const guestHash=guestAccessToken?crypto.createHash('sha256').update(guestAccessToken).digest('hex'):null;
    const ownsPrior=Boolean(prior&&(req.user?prior.user_id===req.user.id:prior.user_id==null&&guestHash&&prior.guest_access_token_hash===guestHash));
    if(ownsPrior&&prior.status==='pending'&&prior.payment_provider==='mollie') {
      const existing=await getOrder(prior.id);
      if(existing) {
        const shipping={name:existing.shipping_name,address:existing.shipping_address,city:existing.shipping_city,postalCode:existing.shipping_postal_code,country:existing.shipping_country};
        const destinationSummary=await cartSummary(req,{country:shipping.country,city:shipping.city,postalCode:shipping.postalCode});
        const currency=String(await getSetting('currency',DEFAULT_STORE_CURRENCY)).trim().toUpperCase();
        if(checkoutIntentMatchesOrder(existing,{summary:destinationSummary,paymentProvider:'mollie',email:existing.email,customerPhone:existing.customer_phone,shipping,customerNote:existing.customer_note,currency})) {
          recoveryOrder=existing;
          summary=destinationSummary;
        }
      }
    }
  }
  // A refresh may recover the customer's own last-unit reservation. POST still
  // revalidates ownership, the complete intent, provider credential and retry age.
  if(summary.hasStockIssues&&!recoveryOrder)return res.redirect(303,'/cart?stockMessage=changed');
  const [launch,termsPolicy,payments]=await Promise.all([storeLaunchConfig(),resolvePolicy('terms',res.locals.locale||'en'),readPaymentConfiguration()]);
  const access=checkoutAccess(req,launch);
  res.locals.demoCheckoutOnly=access.quoteOnly;
  res.locals.managerTestCheckout=access.managerTest;
  const checkoutForm=recoveryOrder?{paymentMethod:'card',customerPhone:recoveryOrder.customer_phone,shippingName:recoveryOrder.shipping_name,shippingAddress:recoveryOrder.shipping_address,shippingCity:recoveryOrder.shipping_city,shippingPostalCode:recoveryOrder.shipping_postal_code,shippingCountry:recoveryOrder.shipping_country,customerNote:recoveryOrder.customer_note}:{paymentMethod:'cash_on_delivery'};
  if(recoveryOrder)res.locals.storeReady=launch.configurationReady;
  render(res,'checkout',{summary,storeReady:recoveryOrder?launch.configurationReady:launch.ready,paymentMode:payments.mode,checkoutCardEnabled:payments.status.checkoutCardEnabled,bankTransferEnabled:payments.bankTransfer.ready,giftCardsEnabled:(await getSetting('feature_gift_cards_enabled','0'))==='1',customerEmail:recoveryOrder?.email||req.user?.email||'',guestAccessToken,deliveryCountries:launch.deliveryCountries,marketSetupMode:launch.marketSetupMode,pricesIncludeTax:launch.pricesIncludeTax,pricingRulesActive:summary.pricingRulesActive,quoteReady:Boolean(recoveryOrder),quoteId:'',quoteMessage:'',checkoutForm,termsFallback:termsPolicy.fallback,termsActualLocale:termsPolicy.actualLocale,error:(recoveryOrder?launch.configurationReady:launch.ready)?null:launch.gateMessage,idempotencyKey,securityNotice:req.query.notice==='security-refresh'});
});
app.post('/checkout',checkoutDiagnosticStage('checkout-rate-limit'),checkoutLimiter,async(req,res,next)=>{
  // Catch and label every pre-order operation as well as the order transaction.
  // The previous inner try/catch began only after cart, store, session, pricing
  // and idempotency reads; failures in those operations reached the generic
  // error page without a checkout-specific stage in the development log.
  let checkoutStage='initial-cart-summary';
  const setCheckoutStage=(stage)=>{ checkoutStage=stage; markCheckoutDiagnosticStage(req,stage); };
  setCheckoutStage('initial-cart-summary');
  try {
  let summary=await cartSummary(req);
  if(!summary.items.length) return res.redirect(303,'/cart');
  setCheckoutStage('store-and-payment-configuration');
  const [launch,payments]=await Promise.all([storeLaunchConfig(),readPaymentConfiguration()]);
  const access=checkoutAccess(req,launch);
  res.locals.demoCheckoutOnly=access.quoteOnly;
  res.locals.managerTestCheckout=access.managerTest;
  setCheckoutStage('session-checkout-credentials');
  const checkoutCredentials=await getSessionCheckoutCredentials(req.sessionId);
  const activeCheckoutKey=String(checkoutCredentials?.checkout_idempotency_key||'');
  const activeGuestToken=String(checkoutCredentials?.checkout_guest_token||'');
  if(checkoutCredentials){req.session.checkout_idempotency_key=activeCheckoutKey;req.session.checkout_guest_token=activeGuestToken;}
  const submittedIdempotencyKey=cleanText(req.body.idempotencyKey,100);
  const submittedGuestToken=!req.user?String(req.body.guestAccessToken||''):'';
  const requestedPaymentMethod=cleanText(req.body.paymentMethod,40)||'cash_on_delivery';
  const selectedPaymentProvider=requestedPaymentMethod==='card'?'mollie':requestedPaymentMethod==='bank_transfer'?'bank_transfer':requestedPaymentMethod==='gift_card'?'gift_card':'cash_on_delivery';
  const giftCardCode=cleanText(req.body.giftCardCode,60).toUpperCase();
  const email=cleanText(req.body.customerEmail||req.user?.email,120).toLowerCase();
  let guestAccessToken=!req.user?activeGuestToken:'';
  let guestAccessTokenHash=guestAccessToken?crypto.createHash('sha256').update(guestAccessToken).digest('hex'):null;
  setCheckoutStage('resolve-terms-policy');
  const checkoutTermsPolicy=await resolvePolicy('terms',res.locals.locale||'en');
  const submittedCountry=cleanText(req.body.shippingCountry,80);
  const matchedCountry=matchDeliveryCountry(submittedCountry,launch.deliveryCountries);
  const pricingDestination={country:matchedCountry||submittedCountry,city:cleanText(req.body.shippingCity,100),postalCode:cleanText(req.body.shippingPostalCode,20)};
  setCheckoutStage('recalculate-cart-for-delivery-destination');
  summary=await cartSummary(req,pricingDestination);
  const checkoutView={summary,paymentMode:payments.mode,checkoutCardEnabled:payments.status.checkoutCardEnabled,bankTransferEnabled:payments.bankTransfer.ready,giftCardsEnabled:(await getSetting('feature_gift_cards_enabled','0'))==='1',customerEmail:email,guestAccessToken,deliveryCountries:launch.deliveryCountries,marketSetupMode:launch.marketSetupMode,pricesIncludeTax:launch.pricesIncludeTax,pricingRulesActive:summary.pricingRulesActive,quoteReady:false,quoteId:'',quoteMessage:'',checkoutForm:{paymentMethod:requestedPaymentMethod,giftCardCode:'',customerPhone:cleanText(req.body.customerPhone,32),shippingName:cleanText(req.body.shippingName,120),shippingAddress:cleanText(req.body.shippingAddress,200),shippingCity:cleanText(req.body.shippingCity,100),shippingPostalCode:cleanText(req.body.shippingPostalCode,20),shippingCountry:matchedCountry||submittedCountry,customerNote:cleanText(req.body.customerNote,500)},termsFallback:checkoutTermsPolicy.fallback,termsActualLocale:checkoutTermsPolicy.actualLocale,idempotencyKey:activeCheckoutKey,checkoutRecoveryUrl:null,securityNotice:false};
  if(!/^[A-Za-z0-9_-]{32,64}$/.test(activeCheckoutKey)||submittedIdempotencyKey!==activeCheckoutKey) return res.status(409).render('checkout',{...checkoutView,error:'This checkout form is out of date. Refresh checkout and review the current cart before continuing.'});
  if(!req.user&&(!/^[A-Za-z0-9_-]{40,50}$/.test(activeGuestToken)||submittedGuestToken!==activeGuestToken)) return res.status(409).render('checkout',{...checkoutView,error:'This guest checkout form has expired. Refresh checkout and try again.'});
  if(!launch.configurationReady) return render(res,'checkout',{...checkoutView,error:launch.gateMessage});
  if(!['cash_on_delivery','card','bank_transfer','gift_card'].includes(requestedPaymentMethod)) return res.status(400).render('checkout',{...checkoutView,error:'Choose one of the payment methods shown at checkout.'});
  if(requestedPaymentMethod==='card'&&!payments.status.checkoutCardEnabled) return res.status(400).render('checkout',{...checkoutView,checkoutForm:{...checkoutView.checkoutForm,paymentMethod:'cash_on_delivery'},error:'Card checkout is not available for this store yet. Choose cash on delivery or contact the store.'});
  if(requestedPaymentMethod==='gift_card'&&String(await getSetting('feature_gift_cards_enabled','0'))!=='1')return res.status(400).render('checkout',{...checkoutView,error:'Gift cards are not enabled for this store.'});
  if(requestedPaymentMethod==='bank_transfer'&&!payments.bankTransfer.ready) return res.status(400).render('checkout',{...checkoutView,checkoutForm:{...checkoutView.checkoutForm,paymentMethod:'cash_on_delivery'},error:'Bank transfer is not available until the store manager configures and validates the public bank details.'});
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).render('checkout',{...checkoutView,error:'Enter a valid email address so the manager can contact you about this order.'});
  const customerPhone=cleanText(req.body.customerPhone,32);
  const shipping={name:cleanText(req.body.shippingName,120),address:cleanText(req.body.shippingAddress,200),city:cleanText(req.body.shippingCity,100),postalCode:cleanText(req.body.shippingPostalCode,20),country:matchedCountry||submittedCountry};
  const termsAccepted=req.body.termsAccepted==='on';
  const rawCustomerNote=cleanText(req.body.customerNote,500);
  const customerNote=access.managerTest?('[TEST ORDER - DO NOT SHIP] '+rawCustomerNote).slice(0,500):rawCustomerNote;
  if(isPostgresPreview&&requestedPaymentMethod!=='cash_on_delivery') return res.status(400).render('checkout',{...checkoutView,error:'Only cash on delivery is enabled for this deployment.'});
  if(!matchedCountry) return res.status(400).render('checkout',{...checkoutView,error:'This store does not currently deliver to that country. Choose one of the countries listed at checkout.'});
  if(!isValidPhone(customerPhone)||shipping.country.length<2||shipping.country.length>80||[shipping.name,shipping.address,shipping.city,shipping.country].some(v=>!v)||shipping.postalCode.length>20||!termsAccepted) return res.status(400).render('checkout',{...checkoutView,error:'Enter a valid phone number (at least 7 digits), complete every required delivery field and accept the store terms before continuing.'});
  // Staging can calculate a destination quote, but must never create or resume an order.
  if(access.quoteOnly){
    if(summary.hasStockIssues) return res.redirect(303,'/cart?stockMessage=changed');
    if(!launch.ready) return render(res,'checkout',{...checkoutView,error:launch.gateMessage});
    if(summary.pricingRulesActive&&!summary.pricingRulesValid) return res.status(503).render('checkout',{...checkoutView,error:'The store regional delivery/tax rules are invalid.'});
    if(summary.taxRuleMissing) return res.status(400).render('checkout',{...checkoutView,error:'No configured tax rule matches this destination.'});
    return res.status(200).render('checkout',{...checkoutView,quoteReady:true,quoteId:'',quoteMessage:'Demo: delivery and tax calculated. No order or payment has been created.',error:null});
  }
  let idem=submittedIdempotencyKey;
  let resumedExistingOrder=null;
  setCheckoutStage('load-order-currency');
  const intentCurrency=String(await getSetting('currency',DEFAULT_STORE_CURRENCY)).trim().toUpperCase();
  setCheckoutStage('check-idempotent-order');
  let prior=await getOrderByClientToken(idem);
  const ownsPrior=Boolean(prior&&(req.user?prior.user_id===req.user.id:prior.user_id==null&&prior.guest_access_token_hash===guestAccessTokenHash));
  if(prior&&!ownsPrior) return res.status(409).render('checkout',{...checkoutView,error:'This checkout attempt cannot be verified for this session. Refresh checkout or contact the store; no new order was created.'});
  if(prior&&ownsPrior&&prior.status==='cancelled'){
    setCheckoutStage('rotate-cancelled-order-checkout-token');
    const rotated=await rotateSessionCheckoutCredentials(req.sessionId,activeCheckoutKey);
    if(!rotated) return res.status(503).render('checkout',{...checkoutView,error:'The checkout session expired. Refresh the page before placing another order.'});
    req.session.checkout_idempotency_key=rotated.checkout_idempotency_key;
    req.session.checkout_guest_token=rotated.checkout_guest_token;
    idem=rotated.checkout_idempotency_key;
    guestAccessToken=req.user?'':rotated.checkout_guest_token;
    guestAccessTokenHash=guestAccessToken?crypto.createHash('sha256').update(guestAccessToken).digest('hex'):null;
    checkoutView.idempotencyKey=idem;
    checkoutView.guestAccessToken=guestAccessToken;
    prior=null;
  }
  if(prior&&ownsPrior){
    setCheckoutStage('reload-existing-order');
    const existing=await getOrder(prior.id);
    if(!existing) return res.status(409).render('checkout',{...checkoutView,error:'The previous order could not be reloaded safely. Contact the store before starting another payment.'});
    const sameIntent=checkoutIntentMatchesOrder(existing,{summary,paymentProvider:selectedPaymentProvider,email,customerPhone,shipping,customerNote,currency:intentCurrency});
    if(!sameIntent) return res.status(409).render('checkout',{...checkoutView,error:'A previous order attempt is already linked to this checkout token, but its details differ from the current form. To prevent duplicate orders or payments, do not submit a second payment. Reopen the earlier order or contact the store to resolve it.'});
    if(['paid','processing','shipped','completed'].includes(existing.status)){
      try { await clearCheckoutCartIfUnchanged(req,existing.items||[]); }
      catch(cleanupError) { logOperationalFailure('Post-checkout cart cleanup on completed idempotent retry',cleanupError); }
      if(guestAccessToken) res.cookie(guestOrderCookieName(existing.id),guestAccessToken,{httpOnly:true,sameSite:'lax',secure:isProd,path:'/',maxAge:1000*60*60*24*365});
      return res.redirect(303,`/checkout/success?order=${existing.id}`);
    }
    if(existing.status==='pending'&&existing.payment_provider==='mollie'){
      const validPaymentReference=/^tr_[A-Za-z0-9]+$/.test(String(existing.payment_reference||''));
      const validPaymentUrl=isTrustedMollieCheckoutUrl(existing.payment_url);
      if(validPaymentReference&&validPaymentUrl){
        if(guestAccessToken) res.cookie(guestOrderCookieName(existing.id),guestAccessToken,{httpOnly:true,sameSite:'lax',secure:isProd,path:'/',maxAge:1000*60*60*24*365});
        return res.redirect(303,existing.payment_url);
      }
      if(existing.payment_reference||existing.payment_url) return res.status(503).render('checkout',{...checkoutView,error:'The previous card-payment attempt has incomplete provider details. For safety, ShopEasy will not create another payment automatically. Contact the store manager to reconcile the attempt.'});
      let currentCredentialFingerprint='';
      try { currentCredentialFingerprint=buildMollieCredentialFingerprint(process.env.MOLLIE_API_KEY); }
      catch { return res.status(503).render('checkout',{...checkoutView,error:'The previous card-payment attempt cannot be retried safely because the provider credential is unavailable. Ask the store manager to reconcile it.'}); }
      if(!/^[a-f0-9]{64}$/.test(String(existing.payment_credential_fingerprint||''))||existing.payment_credential_fingerprint!==currentCredentialFingerprint) {
        if(guestAccessToken) res.cookie(guestOrderCookieName(existing.id),guestAccessToken,{httpOnly:true,sameSite:'lax',secure:isProd,path:'/',maxAge:1000*60*60*24*365});
        return res.status(503).render('checkout',{...checkoutView,error:'The provider credential used for this pending card attempt has changed or was not recorded. No automatic payment retry was sent. The store manager must reconcile the original attempt first.',checkoutRecoveryUrl:`/checkout/success?order=${existing.id}`});
      }
      const createdAt=parseStoredTimestamp(existing.created_at).getTime();
      const orderAge=Date.now()-createdAt;
      if(!Number.isFinite(createdAt)||orderAge<0||orderAge>50*60*1000){
        if(guestAccessToken) res.cookie(guestOrderCookieName(existing.id),guestAccessToken,{httpOnly:true,sameSite:'lax',secure:isProd,path:'/',maxAge:1000*60*60*24*365});
        return res.status(503).render('checkout',{...checkoutView,error:'ShopEasy could not confirm the result of the earlier card-payment request within the safe retry window. Do not start another payment. The store manager must reconcile this order in Mollie first.',checkoutRecoveryUrl:`/checkout/success?order=${existing.id}`});
      }
      resumedExistingOrder=existing;
      res.locals.storeReady=launch.configurationReady;
      checkoutView.storeReady=launch.configurationReady;
      checkoutView.quoteReady=true;
    } else if(existing.status==='pending'&&['cash_on_delivery','bank_transfer'].includes(existing.payment_provider)){
      try { await clearCheckoutCartIfUnchanged(req,existing.items||[]); }
      catch(cleanupError) { logOperationalFailure('Post-checkout cart cleanup on idempotent retry',cleanupError); }
      if(guestAccessToken) res.cookie(guestOrderCookieName(existing.id),guestAccessToken,{httpOnly:true,sameSite:'lax',secure:isProd,path:'/',maxAge:1000*60*60*24*365});
      return res.redirect(303,`/checkout/success?order=${existing.id}`);
    }
  }
  // An owned, identical pending payment already reserved its inventory.
  // Its retry must reuse that reservation; new orders still pass this gate
  // and the transaction's independent stock checks.
  if(summary.hasStockIssues&&!resumedExistingOrder){
    const cleanCart=summary.items.map(i=>({productId:i.productId,...(i.variantId?{variantId:i.variantId}:{}),quantity:i.quantity}));
    await saveSessionCart(req.sessionId,cleanCart,{expectedRevision:req.session?.cart_revision,expectedCartJson:req.session?.cart_json});
    return res.redirect(303,'/cart?stockMessage=changed');
  }
  if(!launch.ready&&!resumedExistingOrder)return render(res,'checkout',{...checkoutView,error:launch.gateMessage});
  if(summary.pricingRulesActive&&!resumedExistingOrder){
    if(!summary.pricingRulesValid) return res.status(503).render('checkout',{...checkoutView,error:'The store regional delivery/tax rules are invalid. Please contact the store before placing this order.'});
    if(summary.taxRuleMissing) return res.status(400).render('checkout',{...checkoutView,error:'The store has tax rules configured but none matches this destination. The store must configure the correct rate (including an explicit 0% rule when applicable) before this order can be placed.'});
    const existingQuote=req.session?.checkoutQuote||null;
    const quoteId=cleanText(req.body.pricingQuoteId,80);
    if(!checkoutPricingQuoteMatches(existingQuote,quoteId,req,summary,pricingDestination)){
      const quote=makeCheckoutPricingQuote(req,summary,pricingDestination);
      setCheckoutStage('save-destination-pricing-quote');
      await saveSessionCheckoutQuote(req.sessionId,quote);
      req.session.checkoutQuote=quote;
      return res.status(200).render('checkout',{...checkoutView,quoteReady:true,quoteId:quote.id,quoteMessage:existingQuote?'Delivery or tax pricing changed. Review the updated final amount, then place the order.':'Your delivery address has been priced. Review the final delivery fee, tax and total before placing the order.',error:null});
    }
  }
  let created;
  setCheckoutStage('create-order-and-complete-checkout');
  try {
    const currency=intentCurrency;
    const requestedLocale=String(req.cookies?.shop_lang||'');
    const chosenLocale=SUPPORTED_UI_LOCALES.includes(requestedLocale)?requestedLocale:'en';
    let paymentLocale=chosenLocale;
    if(resumedExistingOrder){
      created={orderId:Number(resumedExistingOrder.id),total:Number(resumedExistingOrder.total_cents),items:resumedExistingOrder.items||[]};
      paymentLocale=SUPPORTED_UI_LOCALES.includes(String(resumedExistingOrder.terms_locale||''))?String(resumedExistingOrder.terms_locale):'en';
    }else{
      const acceptedTerms=await resolvePolicy('terms',chosenLocale);
      const paymentCredentialFingerprint=selectedPaymentProvider==='mollie'?buildMollieCredentialFingerprint(process.env.MOLLIE_API_KEY):'';
      const minimumTermsLength=minimumCustomerTermsLength(launch.marketSetupMode);
      if(String(acceptedTerms.body||'').trim().length<minimumTermsLength) throw new Error('TERMS_NOT_CONFIGURED');
      const acceptedTermsHash=crypto.createHash('sha256').update(acceptedTerms.body).digest('hex');
      paymentLocale=SUPPORTED_UI_LOCALES.includes(String(acceptedTerms.actualLocale||''))?String(acceptedTerms.actualLocale):chosenLocale;
      created=await withBusyRetry(() => createOrderAtomic({userId:req.user?.id||null,guestAccessTokenHash,email,customerPhone,items:summary.items,coupon:summary.coupon?.code||null,currency,shipping,shippingCents:summary.shipping,taxCents:summary.taxCents,taxRateBps:summary.taxRateBps,taxIncluded:summary.taxIncluded,taxRuleSnapshot:summary.taxRuleSnapshot,shippingRuleSnapshot:summary.shippingRuleSnapshot,pricingConfiguration:summary.pricingConfiguration,expectedPricing:{items:summary.items.map(item=>({productId:item.productId,variantId:item.variantId||0,quantity:item.quantity,baseUnit:item.basePrice,unit:item.price,total:item.total})),subtotalBeforeAutomaticDiscount:summary.subtotalBeforeAutomaticDiscount,automaticDiscount:summary.automaticDiscount,bundleDiscount:summary.bundleDiscount,discount:summary.discount,shippingCents:summary.shipping,taxCents:summary.taxCents,taxRateBps:summary.taxRateBps,taxIncluded:summary.taxIncluded,total:summary.total},customerNote,paymentProvider:selectedPaymentProvider,paymentCredentialFingerprint,bankTransferDetails:selectedPaymentProvider==='bank_transfer'?payments.bankTransfer:null,clientToken:idem,termsAcceptedAt:new Date().toISOString(),termsLocale:acceptedTerms.actualLocale,termsPolicyHash:acceptedTermsHash,giftCardCode:selectedPaymentProvider==='gift_card'?giftCardCode:''}),4);
    }
    if(selectedPaymentProvider==='mollie') {
      const payment=await createMollieCardPayment({orderId:created.orderId,totalMinorUnits:created.total,currency,baseUrl:process.env.BASE_URL,apiKey:process.env.MOLLIE_API_KEY,clientToken:idem,nodeEnv:paymentNodeEnvironment(),locale:paymentLocale,liveMerchantApproved:process.env.MOLLIE_LIVE_CHECKOUT_APPROVED==='true'});
      const stored=await updatePendingOrderPaymentDetails(created.orderId,'mollie',payment.id,payment.checkoutUrl);
      let paymentAlreadyResolved=false;
      if(!stored) {
        // A fast webhook can verify the payment and change the order status before
        // this request persists the checkout URL. Treat that as success only when
        // the same trusted payment reference, amount and currency are already on
        // the order; any other write failure remains fail-closed for reconciliation.
        const currentOrder=await getOrder(created.orderId);
        paymentAlreadyResolved=Boolean(currentOrder&&
          ['paid','processing','shipped','completed'].includes(currentOrder.status)&&
          currentOrder.payment_provider==='mollie'&&currentOrder.payment_reference===payment.id&&
          Number(currentOrder.total_cents)===Number(created.total)&&
          String(currentOrder.currency||'').toUpperCase()===String(currency||'').toUpperCase());
        if(!paymentAlreadyResolved) throw new Error('PAYMENT_DETAILS_SAVE_FAILED');
      }
      // Only clear the cart once the provider has created the hosted checkout and
      // the payment ID is safely persisted or the same payment is already verified paid.
      try { await clearCheckoutCartIfUnchanged(req, created.items||[]); }
      catch(cleanupError) { logOperationalFailure('Post-checkout cart cleanup',cleanupError); }
      await safeAudit(req.user?.id||null,'order_created','order',created.orderId,{total:created.total,paymentProvider:'mollie'});
      if(guestAccessToken) res.cookie(guestOrderCookieName(created.orderId),guestAccessToken,{httpOnly:true,sameSite:'lax',secure:isProd,path:'/',maxAge:1000*60*60*24*365});
      if(paymentAlreadyResolved) return res.redirect(303,`/checkout/success?order=${created.orderId}`);
      return res.redirect(303,payment.checkoutUrl);
    }
    // COD is the safe default. The cart is cleared only after the order commits.
    try { await clearCheckoutCartIfUnchanged(req, created.items||[]); }
    catch(cleanupError) { logOperationalFailure('Post-checkout cart cleanup',cleanupError); }
    await safeAudit(req.user?.id||null,'order_created','order',created.orderId,{total:created.total,paymentProvider:selectedPaymentProvider});
    if(!isPostgresPreview) await maybeSendOrderNotification(created.orderId,'confirmation');
    if(guestAccessToken) res.cookie(guestOrderCookieName(created.orderId),guestAccessToken,{httpOnly:true,sameSite:'lax',secure:isProd,path:'/',maxAge:1000*60*60*24*365});
    return res.redirect(303,`/checkout/success?order=${created.orderId}`);
  } catch(err) {
    // A duplicate idempotency key can occur when a customer double-clicks or the network retries.
    if(err?.message==='IDEMPOTENCY_EXISTS'){
      const duplicate=await getOrderByClientToken(idem);
      const ownsDuplicate=Boolean(duplicate&&(req.user?duplicate.user_id===req.user.id:duplicate.user_id==null&&duplicate.guest_access_token_hash===guestAccessTokenHash));
      if(duplicate&&ownsDuplicate){
        const duplicateOrder=await getOrder(duplicate.id);
        if(!duplicateOrder) return res.status(409).render('checkout',{...checkoutView,error:'The earlier checkout exists but could not be reloaded safely. No new order or payment was started; contact the store manager.'});
        const duplicateIntentMatches=checkoutIntentMatchesOrder(duplicateOrder,{summary,paymentProvider:selectedPaymentProvider,email,customerPhone,shipping,customerNote,currency:intentCurrency});
        if(!duplicateIntentMatches) return res.status(409).render('checkout',{...checkoutView,error:'A simultaneous checkout request already created an order using this token, but its details differ from the current form. No second payment was started. Review the earlier order or contact the store manager.'});
        if(guestAccessToken) res.cookie(guestOrderCookieName(duplicate.id),guestAccessToken,{httpOnly:true,sameSite:'lax',secure:isProd,path:'/',maxAge:1000*60*60*24*365});
        if(duplicateOrder.payment_provider==='mollie'&&duplicateOrder.status==='pending'){
          if(duplicateOrder.payment_reference&&isTrustedMollieCheckoutUrl(duplicateOrder.payment_url)) return res.redirect(303,duplicateOrder.payment_url);
          return res.status(503).render('checkout',{...checkoutView,error:'This checkout attempt is already being processed. No second order was created. Wait briefly, then retry this same checkout; if the message remains, ask the store manager to check the payment provider.',idempotencyKey:idem,guestAccessToken,checkoutRecoveryUrl:`/checkout/success?order=${duplicate.id}`});
        }
        return res.redirect(303,`/checkout/success?order=${duplicate.id}`);
      }
    }
    const cardAttemptNeedsReconciliation=Boolean(created?.orderId&&selectedPaymentProvider==='mollie');
    if(created?.orderId&&!cardAttemptNeedsReconciliation) await cancelPendingOrder(created.orderId,'Checkout completion failed after order reservation','system').catch(()=>{});
    if(cardAttemptNeedsReconciliation&&guestAccessToken){
      res.cookie(guestOrderCookieName(created.orderId),guestAccessToken,{httpOnly:true,sameSite:'lax',secure:isProd,path:'/',maxAge:1000*60*60*24*365});
    }
    logOperationalFailure('Checkout order creation',err);
    const messages={GIFT_CARD_BALANCE:'The gift card cannot cover this order, is expired, or uses another currency.',GIFT_CARD_INVALID:'Enter the complete gift card code.',GIFT_CARD_DISABLED:'Gift-card checkout is not enabled.',INVALID_IDEMPOTENCY:'Checkout session expired. Refresh the checkout page and try again.',INVALID_QUANTITY:'Please check the product quantities in your cart.',EMPTY_CART:'Your cart is empty. Add a product before checking out.',PRODUCT_UNAVAILABLE:'One of the products is no longer available.',VARIANT_REQUIRED:'Choose an option, such as a size, for every product that has options.',VARIANT_UNAVAILABLE:'One of your selected product options is no longer available. Return to your cart and choose again.',INSUFFICIENT_STOCK:'Stock changed during checkout. Return to your cart, reduce or remove the affected item, and try again.',INVALID_COUPON:'The coupon is no longer valid.',COUPON_MINIMUM:'The coupon minimum has not been reached.',INVALID_PHONE:'Enter a valid phone number so the store can arrange delivery.',TERMS_NOT_CONFIGURED:'The store owner must finish configuring the terms before checkout can accept orders.',ZERO_TOTAL:'The final order total must be greater than zero.',INVALID_RESERVATION:'Checkout configuration is invalid.',MONEY_OVERFLOW:'The order amount is outside the supported range. Please contact the store manager.',INVALID_ORDER:'Checkout data is invalid.',STOCK_INTEGRITY:'Stock changed during checkout. Return to your cart, review affected items and try again.',PRICING_RULES_CHANGED:'Delivery or tax settings changed while you were checking out. Review the updated amount and place the order again.',PRICING_CHANGED:'A product price, discount, delivery fee or tax amount changed during checkout. Review the updated amount and place the order again.',BANK_TRANSFER_NOT_CONFIGURED:'Bank transfer is not configured yet. Choose another payment method.',BANK_TRANSFER_DETAILS_UNEXPECTED:'Unexpected bank transfer details were rejected.',BANK_TRANSFER_SNAPSHOT_SAVE_FAILED:'Bank transfer instructions could not be saved with the order. No order was confirmed; please retry.',PAYMENT_PROVIDER_NOT_CONFIGURED:'Card payments are not configured yet. Choose cash on delivery.',PAYMENT_PUBLIC_HTTPS_URL_REQUIRED:'Card payments require the store’s public HTTPS address to be configured. Choose cash on delivery for now.',PAYMENT_PROVIDER_UNAVAILABLE:'The payment provider did not return a reliable result. Your order has been retained safely. Retry this same checkout shortly; do not create another order.',PAYMENT_PROVIDER_CONFLICT:'The payment provider is still processing this request. Your order has been retained; wait briefly and retry this same checkout.',PAYMENT_PROVIDER_REJECTED:'The payment provider rejected this request or its idempotency parameters. Your order has been retained so a second payment is not started automatically. Contact the store manager if retrying this same checkout does not work.',PAYMENT_PROVIDER_INVALID_RESPONSE:'The payment provider returned an invalid or incomplete response. Your order has been retained for reconciliation; do not start another payment.',PAYMENT_PROVIDER_MODE_MISMATCH:'The provider response did not match the configured test/live environment. No new payment attempt will be started automatically; contact the store manager.',PAYMENT_IDEMPOTENCY_KEY_INVALID:'This payment attempt could not be safely matched to its original order. Contact the store manager.',PAYMENT_CREDENTIAL_FINGERPRINT_REQUIRED:'The card-payment credential could not be safely recorded. No card payment was started; contact the store manager.',PAYMENT_CREDENTIAL_FINGERPRINT_UNEXPECTED:'Unexpected payment credential data was rejected.',PAYMENT_RECONCILIATION_REQUIRED:'The earlier payment attempt is outside the safe automatic retry window. The store manager must reconcile it before another payment is attempted.',PAYMENT_DETAILS_SAVE_FAILED:'The payment provider may have created this payment, but ShopEasy could not persist the reference safely. Your order remains pending; retry the same checkout shortly or contact the store manager.'};
    const statusCode=cardAttemptNeedsReconciliation?503:400;
    return res.status(statusCode).render('checkout',{...checkoutView,error:messages[err?.message]||'Checkout could not be completed. Please try again.',idempotencyKey:idem,guestAccessToken,checkoutRecoveryUrl:cardAttemptNeedsReconciliation?`/checkout/success?order=${created.orderId}`:null});
  }
  } catch(error) {
    // Never log form bodies, emails, addresses, session IDs or CSRF/idempotency
    // tokens. The stage + exception stack are enough to locate the failing step.
    setCheckoutStage(checkoutStage);
    return next(error);
  }
});
app.get('/checkout/success',async(req,res)=>{
  let order=await getOrder(Number(req.query.order));
  if(!order)return res.status(404).render('error',{title:'Order not found',message:'This order could not be found.'});
  const isGuestOrder=!order.user_id&&guestOrderTokenMatches(order,req.cookies?.[guestOrderCookieName(order.id)]);
  const isOwner=Boolean(req.user&&order.user_id===req.user.id);
  if(!isOwner&&!isGuestOrder)return res.status(404).render('error',{title:'Order not found',message:'This order could not be found.'});
  if(isGuestOrder)rememberGuestOrderAccess(req,res,order);
  let providerPaymentMessage='';
  let providerPaymentStatus='';
  let providerVerificationUnavailable=false;
  // Redirects are not proof of payment. Re-fetch the state from Mollie, validate
  // exact order metadata/amount/currency/reference, and update only from that API result.
  if(order.payment_provider==='mollie'&&/^tr_[A-Za-z0-9]+$/.test(String(order.payment_reference||''))&&['pending','paid','processing','shipped','completed'].includes(order.status)) {
    try {
      const payment=await getMolliePayment(order.payment_reference,{apiKey:process.env.MOLLIE_API_KEY,nodeEnv:paymentNodeEnvironment()});
      const beforeStatus=order.status;
      providerPaymentStatus=await applyMolliePaymentState(order,payment);
      order=await getOrder(order.id)||order;
      if(providerPaymentStatus==='paid'&&beforeStatus==='pending'&&order.status==='paid') {
        await safeAudit(null,'provider_payment_confirmed','order',order.id,{provider:'mollie',currency:order.currency,total:order.total_cents});
        await maybeSendOrderNotification(order.id,'confirmation');
      }
    } catch(error) {
      providerVerificationUnavailable=true;
      logOperationalFailure('Mollie customer-return verification',error);
    }
  }
  if(order.payment_provider==='mollie') {
    if(order.status==='paid'||['processing','shipped','completed'].includes(order.status)) providerPaymentMessage='paid';
    else if(order.status==='cancelled') providerPaymentMessage='cancelled';
    else if(providerVerificationUnavailable) providerPaymentMessage='verification_unavailable';
    else providerPaymentMessage='pending';
  }
  // This route is intentionally read-only with respect to the active cart/coupon.
  // Payment state is reconciled only from the provider API, never from query parameters.
  const [orderHistory,returns]=await Promise.all([listOrderStatusHistory(order.id),listOrderReturns(order.id)]);
  render(res,'success',{order,guestOrderAccessCode:isGuestOrder?validGuestOrderToken(req,order):'',bankTransferInfo:parseBankTransferSnapshot(order.payment_instructions_snapshot),orderHistory,returns,cancelled:order.status==='cancelled',waitingForProviderExpiry:order.payment_provider==='mollie'&&order.status==='pending',providerPaymentMessage,providerPaymentStatus,providerVerificationUnavailable,isGuestOrder,isOwner,cancelResult:cleanText(req.query.cancel,30),returnResult:cleanText(req.query.return,30),securityNotice:req.query.notice==='security-refresh'});
});
app.post('/checkout/success/returns',checkoutLimiter,verifyCsrf,async(req,res)=>{
  const id=validId(req.body.orderId)?Number(req.body.orderId):null;
  if(!id)return res.status(404).render('error',{title:'Order not found',message:'This order could not be found.'});
  const order=await getOrder(id);
  if(!order)return res.status(404).render('error',{title:'Order not found',message:'This order could not be found.'});
  const isOwner=Boolean(req.user&&order.user_id===req.user.id);
  const isGuestOrder=!order.user_id&&guestOrderTokenMatches(order,req.cookies?.[guestOrderCookieName(order.id)]);
  if(!isOwner&&!isGuestOrder)return res.status(404).render('error',{title:'Order not found',message:'This order could not be found.'});
  const itemId=validId(req.body.orderItemId)?Number(req.body.orderItemId):null;
  const quantity=parseCartQuantity(req.body.quantity),requestType=cleanText(req.body.requestType,20),reason=cleanText(req.body.reason,1000);
  try {
    const rawDays=Number.parseInt(process.env.RETURN_WINDOW_DAYS||'0',10);
    await createOrderReturnRequest({orderId:order.id,userId:order.user_id==null?null:req.user.id,orderItemId:itemId,quantity,requestType,reason,returnWindowDays:Number.isFinite(rawDays)?Math.max(0,rawDays):0});
    await safeAudit(req.user?.id||null,'order_return_requested','order',order.id,{requestType,orderItemId:itemId,quantity,guestOrder:!order.user_id});
    return res.redirect(303,`/checkout/success?order=${order.id}&return=requested`);
  } catch(error) {
    logOperationalFailure('Guest/account order return request',error);
    return res.redirect(303,`/checkout/success?order=${order.id}&return=error`);
  }
});

app.post('/checkout/success/cancel',checkoutLimiter,async(req,res)=>{
  const id=validId(req.body.orderId)?Number(req.body.orderId):null;
  if(!id) return res.status(404).render('error',{title:'Order not found',message:'This order could not be found.'});
  const order=await getOrder(id);
  if(!order) return res.status(404).render('error',{title:'Order not found',message:'This order could not be found.'});
  const isOwner=Boolean(req.user&&order.user_id===req.user.id);
  const isGuestOrder=!order.user_id&&guestOrderTokenMatches(order,req.cookies?.[guestOrderCookieName(order.id)]);
  if(!isOwner&&!isGuestOrder) return res.status(404).render('error',{title:'Order not found',message:'This order could not be found.'});
  const reason=cleanText(req.body.reason,500);
  const outcome=await cancelCustomerOrder(order,reason,req.user?.id||null,{guest:true});
  return res.redirect(303,`/checkout/success?order=${order.id}&cancel=${encodeURIComponent(outcome)}`);
});
// Kept only as a safe landing route for old bookmarked URLs; a GET request never changes order state.
app.get('/checkout/cancel',(req,res)=>res.redirect(303,req.user?'/account':'/cart'));

app.post('/api/ai/search-assistant',aiLimiter,async(req,res)=>{
  if(!await aiIsEnabled())return res.status(404).json({error:'AI is disabled'});
  const message=cleanText(req.body.message,500);
  if(!message)return res.status(400).json({error:'Message is required'});
  try { const [products,currency]=await Promise.all([listProducts({onlyActive:true,limit:12,offset:0}),getSetting('currency',DEFAULT_STORE_CURRENCY)]); const answer=await aiService.shoppingAssistant(message,products,currency); return res.json({answer}); }
  catch { return res.status(503).json({error:'AI service unavailable'}); }
});

app.get('/stories',async(req,res)=>{if(!res.locals.featureStoriesEnabled)return res.status(404).render('error',{title:'Page not found',message:'Stories are not available in this store.'});return render(res,'stories',{stories:await getActiveStories()});});
app.get('/privacy',async(req,res)=>{const policy=await resolvePolicy('privacy',res.locals.locale||'en');render(res,'policy',{title:POLICY_LABELS[res.locals.locale]?.privacy||POLICY_LABELS.en.privacy,heading:POLICY_LABELS[res.locals.locale]?.privacy||POLICY_LABELS.en.privacy,body:policy.body,policyFallback:policy.fallback,policyFallbackLocale:policy.actualLocale});});
app.get('/faq',(req,res)=>render(res,'faq'));
app.get('/contact',(req,res)=>render(res,'contact'));
app.get('/cookies',(req,res)=>render(res,'cookies',{title:res.locals.locale==='ckb'?'سیاسەتی کوکی':res.locals.locale==='ar'?'سياسة ملفات تعريف الارتباط':res.locals.locale==='fr'?'Politique des cookies':'Cookie policy'}));
app.get('/terms',async(req,res)=>{const policy=await resolvePolicy('terms',res.locals.locale||'en');render(res,'policy',{title:POLICY_LABELS[res.locals.locale]?.terms||POLICY_LABELS.en.terms,heading:POLICY_LABELS[res.locals.locale]?.terms||POLICY_LABELS.en.terms,body:policy.body,policyFallback:policy.fallback,policyFallbackLocale:policy.actualLocale});});
app.get('/imprint',(req,res)=>render(res,'imprint',{title:'Business information'}));
app.get('/withdrawal-form',(req,res)=>render(res,'withdrawal-form',{title:'Withdrawal form'}));
app.get('/shipping-returns',async(req,res)=>{const locale=res.locals.locale||'en';const [shipping,returns]=await Promise.all([resolvePolicy('shipping',locale),resolvePolicy('returns',locale)]);render(res,'policy',{title:POLICY_LABELS[locale]?.shippingReturns||POLICY_LABELS.en.shippingReturns,heading:POLICY_LABELS[locale]?.shippingReturns||POLICY_LABELS.en.shippingReturns,body:`${shipping.body}\n\n${returns.body}`,policyFallback:shipping.fallback||returns.fallback,policyFallbackLocale:(shipping.fallback||returns.fallback)?'en':locale});});

// Opt-in features are disabled by default and independently enforced server-side.
// The verification pages do not change state on GET; email scanners cannot consent.
const engagementLimiter=makeRateLimiter('customer-engagement',{windowMs:60*60*1000,max:12,standardHeaders:true,legacyHeaders:false,message:'Too many requests. Try again later.'});
const engagementBase=req=>{
  try {const u=new URL(String(process.env.BASE_URL||'')); if(u.protocol==='https:' && !u.username&&!u.password)return u.origin;}catch{}
  if(isProd)return '';
  return `http://127.0.0.1:${process.env.PORT||3000}`;
};
app.post('/newsletter/subscribe',engagementLimiter,async(req,res)=>{
  if(!res.locals.appearance.newsletter)return res.sendStatus(404);
  if(!emailEnabled() || !engagementBase(req))return res.redirect(303,'/?newsletter=unavailable');
  const email=emailAddress(req.body.email);
  if(!email)return res.redirect(303,'/?newsletter=invalid');
  try{
    const ticket=await subscribeNewsletter(email);
    if(ticket.send){
      await sendEngagementEmail({email,kind:'newsletter-confirm',actionUrl:`${engagementBase(req)}/newsletter/confirm?token=${encodeURIComponent(ticket.token)}`,storeName:res.locals.storeName,locale:res.locals.locale});
    }
  }catch(error){logOperationalFailure('Newsletter request',error);return res.redirect(303,'/?newsletter=unavailable');}
  // No indication whether an existing mailbox is subscribed.
  return res.redirect(303,'/?newsletter=check-email');
});
app.get('/newsletter/confirm',(req,res)=>render(res,'engagement-confirm',{title:'Confirm newsletter subscription',action:'/newsletter/confirm',token:validActionToken(req.query.token)?req.query.token:'',purpose:'newsletter',success:null}));
app.post('/newsletter/confirm',engagementLimiter,async(req,res)=>{
  const result=res.locals.appearance.newsletter && await confirmNewsletter(String(req.body.token||''));
  return render(res,'engagement-confirm',{title:'Newsletter confirmation',action:'/newsletter/confirm',purpose:'newsletter',token:'',success:result?'confirmed':'invalid'});
});
app.get('/newsletter/unsubscribe',(req,res)=>render(res,'engagement-confirm',{title:'Unsubscribe',action:'/newsletter/unsubscribe',token:validActionToken(req.query.token)?req.query.token:'',purpose:'unsubscribe',success:null}));
app.post('/newsletter/unsubscribe',engagementLimiter,async(req,res)=>{
  const success=await unsubscribeNewsletter(String(req.body.token||''));
  return render(res,'engagement-confirm',{title:'Unsubscribe',action:'/newsletter/unsubscribe',token:'',purpose:'unsubscribe',success:success?'confirmed':'invalid'});
});
app.post('/stock-alerts/request',engagementLimiter,async(req,res)=>{
  if(!res.locals.appearance.stockAlerts)return res.sendStatus(404);
  const productId=parseCartProductId(req.body.productId),email=emailAddress(req.body.email);
  const product=productId?await getProductById(productId):null;
  if(!product || !product.active)return res.status(404).render('error',{title:'Product not found',message:'This product is not available.'});
  const returnPath=`/product/${encodeURIComponent(product.slug)}`;
  if(!email)return res.redirect(303,`${returnPath}?alert=invalid`);
  if(!emailEnabled() || !engagementBase(req))return res.redirect(303,`${returnPath}?alert=unavailable`);
  // Never collect alerts while a product is already available for purchase.
  if(Number(product.available_stock||0)>0)return res.redirect(303,returnPath);
  try {
    const ticket=await createStockAlert(productId,email);
    if(ticket.send)await sendEngagementEmail({email,kind:'stock-confirm',actionUrl:`${engagementBase(req)}/stock-alerts/confirm?token=${encodeURIComponent(ticket.token)}`,storeName:res.locals.storeName,productName:product.name,locale:res.locals.locale});
  }catch(error){logOperationalFailure('Stock alert request',error);return res.redirect(303,`${returnPath}?alert=unavailable`);}
  return res.redirect(303,`${returnPath}?alert=check-email`);
});
app.get('/stock-alerts/confirm',(req,res)=>render(res,'engagement-confirm',{title:'Confirm stock alert',action:'/stock-alerts/confirm',purpose:'stock',token:validActionToken(req.query.token)?req.query.token:'',success:null}));
app.post('/stock-alerts/confirm',engagementLimiter,async(req,res)=>{
  const success=res.locals.appearance.stockAlerts && await confirmStockAlert(String(req.body.token||''));
  return render(res,'engagement-confirm',{title:'Confirm stock alert',action:'/stock-alerts/confirm',purpose:'stock',token:'',success:success?'confirmed':'invalid'});
});
app.post('/products/:id/reviews',requireAuth,engagementLimiter,async(req,res)=>{
  if(!res.locals.appearance.reviews)return res.sendStatus(404);
  const productId=Number(req.params.id),product=Number.isSafeInteger(productId)&&productId>0?await getProductById(productId):null;
  if(!product||!product.active)return res.sendStatus(404);
  const redirect=`/product/${encodeURIComponent(product.slug)}`;
  if(req.user?.role!=='customer')return res.redirect(303,`${redirect}?review=not-eligible`);
  try{
    await submitVerifiedReview({userId:req.user.id,productId,rating:req.body.rating,title:req.body.title,body:req.body.body});
    return res.redirect(303,`${redirect}?review=pending`);
  }catch{return res.redirect(303,`${redirect}?review=not-eligible`);}
});
// Explicit owner-run email campaigns, with hard batch limits and double opt-in.
const newsletterSendLimiter=makeRateLimiter('newsletter-sends',{windowMs:60*60*1000,max:30,standardHeaders:true,legacyHeaders:false,message:'Email sending rate limit reached.'});
app.get('/admin/newsletter',requireManager,async(req,res)=>render(res,'admin/newsletter',{campaigns:await listNewsletterCampaigns(),subscriberCount:await newsletterSubscriberCount(),created:req.query.created==='1',sent:req.query.sent||'',error:null}));
app.post('/admin/newsletter/create',requireManager,verifyCsrf,async(req,res)=>{
  if(!res.locals.appearance.newsletter)return res.sendStatus(404);
  try{
    const id=await createNewsletterCampaign({subject:req.body.subject,body:req.body.body,userId:req.user.id});
    await safeAudit(req.user.id,'newsletter_campaign_created','campaign',id);
    return res.redirect(303,'/admin/newsletter?created=1');
  }catch{return res.status(400).render('admin/newsletter',{campaigns:await listNewsletterCampaigns(),subscriberCount:await newsletterSubscriberCount(),created:false,sent:'',error:'Enter a subject of 5–140 characters and a message of 20–5000 characters.'});}
});
app.post('/admin/newsletter/send-batch',requireManager,newsletterSendLimiter,verifyCsrf,async(req,res)=>{
  if(!res.locals.appearance.newsletter)return res.sendStatus(404);
  if(!emailEnabled() || !engagementBase(req) || String(process.env.NEWSLETTER_UNSUBSCRIBE_SECRET||'').length<32)return res.redirect(303,'/admin/newsletter?sent=configure');
  try{
    const campaignId=Number(req.body.campaignId);
    const batch=await claimNewsletterBatch(campaignId,15);
    let sent=0;
    for(const item of batch){
      let delivered=false;
      if(!await newsletterSubscriberActive(item.email)){await finishNewsletterDelivery(campaignId,item.email,false);continue;}
      try{
        const unsubscribe=`${engagementBase(req)}/newsletter/unsubscribe?token=${encodeURIComponent(item.unsubscribeToken)}`;
        delivered=Boolean((await sendNewsletterCampaignEmail({email:item.email,subject:item.subject,body:item.body,unsubscribeUrl:unsubscribe,storeName:res.locals.storeName,campaignId})).sent);
      }catch(error){logOperationalFailure('Newsletter campaign delivery',error);}
      await finishNewsletterDelivery(campaignId,item.email,delivered);
      if(delivered)sent++;
    }
    await safeAudit(req.user.id,'newsletter_batch_sent','campaign',campaignId,{claimed:batch.length,sent});
    return res.redirect(303,`/admin/newsletter?sent=${sent}`);
  }catch(error){logOperationalFailure('Newsletter batch',error);return res.redirect(303,'/admin/newsletter?sent=error');}
});
app.get('/admin/reviews',requireManager,async(req,res)=>{
  return render(res,'admin/reviews',{reviews:await pendingReviews(),notice:req.query?.notice==='saved'});
});
app.post('/admin/reviews/moderate',requireManager,verifyCsrf,async(req,res)=>{
  const accepted=await moderateReview(req.body.reviewId,req.body.action);
  if(accepted)await safeAudit(req.user.id,'review_moderation','review',Number(req.body.reviewId),{status:req.body.action});
  return res.redirect(303,`/admin/reviews?notice=${accepted?'saved':'invalid'}`);
});
// Cart preview never mutates order/stock/coupon state; the real /cart remains canonical.
app.get('/api/cart/preview',async(req,res)=>{
  if(!res.locals.appearance.cartDrawer)return res.sendStatus(404);
  const summary=await cartSummary(req);
  res.set('Cache-Control','private, no-store');
  return res.json({items:summary.items.slice(0,30).map(item=>({name:String(item.product?.name||'Product').slice(0,180),quantity:Number(item.quantity)||0,total:Number(item.total)||0})),count:summary.items.reduce((n,i)=>n+(Number(i.quantity)||0),0),total:summary.total,currency:res.locals.currency,hasStockIssues:summary.hasStockIssues,cartHref:'/cart',checkoutHref:summary.hasStockIssues?'/cart':'/checkout'});
});

// Staff management is intentionally available only to the full-access Manager.
// Admin accounts are created in this screen, never through .env bootstrap or the CLI.
async function renderStaffManagement(req,res, options={}, status=200) {
  const adminAccounts=await getRows("SELECT id,full_name,email,created_at FROM users WHERE role='admin' ORDER BY created_at DESC");
  res.status(status);
  return render(res,'admin/staff',{
    adminAccounts,
    error:null,
    adminCreated:req.query?.adminCreated==='1',
    emailChanged:req.query?.emailChanged==='1',
    passwordChanged:req.query?.passwordChanged==='1',
    adminDeleted:req.query?.adminDeleted==='1',
    formName:'',
    formEmail:'',
    ...options
  });
}
app.get('/admin/staff',requireManager,async(req,res)=>renderStaffManagement(req,res));
app.post('/admin/staff/create-admin',managerAccountLimiter,requireManager,async(req,res)=>{
  const fullName=cleanText(req.body.fullName,120);
  const email=cleanText(req.body.email,120).toLowerCase();
  const password=String(req.body.password??'');
  const confirmPassword=String(req.body.confirmPassword??'');
  const formName=fullName,formEmail=email;
  if(!fullName||!email||!/^\S+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>120) {
    return renderStaffManagement(req,res,{error:'Enter a full name and a valid email address (maximum 120 characters).',formName,formEmail},400);
  }
  if(!isStrongEnoughPassword(password)||password!==confirmPassword) {
    return renderStaffManagement(req,res,{error:password!==confirmPassword?'The passwords do not match.':'Use a password with 15–200 characters that is not common or repeated.',formName,formEmail},400);
  }
  if(await getUserAuthByEmail(email)) {
    return renderStaffManagement(req,res,{error:'An account with this email already exists. Use a different email address.',formName,formEmail},409);
  }
  try {
    const adminId=await createUser(email,await hashPassword(password),'admin',fullName,null);
    await safeAudit(req.user.id,'admin_account_created','user',adminId,{email,role:'admin',source:'manager-staff-screen'});
    return res.redirect(303,'/admin/staff?adminCreated=1');
  } catch(error) {
    // The unique email constraint is the final guard against simultaneous submissions.
    if(/UNIQUE constraint failed:\s*users\.email\b/i.test(String(error?.message||''))) {
      return renderStaffManagement(req,res,{error:'An account with this email already exists. No account role was changed.',formName,formEmail},409);
    }
    logOperationalFailure('Manager-created Admin account',error);
    return renderStaffManagement(req,res,{error:'The Admin account could not be created. No other account was changed; check the server log and try again.',formName,formEmail},500);
  }
});
app.post('/admin/staff/delete-admin',managerAccountLimiter,requireManager,async(req,res)=>{
  const targetId=validId(req.body.adminId)?Number(req.body.adminId):null;
  const currentPassword=String(req.body.currentPassword??'');
  if(!targetId) return renderStaffManagement(req,res,{error:'Choose a valid Admin account to remove.'},400);
  const managerAuth=await getUserAuthByEmail(req.user.email);
  if(!managerAuth||managerAuth.role!=='manager'||!await verifyPassword(currentPassword,managerAuth.password_hash)) {
    return renderStaffManagement(req,res,{error:'Enter the current Manager password to remove this Admin account.'},400);
  }
  try {
    const deleted=await deleteAdminUser(targetId);
    if(!deleted) return renderStaffManagement(req,res,{error:'That Admin account was not found or has already been removed. No other account was changed.'},409);
    await safeAudit(req.user.id,'admin_account_deleted','user',deleted.id,{email:deleted.email,role:'admin'});
    return res.redirect(303,'/admin/staff?adminDeleted=1');
  } catch(error) {
    logOperationalFailure('Manager deleting Admin account',error);
    return renderStaffManagement(req,res,{error:'The Admin account could not be removed. No success was reported; check the server log and try again.'},500);
  }
});
app.post('/admin/staff/update-email',managerAccountLimiter,requireManager,async(req,res)=>{
  const currentPassword=String(req.body.currentPassword??'');
  const email=cleanText(req.body.newEmail,120).toLowerCase();
  const auth=await getUserAuthByEmail(req.user.email);
  if(!auth||auth.role!=='manager'||!await verifyPassword(currentPassword,auth.password_hash)) {
    return renderStaffManagement(req,res,{error:'Enter the current Manager password to change the email address.'},400);
  }
  if(!/^\S+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>120) {
    return renderStaffManagement(req,res,{error:'Enter a valid email address (maximum 120 characters).'},400);
  }
  if(email===String(req.user.email||'').toLowerCase()) {
    return renderStaffManagement(req,res,{error:'The new email address is the same as the current one.'},400);
  }
  try {
    const changed=await updateUserEmail(req.user.id,email,{keepSessionId:req.sessionId,expectedPasswordHash:auth.password_hash});
    if(!changed) return renderStaffManagement(req,res,{error:'The Manager email address was not changed. Refresh the page and try again.'},409);
    await safeAudit(req.user.id,'manager_email_changed','user',req.user.id,{oldEmail:req.user.email,newEmail:email});
    return res.redirect(303,'/admin/staff?emailChanged=1');
  } catch(error) {
    if(/UNIQUE constraint failed:\s*users\.email\b/i.test(String(error?.message||''))) return renderStaffManagement(req,res,{error:'That email address is already used by another account. No change was made.'},409);
    logOperationalFailure('Manager email change',error);
    return renderStaffManagement(req,res,{error:'The email address could not be changed. No change was confirmed; check the server log.'},500);
  }
});
app.post('/admin/staff/change-password',managerAccountLimiter,requireManager,async(req,res)=>{
  const currentPassword=String(req.body.currentPassword??'');
  const password=String(req.body.newPassword??'');
  const confirmPassword=String(req.body.confirmPassword??'');
  const auth=await getUserAuthByEmail(req.user.email);
  if(!auth||auth.role!=='manager'||!await verifyPassword(currentPassword,auth.password_hash)) {
    return renderStaffManagement(req,res,{error:'Enter your current Manager password before choosing a new one.'},400);
  }
  if(!isStrongEnoughPassword(password)||password!==confirmPassword) {
    return renderStaffManagement(req,res,{error:password!==confirmPassword?'The new passwords do not match.':'Use a password with 15–200 characters that is not common or repeated.'},400);
  }
  if(await verifyPassword(password,auth.password_hash)) {
    return renderStaffManagement(req,res,{error:'Choose a new password different from the current password.'},400);
  }
  try {
    if(!await updateUserPassword(req.user.id,await hashPassword(password),{keepSessionId:req.sessionId,expectedPasswordHash:auth.password_hash})) return renderStaffManagement(req,res,{error:'The Manager password was not changed. Refresh the page and try again.'},409);
    await safeAudit(req.user.id,'manager_password_changed','user',req.user.id,{sessionsRevoked:true});
    return res.redirect(303,'/admin/staff?passwordChanged=1');
  } catch(error) {
    logOperationalFailure('Manager password change',error);
    return renderStaffManagement(req,res,{error:'The password could not be changed. No change was confirmed; check the server log.'},500);
  }
});

// Admin / manager area
app.get('/admin',requireDashboardAccess,async(req,res)=>{
  if (String(req.user?.role ?? '').trim().toLowerCase() === 'admin') return render(res,'admin/limited-dashboard');
  const [stats,recentOrders,launch,lowStockInventory]=await Promise.all([getDashboardStats(),listOrders({limit:6,offset:0}),req.shopLaunchSnapshot??storeLaunchConfig(),listLowStockInventory(12)]);
  render(res,'admin/dashboard',{launch,productCount:Number(stats.products.total||0),activeProducts:Number(stats.products.active||0),soldOutProducts:Number(stats.products.sold_out||0),orderCount:Number(stats.orders.total||0),storyCount:Number(stats.stories.total||0),liveStories:Number(stats.stories.live||0),customerCount:Number(stats.customers.total||0),pendingOrders:Number(stats.orders.pending||0),paidRevenue:Number(stats.orders.revenue||0),grossProfitCents:Number(stats.accounting.gross_profit_cents||0),grossProfitMissingOrders:Number(stats.accounting.completed_orders_missing_cost||0),grossProductRevenueCents:Number(stats.accounting.product_revenue_cents||0),lowStockCount:Number(stats.lowStock?.count||0),lowStockInventory,recentOrders});
});
app.get('/admin/categories',requireManager,async(req,res)=>{const editId=validId(req.query.edit)?Number(req.query.edit):null;const categories=await listCategories();const editCategory=editId?categories.find(c=>Number(c.id)===editId) || await getRow('SELECT * FROM categories WHERE id=?',[editId]):null;render(res,'admin/categories',{categories,editCategory,error:null});});
app.post('/admin/categories/save',requireManager,async(req,res)=>{
  try {
    const id=optionalFormId(req.body.id),name=cleanText(req.body.name,80);
    const existingCategory=id?await getRow('SELECT id,slug FROM categories WHERE id=?',[id]):null;
    if(id && !existingCategory) throw new Error('NOT_FOUND');
    const parentId=optionalFormId(req.body.parentId);
    // Blank means the default display order. Other values must be a single
    // plain whole number; Number('1e2'), Number(['1']) and Number('1.5')
    // previously caused an unexpected category order to be saved.
    const sortOrderRaw=req.body.sortOrder === '' || req.body.sortOrder === undefined ? '0' : req.body.sortOrder;
    const sortOrder=parseCartQuantity(sortOrderRaw);
    if(sortOrder===null || sortOrder>100000000) throw new Error('CATEGORY_SORT_ORDER');
    if(!name) throw new Error('VALIDATION');
    if(parentId && id===parentId) throw new Error('CATEGORY_CYCLE');
    if(req.body.imageUrl && !isSafeUrl(cleanText(req.body.imageUrl,500))) throw new Error('CATEGORY_IMAGE');
    const slug=existingCategory?.slug || await uniqueCategorySlug(name,id);
    const options={parentId,description:cleanText(req.body.description,2000),imageUrl:cleanText(req.body.imageUrl,500),sortOrder,active:req.body.active==='on'};
    const savedId=id?await updateCategory(id,name,slug,options):await createCategory(name,slug,options);
    invalidateCategoryNav();
    await safeAudit(req.user.id,id?'category_updated':'category_created','category',savedId,{name,parentId,active:options.active});
    return res.redirect(303,'/admin/categories');
  } catch(err) {
    const errors={INVALID_ID:'This category form contains an invalid ID. Reload it and check the category and parent-category fields.',CATEGORY_SORT_ORDER:'Display order must be a whole number between 0 and 100,000,000.',CATEGORY_PARENT:'Choose an existing parent category or leave it empty.',CATEGORY_CYCLE:'A category cannot be its own parent or a descendant of itself.',CATEGORY_IMAGE:'Category image URL must be a safe HTTPS address.'};
    return res.status(400).render('admin/categories',{categories:await listCategories(),editCategory:{...req.body,id:req.body.id||null},error:errors[err.message]||'Could not save category. Use a valid unique name and parent. See the fields below.'});
  }
});
app.post('/admin/categories/delete',requireManager,async(req,res)=>{
  try {
    const id=validId(req.body.id)?Number(req.body.id):null;
    if(!id) return res.status(400).render('admin/categories',{categories:await listCategories(),editCategory:null,error:'Select a valid category before deleting.'});
    await deleteCategory(id);invalidateCategoryNav();await safeAudit(req.user.id,'category_deleted','category',id);
    return res.redirect(303,'/admin/categories');
  } catch(err) {
    const message=err?.message==='CATEGORY_HAS_CHILDREN'?'Move or delete the child categories first. A parent category cannot be deleted while it still has children.':err?.message==='NOT_FOUND'?'This category no longer exists. Refresh the list.':'Could not delete this category.';
    const categories=await listCategories();
    res.status(400).render('admin/categories',{categories,editCategory:null,error:message});
  }
});
app.get('/admin/products',requireManager,async(req,res)=>{
  const search=cleanText(req.query.search,80),category=cleanText(req.query.category,80),requestedStatus=cleanText(req.query.status,20);
  const status=['active','archived'].includes(requestedStatus)?requestedStatus:'all';
  const pageSize=50,total=await countProducts({search,category,onlyActive:false,status}),page=boundedPage(req.query.page,total,pageSize),offset=(page-1)*pageSize;
  const [products,categories]=await Promise.all([listProducts({search,category,onlyActive:false,status,limit:pageSize,offset}),listCategories()]);
  const notices={archived:{type:'success',message:'Product archived. Restore it from this list to put it back in the shop.'},restored:{type:'success',message:'Product restored and visible in the shop again.'},deleted:{type:'success',message:'Product permanently deleted.'},history:{type:'warning',message:'This product has order history and cannot be permanently deleted. Keep it archived to preserve the records.'},reserved:{type:'warning',message:'This product has reserved stock and cannot be changed yet. Finish or cancel its active order first.'},restoreFailed:{type:'warning',message:'This product could not be restored. Refresh the list and check its current state.'},deleteFailed:{type:'warning',message:'This product could not be permanently deleted. Refresh the list and try again.'}};
  const notice=notices[cleanText(req.query.notice,30)]||null;
  render(res,'admin/products',{products,categories,search,category,status,page,total,hasNext:offset+products.length<total,hasPrev:page>1,notice});
});
app.get('/admin/products/new',requireManager,async(req,res)=>render(res,'admin/product-form',{product:null,variants:[],productImages:[],categories:await listCategories(),currency:await getSetting('currency',DEFAULT_STORE_CURRENCY),currencyPriceReviewRequired:await getSetting('currency_price_review_required','0')==='1',error:null,saved:false}));
app.post('/admin/products/save',requireManager,upload.fields([{name:'image',maxCount:1},{name:'galleryImages',maxCount:MAX_ADDITIONAL_GALLERY_UPLOADS}]),verifyCsrf,async(req,res)=>{
  const newUploadedImages=[];
  let previousImageUrls=[];
  let productCommitted=false;
  try {
    const id=optionalFormId(req.body.id);
    const existingProduct=id?await getProductById(id):null;
    if(id && !existingProduct) throw new Error('NOT_FOUND');
    const previousGallery=id?await listProductImages(id):[];
    previousImageUrls=[...(existingProduct?.image_url?[existingProduct.image_url]:[]),...previousGallery.map(image=>image.image_url)].filter(Boolean);
    const storeCurrency=await getSetting('currency',DEFAULT_STORE_CURRENCY);
    const costRaw=req.body.costPrice, saleRaw=req.body.salePrice;
    // An optional sale price must be absent/blank, never a duplicated field.
    if(saleRaw != null && typeof saleRaw !== 'string') throw new Error('SALE_PRICE');
    const costText=typeof costRaw==='string'?costRaw.trim():'';
    const saleText=typeof saleRaw==='string'?saleRaw.trim():'';
    const name=cleanText(req.body.name,120),price=moneyCents(req.body.price,storeCurrency),costPriceCents=moneyCents(costText,storeCurrency),sale=saleText?moneyCents(saleText,storeCurrency):null,automaticDiscountPercent=parseCartQuantity(req.body.automaticDiscountPercent);
    const hasVariants=req.body.hasVariants==='on';
    const variantOptionName=cleanText(req.body.variantOptionName||'Size',40)||'Size';
    const variantOptionName2=cleanText(req.body.variantOptionName2||'',40);
    const asArray=value=>value==null?[]:(Array.isArray(value)?value:[value]);
    const valueFields=asArray(req.body.variantValue), valueFields2=asArray(req.body.variantValue2);
    const stockFields=asArray(req.body.variantStock), skuFields=asArray(req.body.variantSku), imageFields=asArray(req.body.variantImageUrl);
    let variants=[];
    if(hasVariants){
      if(valueFields.length!==stockFields.length || valueFields.length>50 || (valueFields2.length && valueFields2.length!==valueFields.length) || (skuFields.length && skuFields.length!==valueFields.length) || (imageFields.length && imageFields.length!==valueFields.length)) throw new Error('VARIANT_VALIDATION');
      variants=valueFields.map((rawValue,index)=>{
        const value=cleanText(rawValue,80), value2=cleanText(valueFields2[index]??'',80);
        const rawStock=typeof stockFields[index]==='string'?stockFields[index].trim():'';
        if(!value && !value2 && !rawStock && !String(skuFields[index]||'').trim() && !String(imageFields[index]||'').trim()) return null;
        const stock=parseCartQuantity(rawStock);
        if(!value||stock===null||stock>100000000 || (variantOptionName2 && !value2) || (value2 && !variantOptionName2)) throw new Error('VARIANT_VALIDATION');
        const imageUrl=cleanText(imageFields[index]||'',500);
        if(imageUrl&&!isSafeUrl(imageUrl)) throw new Error('VARIANT_IMAGE_URL');
        return {value,value2,stock,sku:cleanText(skuFields[index]||'',60).toUpperCase(),imageUrl};
      }).filter(Boolean);
      if(!variants.length || variants.length>50) throw new Error('VARIANT_VALIDATION');
    } else if(req.body.variantRows){
      // Backward-compatible parsing for older manager forms/bookmarks.
      variants=parseLegacyVariantRows(req.body.variantRows);
    }
    const uniqueVariants=new Set(variants.map(v=>v.value.normalize('NFKC').toLocaleLowerCase('en')+'\u0000'+v.value2.normalize('NFKC').toLocaleLowerCase('en')));
    if(uniqueVariants.size!==variants.length) throw new Error('VARIANT_VALIDATION');
    const stock=hasVariants?0:parseCartQuantity(req.body.stock),reorderLevel=parseCartQuantity(req.body.reorderLevel);
    const saleStartRaw=String(req.body.saleStart||'').trim(),saleEndRaw=String(req.body.saleEnd||'').trim();
    const saleStart=saleStartRaw?dateTimeLocalToISOString(saleStartRaw,storeTimeZone):null,saleEnd=saleEndRaw?dateTimeLocalToISOString(saleEndRaw,storeTimeZone):null;
    if((saleStartRaw&&!saleStart)||(saleEndRaw&&!saleEnd)) throw new Error('SALE_DATE');
    let sku=cleanText(req.body.sku,60).toUpperCase();
    if(!name) throw new Error('NAME');
    if(price===null||price<=0) throw new Error('PRICE');
    if(costText===''||costPriceCents===null||costPriceCents<0) throw new Error('COST');
    if(reorderLevel===null||reorderLevel>100000000) throw new Error('REORDER_LEVEL');
    if(saleText&&(sale===null||sale<=0||sale>=price)) throw new Error('SALE_PRICE');
    if(automaticDiscountPercent===null||automaticDiscountPercent>90) throw new Error('DISCOUNT');
    if(stock===null||stock>100000000) throw new Error('STOCK');
    if(saleStart&&saleEnd&&new Date(saleEnd)<=new Date(saleStart)) throw new Error('SALE_WINDOW');
    if(!sku) sku=await uniqueSku(name,id);
    else if(await getRow('SELECT 1 FROM products WHERE LOWER(sku)=LOWER(?) AND id<>?',[sku,id||0])) throw new Error('SKU_TAKEN');
    const coverFile=req.files?.image?.[0];
    const keptRaw=asArray(req.body.galleryExistingUrl).map(value=>String(value||'').trim());
    const removeRaw=new Set(asArray(req.body.galleryRemoveUrl).map(value=>String(value||'').trim()));
    let image=await safeProductImage(req);
    if(coverFile&&!image) throw new Error('IMAGE');
    if(coverFile) newUploadedImages.push(image);
    // A checked removal of the old cover must not be undone by its prefilled
    // hidden URL field. Select the next kept/new image below as the replacement.
    if(!coverFile && existingProduct?.image_url && removeRaw.has(existingProduct.image_url) && image===existingProduct.image_url) image='';
    const actualExisting=new Set(previousGallery.map(item=>item.image_url));
    const coverReplaced=Boolean(existingProduct?.image_url && image && image!==existingProduct.image_url);
    const keptImages=keptRaw.filter(value=>actualExisting.has(value)&&!removeRaw.has(value)&&!(coverReplaced&&value===existingProduct.image_url));
    const galleryImageUrls=String(req.body.galleryImageUrls||'').split(/\r?\n/).map(value=>value.trim()).filter(Boolean);
    if(galleryImageUrls.length>MAX_ADDITIONAL_GALLERY_UPLOADS) throw new Error('IMAGE_GALLERY_LIMIT');
    for(const url of galleryImageUrls){ if(url.length>500||!isSafeUrl(url)) throw new Error('URL'); }
    const uploadedGallery=[];
    for(const file of (req.files?.galleryImages||[])){
      const uploaded=await safeImagePath(file.buffer,file.mimetype);
      if(!uploaded) throw new Error('IMAGE');
      newUploadedImages.push(uploaded); uploadedGallery.push(uploaded);
    }
    // If the manager only uploads gallery photos and has no existing cover, the
    // first gallery item becomes the cover so product cards never stay imageless.
    if(!image) image=keptImages[0]||galleryImageUrls[0]||uploadedGallery[0]||'';
    const galleryImages=normalizeProductGallery(image,[...keptImages,...galleryImageUrls,...uploadedGallery]);
    const categoryId=optionalFormId(req.body.categoryId);
    if(categoryId && !await getRow('SELECT 1 FROM categories WHERE id=?',[categoryId]))throw new Error('CATEGORY');
    const stableSlug=existingProduct?.slug || await uniqueSlug(name,id);
    const data={id,name,slug:stableSlug,shortDescription:cleanText(req.body.shortDescription,300),description:cleanText(req.body.description,5000),imageUrl:image, galleryImages,priceCents:price,costPriceCents,salePriceCents:sale,saleStart,saleEnd,sku,stock,reorderLevel,categoryId,tags:cleanText(req.body.tags,300),featured:req.body.featured==='on',active:req.body.active==='on',automaticDiscountPercent,variants,variantOptionName,variantOptionName2};
    const savedId=await adminCreateOrUpdateProduct(data);
    productCommitted=true;
    invalidateCategoryNav();
    await safeAudit(req.user.id,id?'product_updated':'product_created','product',savedId,{name:data.name,automaticDiscountPercent:data.automaticDiscountPercent,costPriceCents:data.costPriceCents,reorderLevel:data.reorderLevel,stock:data.stock,variantCount:variants.length,galleryImageCount:galleryImages.length});
    const keepNow=new Set(galleryImages);
    for(const oldUrl of new Set(previousImageUrls)) if(!keepNow.has(oldUrl)) { try { await deleteUploadedAsset(oldUrl); } catch(cleanupError) { logOperationalFailure('Old product image cleanup; metadata retained for recovery',cleanupError); } }
    return res.redirect(303,`/admin/products/${savedId}/edit?saved=1`);
  } catch(err) {
    if(!productCommitted) for(const uploaded of new Set(newUploadedImages)) await deleteUploadedAsset(uploaded).catch(cleanupError=>logOperationalFailure('Uncommitted product image cleanup',cleanupError));
    if(productCommitted) return res.status(500).render('error',{title:'Product saved with a follow-up issue',message:'The product data was saved, but an audit or cleanup step could not be completed. Reload the product list and verify the saved product before retrying.'});
    const errors={INVALID_ID:'This product form contains an invalid ID. Reload it and check the product and category fields.',NAME:'Enter a product name.',PRICE:'Regular price is invalid. Enter an amount greater than zero in the store currency (for example 32,80 or 32.80).',COST:'Purchase cost is invalid. Enter the cost of one unit in the store currency; zero is allowed.',REORDER_LEVEL:'Enter a whole reorder threshold from 0 to 100,000,000.',SALE_PRICE:'Sale price is optional, but when entered it must be greater than zero and lower than the regular price. Leave Sale price blank if you only want to use Automatic discount %.',DISCOUNT:'Automatic discount must be a whole number from 0 to 90.',STOCK:'Enter a whole stock quantity from 0 to 100,000,000.',SALE_DATE:'Enter valid sale dates, or leave them empty.',SALE_WINDOW:'Sale end must be later than sale start.',SKU_TAKEN:'This SKU is already used by another product. Change it or leave it blank for an automatic SKU.',CATEGORY:'Choose an existing category or select No category.',IMAGE:'Use a valid JPG, PNG or WebP image up to 2 MiB.',URL:'Image URL must use a trusted HTTPS address.',RESERVED_STOCK:'Stock cannot be lower than stock currently reserved in checkout.',RESERVED_VARIANT_STOCK:'You cannot deactivate or reduce an option while its stock is reserved in an open order.',RESERVED_STOCK_MODE_CHANGE:'Cancel or complete open orders before changing this product between option inventory and simple inventory.',VARIANT_VALIDATION:'Check product options. Add 1–50 unique option combinations and enter a whole stock number for each. Use a value for the second option on every row when the second option name is set.',VARIANT_SKU_CONFLICT:'A variant SKU is empty, invalid or already used. Every sellable combination needs a unique SKU.',VARIANT_IMAGE_URL:'Variant image must be a gallery image or a trusted HTTPS image URL.',IMAGE_GALLERY_LIMIT:'Use no more than 6 product images in total, including the main cover. Upload up to 5 additional images.',IMAGE_STORAGE_QUOTA_REACHED:'The image-storage limit has been reached. No new image was saved.',IMAGE_STORAGE_NOT_CONFIGURED:'Image storage is not configured. No new image was saved.'};
    return res.status(400).render('admin/product-form',{product:req.body,variants:[],productImages:validId(req.body.id)?await listProductImages(Number(req.body.id)):[],categories:await listCategories(),currency:await getSetting('currency',DEFAULT_STORE_CURRENCY),currencyPriceReviewRequired:await getSetting('currency_price_review_required','0')==='1',error:errors[err.message]||'Could not save the product. Your entries are still here; check the highlighted details and try again.',saved:false,restocked:false,restockError:null,galleryNotice:null});
  }
});
app.get('/admin/products/:id/edit',requireManager,async(req,res)=>{const productId=validId(req.params.id)?Number(req.params.id):null;const product=productId?await getProductById(productId):null;if(!product)return res.status(404).render('error',{title:'Product not found',message:'Product does not exist.'});const restockError=cleanText(req.query.restockError,220);const galleryNotices={deleted:{type:'success',message:'Image removed. If it was the cover, the next image is now the main photo.'},last:{type:'warning',message:'A product must keep at least one image. Upload a replacement image before deleting this one.'},missing:{type:'warning',message:'That gallery image no longer exists. Refresh the page and try again.'},failed:{type:'warning',message:'The image could not be removed. Refresh the page and try again.'}};render(res,'admin/product-form',{product,variants:await listProductVariants(product.id),productImages:await listProductImages(product.id),categories:await listCategories(),currency:await getSetting('currency',DEFAULT_STORE_CURRENCY),currencyPriceReviewRequired:await getSetting('currency_price_review_required','0')==='1',error:null,saved:req.query.saved==='1',restocked:req.query.restocked==='1',restockError:restockError||null,galleryNotice:galleryNotices[cleanText(req.query.galleryNotice,20)]||null});});
app.post('/admin/products/:productId/images/:imageId/delete',requireManager,verifyCsrf,async(req,res)=>{
  const productId=validId(req.params.productId)?Number(req.params.productId):null;
  const imageId=validId(req.params.imageId)?Number(req.params.imageId):null;
  if(!productId||!imageId) return res.redirect(303,'/admin/products?notice=deleteFailed');
  try {
    const result=await deleteProductImage(productId,imageId);
    // The DB mutation commits first. The shared-asset guard prevents unlinking a
    // file/BLOB still used by a product, variant, story or category.
    try { await deleteUploadedAsset(result.deletedImage.image_url); }
    catch(cleanupError) { logOperationalFailure('Deleted product image filesystem cleanup failed',cleanupError); }
    await safeAudit(req.user.id,'product_image_deleted','product',productId,{imageId,imageUrl:result.deletedImage.image_url,replacementPrimary:Boolean(result.replacementImage),remainingCount:result.remainingCount});
    return res.redirect(303,`/admin/products/${productId}/edit?galleryNotice=deleted`);
  } catch(error) {
    if(error?.message==='LAST_PRODUCT_IMAGE') return res.redirect(303,`/admin/products/${productId}/edit?galleryNotice=last`);
    if(error?.message==='PRODUCT_NOT_FOUND'||error?.message==='PRODUCT_IMAGE_NOT_FOUND') return res.redirect(303,`/admin/products/${productId}/edit?galleryNotice=missing`);
    logOperationalFailure('Product gallery image deletion failed',error);
    return res.redirect(303,`/admin/products/${productId}/edit?galleryNotice=failed`);
  }
});
app.post('/admin/products/restock',requireManager,verifyCsrf,async(req,res)=>{
  try {
    const productId=validId(req.body.id)?Number(req.body.id):null;
    const variantId=optionalFormId(req.body.variantId);
    const amount=parseCartQuantity(req.body.quantity);
    if(!productId || amount===null || amount<=0 || amount>100000000) throw new Error('INVALID_RESTOCK');
    if(variantId){
      const variant=await getProductVariantById(variantId);
      if(!variant || Number(variant.product_id)!==productId || !variant.active) throw new Error('RESTOCK_FAILED');
      await restockProductVariant(variantId,amount);
      await safeAudit(req.user.id,'product_variant_restocked','product',productId,{variantId,quantity:amount});
    } else {
      await restockProduct(productId,amount);
      await safeAudit(req.user.id,'product_restocked','product',productId,{quantity:amount});
    }
    // A restock is the only automatic email trigger; no third-party tracking.
    if(res.locals.appearance.stockAlerts && emailEnabled()){
      try {
        const pending=await claimStockAlerts(productId,20);
        for(const entry of pending){
          let delivered=false;
          try {
            const url=new URL(`/product/${encodeURIComponent(entry.slug)}`,siteBase(req));
            delivered=Boolean((await sendEngagementEmail({email:entry.email,kind:'stock-available',actionUrl:url.toString(),storeName:res.locals.storeName,productName:entry.name,locale:res.locals.locale})).sent);
          } catch(error){logOperationalFailure('Stock alert delivery',error);}
          await finishStockAlert(entry.id,delivered);
        }
      }catch(error){logOperationalFailure('Restock alert queue',error);}
    }
    return res.redirect(303,`/admin/products/${productId}/edit?restocked=1`);
  } catch(err){
    const message=err.message==='INVALID_RESTOCK'?'Enter a whole restock quantity from 1 to 100,000,000.':'The stock could not be increased. Refresh the product and try again.';
    const productId=validId(req.body.id)?Number(req.body.id):null;
    if(productId) return res.redirect(303,`/admin/products/${productId}/edit?restockError=${encodeURIComponent(message)}`);
    return res.status(400).render('error',{title:'Restock failed',message});
  }
});

// Archive, restore and permanent deletion are separate, explicit lifecycle actions.
// Global CSRF verification applies to every POST; the explicit verifier documents the
// security requirement at each destructive/lifecycle route as well.
app.post('/admin/products/archive',requireManager,verifyCsrf,async(req,res)=>{
  const id=validId(req.body.id)?Number(req.body.id):null;
  if(!id) return res.redirect(303,'/admin/products?notice=deleteFailed');
  const product=await getProductById(id);
  if(!product) return res.redirect(303,'/admin/products?notice=deleteFailed');
  const archived=await archiveProduct(id);
  if(!archived) return res.redirect(303,'/admin/products?notice=reserved');
  await safeAudit(req.user.id,'product_archived','product',id,{name:product.name});
  return res.redirect(303,'/admin/products?status=archived&notice=archived');
});
app.post('/admin/products/restore',requireManager,verifyCsrf,async(req,res)=>{
  const id=validId(req.body.id)?Number(req.body.id):null;
  if(!id) return res.redirect(303,'/admin/products?status=archived&notice=restoreFailed');
  const product=await getProductById(id);
  if(!product) return res.redirect(303,'/admin/products?status=archived&notice=restoreFailed');
  const restored=await restoreProduct(id);
  if(!restored) return res.redirect(303,'/admin/products?status=archived&notice=reserved');
  await safeAudit(req.user.id,'product_restored','product',id,{name:product.name});
  return res.redirect(303,'/admin/products?status=active&notice=restored');
});
app.post('/admin/products/delete',requireManager,verifyCsrf,async(req,res)=>{
  // Keep the manager on the same catalogue filter after a destructive action.
  // The helper accepts only known filters/notices and never trusts a submitted URL.
  const requestedReturnStatus=typeof req.body.returnStatus==='string'?req.body.returnStatus:'';
  const productListUrl=(notice)=>buildProductDeleteRedirect(requestedReturnStatus,notice);
  const id=validId(req.body.id)?Number(req.body.id):null;
  if(!id) return res.redirect(303,productListUrl('deleteFailed'));
  try {
    // The database transaction checks order history and reserved stock again, so a
    // stale manager page cannot delete a product that checkout has just reserved.
    const product=await permanentlyDeleteProduct(id);
    try { await deleteUploadedAsset(product.image_url); }
    catch(error) { logOperationalFailure('Permanently deleted product image cleanup',error); }
    await safeAudit(req.user.id,'product_permanently_deleted','product',id,{name:product.name,sku:product.sku});
    return res.redirect(303,productListUrl('deleted'));
  } catch(error) {
    if(error?.message==='PRODUCT_HAS_ORDER_HISTORY') {
      // A delete request must never mutate visibility as a side effect. Ask the
      // manager to choose Archive explicitly so the action is predictable.
      return res.redirect(303,productListUrl('history'));
    }
    if(error?.message==='PRODUCT_HAS_RESERVED_STOCK') return res.redirect(303,productListUrl('reserved'));
    return res.redirect(303,productListUrl('deleteFailed'));
  }
});

app.get('/admin/stories',requireManager,async(req,res)=>render(res,'admin/stories',{stories:await listStories(),error:null}));
app.get('/admin/stories/new',requireManager,async(req,res)=>render(res,'admin/story-form',{story:null,products:await listProducts({onlyActive:true}),error:null}));
app.post('/admin/stories/save',requireManager,upload.single('image'),verifyCsrf,async(req,res)=>{
  let savedImage=null;
  let previousImage=null;
  let storyCommitted=false;
  try {
    const id=optionalFormId(req.body.id);
    previousImage=id?(await getStory(id))?.image_url||null:null;
    const title=cleanText(req.body.title,120),published=dateTimeLocalToISOString(req.body.publishedAt,storeTimeZone),expires=dateTimeLocalToISOString(req.body.expiresAt,storeTimeZone),link=cleanText(req.body.linkUrl,500);
    if(!title||!published||!expires||new Date(expires)<=new Date(published))throw new Error('VALIDATION');
    if(!isSafeUrl(link))throw new Error('URL');
    const productId=optionalFormId(req.body.productId);
    if (productId) {
      const product = await getProductById(productId);
      if (!product || !product.active) throw new Error('PRODUCT');
    }
    if (productId && link) throw new Error('BOTH_PRODUCT_AND_LINK');
    const image=req.file?await safeImagePath(req.file.buffer,req.file.mimetype):cleanText(req.body.imageUrl,500); savedImage=image;
    if(req.file&&!image)throw new Error('IMAGE'); if(!isSafeUrl(image))throw new Error('URL');
    const savedId=await adminCreateOrUpdateStory({id,title,body:cleanText(req.body.body,1000),imageUrl:image,linkUrl:link,productId,publishedAt:published,expiresAt:expires,active:req.body.active==='on'});
    storyCommitted=true; // Do not delete savedImage after the story row now references it.
    await safeAudit(req.user.id,'story_saved','story',savedId,{title}); if(req.file && previousImage && previousImage!==savedImage) { try { await deleteUploadedAsset(previousImage); } catch(cleanupError) { logOperationalFailure('Old story image cleanup; metadata retained for recovery',cleanupError); } } return res.redirect(303,'/admin/stories');
  } catch (err) {
    if(req.file && savedImage && !storyCommitted) await deleteUploadedAsset(savedImage).catch(cleanupError=>logOperationalFailure('Uncommitted story image cleanup',cleanupError));
    if(storyCommitted) return res.status(500).render('error',{title:'Story saved with a follow-up issue',message:'The story data was saved, but an audit or cleanup step could not be completed. Reload the stories list and verify the saved story before retrying.'});
    const errors = {
      INVALID_ID: 'This story form contains an invalid ID. Reload it and check the story and product fields.',
      PRODUCT: 'Choose an active product, or clear it and use a custom link instead.',
      BOTH_PRODUCT_AND_LINK: 'Choose either a product or a custom link — not both.',
      VALIDATION: 'Check the title and dates (expiry must be after publish).',
      URL: 'Use a trusted HTTPS URL or a local path starting with "/".',
      IMAGE: 'Use a valid JPG, PNG or WebP image up to 2 MiB.',
      IMAGE_STORAGE_QUOTA_REACHED: 'The image-storage limit has been reached. No new image was saved.',
      IMAGE_STORAGE_NOT_CONFIGURED: 'Image storage is not configured. No new image was saved.'
    };
    return res.status(400).render('admin/story-form', {
      story: req.body,
      products: await listProducts({onlyActive:true}),
      error: errors[err.message] || 'Could not save story. Check dates, URL, product and image.'
    });
  }
});
app.get('/admin/stories/:id/edit',requireManager,async(req,res)=>{
  const storyId=validId(req.params.id)?Number(req.params.id):null;
  const story=storyId?await getStory(storyId):null;
  if(!story)return res.status(404).render('error',{title:'Story not found',message:'Story does not exist.'});

  const activeProducts = await listProducts({onlyActive:true});
  let products = activeProducts;

  if (story.product_id) {
    const already = activeProducts.some(p => Number(p.id) === Number(story.product_id));
    if (!already) {
      const current = await getProductById(story.product_id);
      if (current) {
        current.__inactive = true;
        products = [current, ...activeProducts];
      }
    }
  }

  render(res,'admin/story-form',{story,products,error:null});
});
app.post('/admin/stories/delete',requireManager,async(req,res)=>{
  const id=validId(req.body.id)?Number(req.body.id):null;
  if(!id) return res.status(400).render('admin/stories',{stories:await listStories(),error:'Select a valid story before deleting.'});
  const story=await getStory(id);
  if(!story) return res.status(404).render('admin/stories',{stories:await listStories(),error:'This story no longer exists. Refresh the list.'});
  const deleted=await deleteStory(id);
  if(!deleted) return res.status(404).render('admin/stories',{stories:await listStories(),error:'This story changed before deletion. Refresh the list and try again.'});
  try { await deleteUploadedAsset(story.image_url); }
  catch(cleanupError) { logOperationalFailure('Deleted story image cleanup; metadata retained for recovery',cleanupError); }
  await safeAudit(req.user.id,'story_deleted','story',id);
  return res.redirect(303,'/admin/stories');
});

app.get('/admin/orders',requireManager,async(req,res)=>{
  const search=cleanText(req.query.search,80),status=cleanText(req.query.status,30),pageSize=50;
  const total=await countOrders({search,status});
  const page=boundedPage(req.query.page,total,pageSize),offset=(page-1)*pageSize;
  const orders=await listOrders({search,status,limit:pageSize,offset});
  render(res,'admin/orders',{orders,search,status,page,pageSize,total,hasNext:offset+orders.length<total,hasPrev:page>1});
});
app.get('/admin/orders/:id',requireManager,async(req,res)=>{const orderId=validId(req.params.id)?Number(req.params.id):null;const order=orderId?await getOrder(orderId):null;if(!order)return res.status(404).render('error',{title:'Order not found',message:'Order does not exist.'});const statusError=req.query.statusError==='order'?'The order status was not changed. It may already have changed, or its payment/reserved inventory state is invalid. Refresh and verify before retrying.':req.query.statusError==='cancel-request'?'The cancellation request could not be rejected. Refresh the order and check whether the request is still pending.':req.query.statusError==='legacy'?'This older order could not be confirmed as cash on delivery. Check its payment details and reserved stock before trying again.':req.query.statusError==='mollie-reconcile'?'Payment reconciliation failed. Confirm the exact payment ID in Mollie Dashboard and verify that its order number, amount, currency and test/live mode match before retrying. No order was marked paid based on the browser form.':req.query.statusError==='mollie-financials'?'Mollie financial status could not be refreshed. No order status was changed. Verify the payment reference and provider response, then retry.':req.query.statusError==='bank-transfer'?'Bank transfer was not confirmed. Verify the actual bank statement, exact order total and unique transaction reference. No order status was changed.':null;const reconciled=['paid','pending','authorized','canceled','expired','failed'].includes(String(req.query.reconciled||''))?String(req.query.reconciled):null;const [orderHistory,returns,emailDeliveries]=await Promise.all([listOrderStatusHistory(order.id),listOrderReturns(order.id),getOrderEmailDeliveries(order.id)]);const emailResult=['sent','retry-unavailable','reconciled','error'].includes(req.query.email)?req.query.email:'';const financialsRefreshed=req.query.financials==='checked';render(res,order.payment_provider==='cash_on_delivery'?'admin/order-cash':'admin/order',{order,bankTransferInfo:parseBankTransferSnapshot(order.payment_instructions_snapshot),orderHistory,returns,emailDeliveries,emailResult,statusError,reconciled,financialsRefreshed});});
app.post('/admin/orders/:id/email/retry',requireManager,verifyCsrf,async(req,res)=>{
  const id=validId(req.params.id)?Number(req.params.id):null;
  if(!id)return res.redirect(303,'/admin/orders');
  const eventKey=cleanText(req.body.eventKey,60);
  const delivery=(await getOrderEmailDeliveries(id)).find(row=>row.event_key===eventKey);
  if(!delivery)return res.redirect(303,`/admin/orders/${id}?email=retry-unavailable`);
  const result=await maybeSendOrderNotification(id,delivery.event_type,eventKey);
  await safeAudit(req.user.id,'order_email_retry','order',id,{eventKey,sent:Boolean(result.sent),reason:result.reason||''});
  return res.redirect(303,`/admin/orders/${id}?email=${result.sent?'sent':'retry-unavailable'}`);
});
app.post('/admin/orders/:id/email/reconcile',requireManager,verifyCsrf,async(req,res)=>{
  const id=validId(req.params.id)?Number(req.params.id):null;
  if(!id)return res.redirect(303,'/admin/orders');
  if(req.body.providerChecked!=='yes'||!['sent','not-sent'].includes(req.body.outcome))return res.redirect(303,`/admin/orders/${id}?email=error`);
  const eventKey=cleanText(req.body.eventKey,60),providerMessageId=cleanText(req.body.providerMessageId,200);
  const reviewedNumber=value=>typeof value==='string'&&/^(0|[1-9]\d{0,14})$/.test(value)?Number(value):null;
  const expectedGeneration=reviewedNumber(req.body.expectedGeneration),expectedAttemptCount=reviewedNumber(req.body.expectedAttemptCount);
  if(expectedGeneration===null||expectedAttemptCount===null)return res.redirect(303,`/admin/orders/${id}?email=error`);
  try {
    const result=await reconcileOrderEmailDelivery(id,eventKey,{managerUserId:req.user.id,outcome:req.body.outcome,providerMessageId,expectedGeneration,expectedAttemptCount});
    return res.redirect(303,`/admin/orders/${id}?email=${result?'reconciled':'error'}`);
  } catch(error) {
    logOperationalFailure('Reconcile order email delivery',error);
    return res.redirect(303,`/admin/orders/${id}?email=error`);
  }
});
app.post('/admin/orders/refresh-mollie-financials',requireManager,verifyCsrf,async(req,res)=>{
  const id=validId(req.body.id)?Number(req.body.id):null;
  if(!id) return res.redirect(303,'/admin/orders');
  const order=await getOrder(id);
  if(!order) return res.redirect(303,'/admin/orders');
  if(order.payment_provider!=='mollie'||!/^tr_[A-Za-z0-9]+$/.test(String(order.payment_reference||''))) return res.redirect(303,`/admin/orders/${id}?statusError=mollie-financials`);
  try {
    const payment=await getMolliePayment(order.payment_reference,{apiKey:process.env.MOLLIE_API_KEY,nodeEnv:paymentNodeEnvironment()});
    const financials=await refreshMollieFinancialSnapshot(order,payment,req.user.id);
    await safeAudit(req.user.id,'mollie_financials_refreshed','order',id,{currency:financials.currency,refundedCents:financials.refundedCents,chargedBackCents:financials.chargedBackCents});
    return res.redirect(303,`/admin/orders/${id}?financials=checked`);
  } catch(error) {
    logOperationalFailure('Manager Mollie financial refresh',error);
    return res.redirect(303,`/admin/orders/${id}?statusError=mollie-financials`);
  }
});
app.post('/admin/orders/reconcile-mollie-payment',requireManager,verifyCsrf,async(req,res)=>{
  const id=validId(req.body.id)?Number(req.body.id):null;
  const paymentId=cleanText(req.body.paymentId,80);
  if(!id) return res.redirect(303,'/admin/orders');
  const order=await getOrder(id);
  if(!order) return res.redirect(303,'/admin/orders');
  if(order.status!=='pending'||order.payment_provider!=='mollie') return res.redirect(303,`/admin/orders/${id}?statusError=mollie-reconcile`);
  if(!/^tr_[A-Za-z0-9]+$/.test(paymentId)) return res.redirect(303,`/admin/orders/${id}?statusError=mollie-reconcile`);
  try {
    const payment=await getMolliePayment(paymentId,{apiKey:process.env.MOLLIE_API_KEY,nodeEnv:paymentNodeEnvironment()});
    const candidate={...order,payment_reference:payment.id,payment_provider:'mollie'};
    if(!validateMolliePaymentForOrder(payment,candidate)) throw new Error('PAYMENT_REFERENCE_MISMATCH');
    const state=String(payment.status||'').toLowerCase();
    if(!['open','pending','authorized','paid','canceled','expired','failed'].includes(state)) throw new Error('PAYMENT_STATUS_NOT_RECONCILABLE');
    const checkoutUrl=isTrustedMollieCheckoutUrl(payment?._links?.checkout?.href)?payment._links.checkout.href:null;
    if(['open','pending'].includes(state)&&!checkoutUrl) throw new Error('PAYMENT_CHECKOUT_URL_MISSING');
    const attached=await attachReconciledMolliePaymentReference(id,payment.id,checkoutUrl);
    if(!attached) throw new Error('PAYMENT_REFERENCE_CONFLICT');
    const refreshed=await getOrder(id);
    if(!refreshed) throw new Error('PAYMENT_ORDER_NOT_FOUND');
    const beforeStatus=refreshed.status;
    const resolved=await applyMolliePaymentState(refreshed,payment);
    const after=await getOrder(id);
    if(resolved==='paid'&&beforeStatus==='pending'&&after?.status==='paid') {
      await safeAudit(req.user.id,'mollie_payment_reconciled_paid','order',id,{paymentReference:payment.id,providerStatus:state});
      await maybeSendOrderNotification(id,'confirmation');
    } else if(['canceled','expired','failed'].includes(resolved)&&beforeStatus==='pending'&&after?.status==='cancelled') {
      await safeAudit(req.user.id,'mollie_payment_reconciled_terminal','order',id,{paymentReference:payment.id,providerStatus:state});
    } else {
      await safeAudit(req.user.id,'mollie_payment_reference_reconciled','order',id,{paymentReference:payment.id,providerStatus:state});
    }
    return res.redirect(303,`/admin/orders/${id}?reconciled=${encodeURIComponent(resolved)}`);
  } catch(error) {
    logOperationalFailure('Manager Mollie payment reconciliation',error);
    return res.redirect(303,`/admin/orders/${id}?statusError=mollie-reconcile`);
  }
});

app.post('/admin/orders/confirm-legacy-cod',requireManager,verifyCsrf,async(req,res)=>{
  const id=validId(req.body.id)?Number(req.body.id):null;
  if(!id) return res.redirect(303,'/admin/orders');
  const order=await getOrder(id);
  if(!order) return res.redirect(303,'/admin/orders');
  const result=await confirmLegacyPendingOrderAsCod(id,order.payment_provider,req.user.id);
  if(!result.changed) return res.redirect(303,`/admin/orders/${id}?statusError=legacy`);
  await safeAudit(req.user.id,'legacy_order_verified_as_cod','order',id,{previousPaymentProvider:result.previousProvider});
  await maybeSendOrderNotification(id,'status');
  return res.redirect(303,`/admin/orders/${id}`);
});

app.post('/admin/orders/confirm-bank-transfer',requireManager,verifyCsrf,async(req,res)=>{
  const id=validId(req.body.id)?Number(req.body.id):null;
  if(!id) return res.redirect(303,'/admin/orders');
  const order=await getOrder(id);
  if(!order||order.status!=='pending'||order.payment_provider!=='bank_transfer') return res.redirect(303,`/admin/orders/${id}?statusError=bank-transfer`);
  const receivedAmount=moneyCents(req.body.receivedAmount,order.currency);
  const bankReference=cleanText(req.body.bankReference,100);
  const confirmed=req.body.confirmReceived==='on';
  if(receivedAmount===null||receivedAmount!==Number(order.total_cents)||!bankReference||!confirmed) return res.redirect(303,`/admin/orders/${id}?statusError=bank-transfer`);
  try {
    const changed=await confirmBankTransferOrderPaid(id,receivedAmount,order.currency,bankReference,req.user.id);
    if(!changed) return res.redirect(303,`/admin/orders/${id}?statusError=bank-transfer`);
    await safeAudit(req.user.id,'bank_transfer_manually_verified','order',id,{currency:order.currency,amount:receivedAmount});
    await maybeSendOrderNotification(id,'status');
    return res.redirect(303,`/admin/orders/${id}`);
  } catch(error) {
    logOperationalFailure('Manager bank-transfer verification',error);
    return res.redirect(303,`/admin/orders/${id}?statusError=bank-transfer`);
  }
});

app.post('/admin/orders/status',requireManager,verifyCsrf,async(req,res)=>{
  const id=validId(req.body.id)?Number(req.body.id):null,status=cleanText(req.body.status,30);
  if(!validId(id)) return res.redirect(303,'/admin/orders');
  if(status==='reject_cancel_request'){
    const rejected=await decideOrderCancellationRequest(id,'rejected',req.user.id);
    if(rejected) await safeAudit(req.user.id,'order_cancellation_request_rejected','order',id);
    return res.redirect(303,`/admin/orders/${id}${rejected?'':'?statusError=cancel-request'}`);
  }
  if(!['processing','shipped','completed','cancelled'].includes(status)) return res.redirect(303,'/admin/orders');
  const changed=await setOrderStatus(id,status,req.user.id);
  if(changed){await safeAudit(req.user.id,'order_status_changed','order',id,{status});await maybeSendOrderNotification(id,'status');}
  if(!changed) return res.redirect(303,`/admin/orders/${id}?statusError=order`);
  return res.redirect(303,`/admin/orders/${id}`);
});

app.get('/admin/returns',requireManager,async(req,res)=>{
  const status=cleanText(req.query.status,30);
  const validStatus=['requested','approved','rejected','item_received','exchange_sent','refund_recorded','completed','cancelled'].includes(status)?status:'';
  const pageSize=50,total=await countOrderReturnRequests({status:validStatus});
  const page=boundedPage(req.query.page,total,pageSize),pages=Math.max(1,Math.ceil(total/pageSize));
  const returnRequests=await listOrderReturnRequests({status:validStatus,limit:pageSize,offset:(page-1)*pageSize});
  render(res,'admin/returns',{returns:returnRequests,returnRequests,status:validStatus,page,pageSize,total,pages,resultMessage:req.query.result==='updated'?'Return request updated.':req.query.result==='error'?'The requested change was not allowed. Refresh and check the current request state.':null});
});
app.post('/admin/returns/:id/action',requireManager,verifyCsrf,async(req,res)=>{
  const returnId=validId(req.params.id)?Number(req.params.id):null;
  if(!returnId)return res.redirect(303,'/admin/returns?result=error');
  const action=cleanText(req.body.action,30),note=cleanText(req.body.managerNote,500),reference=cleanText(req.body.refundReference||req.body.exchangeReference,100),method=cleanText(req.body.refundMethod,30);
  const before=await getOrderReturn(returnId);
  if(!before)return res.redirect(303,'/admin/returns?result=error');
  // Orders retain their original currency; changing the store's current currency
  // must never reinterpret a refund amount for an older order.
  const currency=String(before.currency||DEFAULT_STORE_CURRENCY).toUpperCase();
  const refundAmountCents=action==='record_refund'?moneyCents(req.body.refundAmount,currency):0;
  if(action==='record_refund'&&(!Number.isSafeInteger(refundAmountCents)||refundAmountCents<=0))return res.redirect(303,'/admin/returns?result=error');
  if(action==='dispatch_exchange'&&reference.length<3)return res.redirect(303,'/admin/returns?result=error');
  const result=await processOrderReturn({returnId,action,managerUserId:req.user.id,note,refundAmountCents,refundMethod:method,refundReference:reference,restock:req.body.restockReturnedItem==='on'});
  if(!result.changed)return res.redirect(303,'/admin/returns?result=error');
  if(['approve','reject'].includes(action)) await sendReturnRequestEmail({email:before.customer_email,orderId:before.order_id,requestId:returnId,status:action==='approve'?'approved':'rejected',storeName:await getSetting('store_name',storeNameFallback),locale:emailLocaleFor(res.locals.locale)}).catch(error=>logOperationalFailure('Return decision email',error));
  await safeAudit(req.user.id,`order_return_${action.replace(/[^a-z_]/g,'')}`,'order_return',returnId,{orderId:before.order_id,status:result.status,refundAmountCents:action==='record_refund'?refundAmountCents:undefined,restocked:action==='receive'&&req.body.restockReturnedItem==='on'});
  return res.redirect(303,'/admin/returns?result=updated');
});

app.get('/admin/coupons',requireManager,async(req,res)=>{const editId=validId(req.query.edit)?Number(req.query.edit):null;const [coupons,editCoupon]=await Promise.all([listCoupons(),editId?getCouponById(editId):null]);render(res,'admin/coupons',{coupons,editCoupon,error:null});});
app.post('/admin/coupons/save',requireManager,async(req,res)=>{
  try {
    const id=optionalFormId(req.body.id),code=cleanText(req.body.code,40).toUpperCase(),requestedType=typeof req.body.type==='string'?req.body.type:'',storeCurrency=await getSetting('currency',DEFAULT_STORE_CURRENCY);
    if(!['fixed','percent'].includes(requestedType)) throw new Error('VALIDATION');
    const type=requestedType;
    const value=type==='fixed'?moneyCents(req.body.value,storeCurrency):parseCartQuantity(req.body.value),minSubtotalCents=moneyCents(req.body.minSubtotal||'0',storeCurrency);
    const expiresRaw=String(req.body.expiresAt||'').trim(),expiresAt=expiresRaw?dateTimeLocalToISOString(expiresRaw,storeTimeZone):null;
    if((expiresRaw&&!expiresAt)||!/^[A-Z0-9_-]{3,40}$/.test(code)||!Number.isInteger(value)||value<=0||(type==='percent'&&value>100)||minSubtotalCents===null||!Number.isInteger(minSubtotalCents)||minSubtotalCents<0)throw new Error('VALIDATION');
    const savedId=await adminCreateOrUpdateCoupon({id,code,type,value,minSubtotalCents,expiresAt,active:req.body.active==='on'});
    await safeAudit(req.user.id,id?'coupon_updated':'coupon_created','coupon',savedId,{code,type});return res.redirect(303,'/admin/coupons');
  } catch { return res.status(400).render('admin/coupons',{coupons:await listCoupons(),editCoupon:{...req.body,id:req.body.id||null},error:'Could not save coupon. Check the code, value, minimum and expiry date.'}); }
});
app.post('/admin/coupons/delete',requireManager,async(req,res)=>{
  const id=validId(req.body.id)?Number(req.body.id):null;
  if(!id) return res.status(400).render('admin/coupons',{coupons:await listCoupons(),editCoupon:null,error:'Select a valid coupon before deleting.'});
  const existing=await getCouponById(id);
  if(!existing) return res.status(404).render('admin/coupons',{coupons:await listCoupons(),editCoupon:null,error:'This coupon no longer exists. Refresh the list.'});
  const deleted=await deleteCoupon(id);
  if(!deleted) return res.status(404).render('admin/coupons',{coupons:await listCoupons(),editCoupon:null,error:'This coupon changed before deletion. Refresh the list and try again.'});
  await safeAudit(req.user.id,'coupon_deleted','coupon',id);
  return res.redirect(303,'/admin/coupons');
});

app.get('/admin/e-invoicing',requireManager,async(req,res)=>render(res,'admin/e-invoicing',{
 submissions:await listPeppolSubmissions(),result:null,error:null,
 configured:Boolean(process.env.PEPPOL_RECOMMAND_COMPANY_ID&&process.env.PEPPOL_RECOMMAND_API_KEY&&process.env.PEPPOL_RECOMMAND_API_SECRET),
 isPlayground:process.env.PEPPOL_RECOMMAND_ENV==='playground',peppolEnabled:(await getSetting('feature_peppol_enabled','0'))==='1'
}));
app.post('/admin/e-invoicing',requireManager,verifyCsrf,async(req,res)=>{
 const isPlayground=process.env.PEPPOL_RECOMMAND_ENV==='playground';
 const configured=Boolean(process.env.PEPPOL_RECOMMAND_COMPANY_ID&&process.env.PEPPOL_RECOMMAND_API_KEY&&process.env.PEPPOL_RECOMMAND_API_SECRET);
 const page=async result=>render(res,'admin/e-invoicing',{submissions:await listPeppolSubmissions(),configured,isPlayground,peppolEnabled:(await getSetting('feature_peppol_enabled','0'))==='1',...result});
 const action=String(req.body.action||'');
 try {
  if(!configured||!['validate','send'].includes(action))throw new Error('NOT_CONFIGURED');
  if(String(await getSetting('feature_peppol_enabled','0'))!=='1')throw new Error('DISABLED');
  if(action==='send'&&String(req.body.confirmation||'')!=='SEND PEPPOL')throw new Error('CONFIRMATION_REQUIRED');
  // A self-declared playground flag alone cannot prove that API credentials belong to an isolated sandbox team.
  if(action==='send'&&process.env.PEPPOL_SEND_APPROVED!=='1')throw new Error('SEND_NOT_APPROVED');
  if(action==='send'&&!isPlayground&&process.env.PEPPOL_PRODUCTION_SEND_APPROVED!=='1')throw new Error('PRODUCTION_NOT_APPROVED');
  const payload=validatePeppolInvoiceForm(req.body);
  const config={companyId:process.env.PEPPOL_RECOMMAND_COMPANY_ID,key:process.env.PEPPOL_RECOMMAND_API_KEY,secret:process.env.PEPPOL_RECOMMAND_API_SECRET,payload};
  if(action==='validate') {
   const response=await requestRecommand({...config,send:false});
   return page({error:response.ok?null:'Provider did not validate this draft. Review all invoice fields in the Peppol provider dashboard.',result:response.ok?'The provider validated the invoice draft without sending it.':'Draft was not validated.'});
  }
  const claim=await claimPeppolSubmission({invoiceNumber:payload.document.invoiceNumber,recipient:payload.recipient,payloadHash:peppolPayloadHash(payload),managerId:req.user.id});
  if(!claim.claimed)throw new Error('INVOICE_ALREADY_SUBMITTED');
  let response;
  try{response=await requestRecommand({...config,send:true});}
  catch(error){await finishPeppolSubmission(claim.id,'reconciliation_required');throw new Error('SEND_RECONCILIATION_REQUIRED');}
  await finishPeppolSubmission(claim.id,response.ok?'submitted':'reconciliation_required',response.reference||'');
  if(!response.ok)throw new Error('SEND_RECONCILIATION_REQUIRED');
  await safeAudit(req.user.id,'peppol_invoice_submitted','invoice',claim.id,{invoiceNumber:payload.document.invoiceNumber,playground:isPlayground});
  return page({error:null,result:'The provider accepted the invoice submission. Verify delivery separately in the provider dashboard.'});
 }catch(error){
  const messages={NOT_CONFIGURED:'Peppol integration is not configured.',DISABLED:'Enable Peppol in Manager first.',CONFIRMATION_REQUIRED:'Type SEND PEPPOL exactly before sending.',SEND_NOT_APPROVED:'Provider submission is disabled. Set PEPPOL_SEND_APPROVED=1 only after independently verifying that the credentials are for the intended company and environment.',PRODUCTION_NOT_APPROVED:'Production submission is disabled. Use playground until legal/company verification and provider configuration are complete.',INVOICE_ALREADY_SUBMITTED:'This invoice number was already used. Reconcile in the provider dashboard instead of sending again.',SEND_RECONCILIATION_REQUIRED:'The outcome is uncertain or rejected. Do not send again without checking the provider dashboard.'};
  return res.status(400).render('admin/e-invoicing',{submissions:await listPeppolSubmissions(),result:null,error:messages[error.message]||'Check the invoice fields, VAT, buyer and bank details. Nothing has been claimed as delivered.',configured,isPlayground,peppolEnabled:(await getSetting('feature_peppol_enabled','0'))==='1'});
 }
});
app.post('/admin/e-invoicing/toggle',requireManager,verifyCsrf,async(req,res)=>{
 await setSetting('feature_peppol_enabled',req.body.enabled==='on'?'1':'0');
 return res.redirect(303,'/admin/e-invoicing');
});

app.get('/admin/bundles',requireManager,async(req,res)=>{
 const rules=normalizeBundleRules(await getSetting('bundle_rules_json','[]'));
 render(res,'admin/bundles',{rules,enabled:(await getSetting('feature_bundle_enabled','0'))==='1',error:null,saved:req.query.saved==='1'});
});
app.post('/admin/bundles',requireManager,verifyCsrf,async(req,res)=>{
 const raw={productIds:[parseCartProductId(req.body.productIdA),parseCartProductId(req.body.productIdB)],discountPercent:parseCartQuantity(req.body.discountPercent),active:true};
 const enabled=req.body.enabled==='on';
 const empty=[req.body.productIdA,req.body.productIdB,req.body.discountPercent].every(v=>String(v??'').trim()==='');
 const validated=empty?[]:normalizeBundleRules([raw]);
 try {
  if(!empty&&validated.length!==1)throw new Error('BAD_RULE');
  if(validated.length){
   const [a,b]=await Promise.all(validated[0].productIds.map(id=>getProductById(id)));
   if(!a||!b||!a.active||!b.active)throw new Error('PRODUCT_NOT_ACTIVE');
  }
  await setSettings([['bundle_rules_json',JSON.stringify(validated)],['feature_bundle_enabled',enabled?'1':'0']]);
  await safeAudit(req.user.id,'bundle_rules_updated','store',null,{count:validated.length,enabled});
  return res.redirect(303,'/admin/bundles?saved=1');
 }catch(error){return res.status(400).render('admin/bundles',{rules:validated,enabled,error:'Enter two different, active product IDs and a percentage from 1 to 50. Only one non-stacking bundle is supported by this manager form.',saved:false});}
});

app.get('/admin/gift-cards',requireManager,async(req,res)=>render(res,'admin/gift-cards',{cards:await listGiftCards(),createdCode:null,error:null,refunded:req.query.refunded==='1',enabled:(await getSetting('feature_gift_cards_enabled','0'))==='1'}));
app.post('/admin/gift-cards/toggle',requireManager,verifyCsrf,async(req,res)=>{
  const enabled=req.body.enabled==='on';
  await setSetting('feature_gift_cards_enabled',enabled?'1':'0');
  await safeAudit(req.user.id,'gift_cards_toggle','store',null,{enabled});
  return res.redirect(303,'/admin/gift-cards');
});
app.post('/admin/gift-cards/issue',requireManager,verifyCsrf,async(req,res)=>{
  const amount=moneyCents(req.body.amount,await getSetting('currency',DEFAULT_STORE_CURRENCY));
  const currency=await getSetting('currency',DEFAULT_STORE_CURRENCY);
  try{
    if(String(await getSetting('feature_gift_cards_enabled','0'))!=='1')throw new Error('DISABLED');
    const created=await issueGiftCard({amountCents:amount,currency,managerId:req.user.id});
    await safeAudit(req.user.id,'gift_card_issued','gift_card',created.id,{currency,amountCents:amount});
    return render(res,'admin/gift-cards',{cards:await listGiftCards(),createdCode:created.code,error:null,refunded:false,enabled:true});
  }catch(error){return res.status(400).render('admin/gift-cards',{cards:await listGiftCards(),createdCode:null,error:'Gift card not issued. Check the amount and currency.',refunded:false,enabled:(await getSetting('feature_gift_cards_enabled','0'))==='1'});}
});
app.post('/admin/gift-cards/refund',requireManager,verifyCsrf,async(req,res)=>{
  const orderId=validId(req.body.orderId)?Number(req.body.orderId):0;
  try{
    const result=await refundGiftCardOrderCredit({orderId,managerId:req.user.id,reason:cleanText(req.body.reason,200)});
    await safeAudit(req.user.id,'gift_card_refund','order',orderId,{refunded:result.refunded,alreadyRefunded:result.alreadyRefunded});
    return res.redirect(303,'/admin/gift-cards?refunded=1');
  }catch(error){return res.status(400).render('admin/gift-cards',{cards:await listGiftCards(),createdCode:null,error:'Refund refused: the order must be completed or cancelled, redeemed with a gift card, and the credit must not have been refunded before.',refunded:false,enabled:(await getSetting('feature_gift_cards_enabled','0'))==='1'});}
});

app.get('/admin/customers',requireManager,async(req,res)=>{
  const search=cleanText(req.query.search,120),pageSize=50,total=await countCustomers(search),page=boundedPage(req.query.page,total,pageSize),offset=(page-1)*pageSize;
  const customers=await listCustomers({limit:pageSize,offset,search});
  const registrationResult=['approved','unavailable','confirmation-required','invalid-password'].includes(req.query.registration)?req.query.registration:'';
  render(res,'admin/customers',{customers,search,page,total,registrationResult,hasNext:offset+Math.min(pageSize,total-offset)<total,hasPrev:page>1});
});
app.post('/admin/customers/:id/approve-registration',requireManager,verifyCsrf,async(req,res)=>{
  const userId=validId(req.params.id)?Number(req.params.id):null;
  const redirect=result=>res.redirect(303,`/admin/customers?registration=${result}`);
  if(!userId)return redirect('unavailable');
  if(req.body.identityConfirmed!=='yes')return redirect('confirmation-required');
  const password=typeof req.body.password==='string'?req.body.password:'';
  if(!isStrongEnoughPassword(password)||password!==req.body.confirmPassword)return redirect('invalid-password');
  try {
    const pending=await getRow("SELECT password_hash FROM users WHERE id=? AND role='customer' AND email_verification_required=1 AND email_verified_at IS NULL",[userId]);
    if(!pending)return redirect('unavailable');
    if(await verifyPassword(password,pending.password_hash))return redirect('invalid-password');
    const passwordHash=await hashPassword(password);
    const approved=await approveCustomerRegistration(userId,req.user.id,{passwordHash,expectedPendingPasswordHash:pending.password_hash});
    return redirect(approved?'approved':'unavailable');
  } catch(error) {
    logOperationalFailure('Customer registration approval',error);
    return redirect('unavailable');
  }
});
app.get('/admin/audit',requireManager,async(req,res)=>render(res,'admin/audit',{logs:await listAuditLogs()}));
app.get('/admin/gdpr',requireManager,async(req,res)=>render(res,'admin/gdpr',{privacyCopy:privacyActionCopy(res.locals.locale),logs:await listGdprAuditLogs(150),error:null,deleted:req.query.deleted==='1',minimized:req.query.minimized==='1',customerId:'',email:''}));
app.post('/admin/gdpr/export',requireManager,verifyCsrf,async(req,res)=>{
  const customerId=String(req.body.customerId??'').trim();
  const email=String(req.body.email??'').trim();
  try {
    if(Boolean(customerId)===Boolean(email)) throw new Error('GDPR_IDENTITY_REQUIRED');
    const data=await exportGdprCustomerData({customerId:customerId||null,email:email||''});
    const targetHash=crypto.createHash('sha256').update(String(data.identity.email).toLowerCase()).digest('hex').slice(0,16);
    await createAudit(req.user.id,'gdpr_customer_export','customer',data.user?String(data.user.id):`guest:${targetHash}`,{
      matched_by:customerId?'customer_id':'email',orders_exported:data.orders.length,sessions_exported:data.sessions.length,uploads_exported:data.uploads.length
    });
    const fileId=data.user?.id??`guest-${targetHash}`;
    return res.status(200).type('application/json').attachment(`customer-data-${fileId}-${Date.now()}.json`).send(JSON.stringify(data,null,2));
  } catch(error) {
    const privacyCopy=privacyActionCopy(res.locals.locale);
    const message=privacyCopy.errors[error?.message]||privacyCopy.errors.fallback;
    return res.status(error?.message==='GDPR_CUSTOMER_NOT_FOUND'?404:400).render('admin/gdpr',{privacyCopy,logs:await listGdprAuditLogs(150),error,deleted:false,customerId,email,notice:message});
  }
});
app.post('/admin/gdpr/delete',requireManager,verifyCsrf,async(req,res)=>{
  const customerId=String(req.body.customerId??'').trim();
  const email=String(req.body.email??'').trim();
  const confirmation=String(req.body.confirmation??'');
  try {
    if(Boolean(customerId)===Boolean(email)) throw new Error('GDPR_IDENTITY_REQUIRED');
    if(confirmation!=='DELETE') throw new Error('GDPR_CONFIRMATION_REQUIRED');
    const result=await deleteGdprCustomerData({customerId:customerId||null,email:email||''},{
      actorUserId:req.user.id,mode:String(req.body.privacyMode||'delete'),
      retentionAcknowledged:req.body.retentionAcknowledged==='on',retentionPolicyReference:String(req.body.retentionPolicyReference||'')
    });
    return res.redirect(303,result.mode==='minimize-retain-financial'?'/admin/gdpr?minimized=1':'/admin/gdpr?deleted=1');
  } catch(error) {
    const privacyCopy=privacyActionCopy(res.locals.locale);
    const message=privacyCopy.errors[error?.message]||privacyCopy.errors.fallback;
    return res.status(error?.message==='GDPR_CUSTOMER_NOT_FOUND'?404:400).render('admin/gdpr',{privacyCopy,logs:await listGdprAuditLogs(150),error,deleted:false,customerId,email,notice:message});
  }
});
app.get('/admin/license',requireManager,async(req,res)=>render(res,'admin/license',{licenseInfo}));
// Versioned, self-hosted appearance CSS. No inline styles are necessary and CSP stays strict.
app.get('/theme/shop.css',(req,res)=>{
  res.type('text/css; charset=utf-8').set('Cache-Control','private, no-store');
  return res.send(appearanceCss(res.locals.appearance));
});
app.get('/admin/appearance',requireManager,async(req,res)=>render(res,'admin/appearance',{saved:req.query.saved==='1'}));
app.post('/admin/appearance',requireManager,upload.single('shopLogo'),verifyCsrf,async(req,res)=>{
  const body=req.body||{};
  const appearance=res.locals.appearance;
  const primary=String(body.brandPrimary||'').trim();
  const accent=String(body.brandAccent||'').trim();
  const font=String(body.font||'').trim();
  const minimum=String(body.freeShippingMinimum??'0').trim();
  const minInt=Number(minimum);
  if(!validPrimary(primary)||safeHex(accent,'')!==accent.toUpperCase()||!allowedFonts.includes(font)||
    !/^(0|[1-9][0-9]{0,8})$/.test(minimum)||!Number.isSafeInteger(minInt)||minInt>100000000||
    (body.removeLogo==='1'&&req.file)){
    return res.status(400).render('admin/appearance',{saved:false,error:'Check the colour contrast, highlight, font and threshold. Choose upload OR remove logo, not both.'});
  }
  let logo=appearance.logo;
  if(req.file){
    try{
      logo=await safeImagePath(req.file.buffer,req.file.mimetype);
      if(!logo) throw new Error('INVALID_LOGO_IMAGE');
    }catch(error){
      logOperationalFailure('Store logo upload',error);
      return res.status(400).render('admin/appearance',{saved:false,error:'The logo upload failed. Use a valid PNG, JPG or WebP under 2 MiB, and check image storage.'});
    }
  } else if(body.removeLogo==='1') logo='';
  const values={appearance_brand_primary:primary.toUpperCase(),appearance_brand_accent:accent.toUpperCase(),appearance_font:font,
    appearance_logo:logo,appearance_free_shipping_minimum:String(minInt)};
  for(const key of Object.keys(APPEARANCE_SWITCHES)) values[`appearance_${key}`]=body[key]==='on'?'1':'0';
  try{
    await setSettings(Object.entries(values));
    for(const [key,value] of Object.entries(values))if(String(await getSetting(key,''))!==value)throw new Error('APPEARANCE_READBACK_MISMATCH');
  }catch(error){
    logOperationalFailure('Store appearance persistence',error);
    if(req.file&&logo&&logo!==appearance.logo)await deleteUploadedAsset(logo).catch(()=>{});
    return res.status(503).render('admin/appearance',{saved:false,error:'Design settings were not confirmed as saved. Please check database connectivity.'});
  }
  if(appearance.logo&&appearance.logo!==logo)await deleteUploadedAsset(appearance.logo).catch(error=>logOperationalFailure('Old logo cleanup',error));
  await safeAudit(req.user.id,'appearance_updated','store',null,{font,primary,featureNames:Object.keys(APPEARANCE_SWITCHES)});
  return res.redirect(303,'/admin/appearance?saved=1');
});
app.get('/admin/branding',requireManager,async(req,res)=>render(res,'admin/branding',{branding:await loadBrandingFormData(),saved:req.query.saved==='1'}));
app.post('/admin/branding',requireManager,upload.single('heroImage'),verifyCsrf,async(req,res)=>{
  const rawStoreName=String(req.body.storeName??'').trim();
  const storeName=cleanText(rawStoreName,100);
  const [oldHeroImage,oldHeroImageMode]=await Promise.all([
    getSetting('hero_image',''),
    getSetting('hero_image_mode','catalogue')
  ]);
  let uploadedHeroImage='';
  let uploadFailure='';
  if(req.file){
    try{
      uploadedHeroImage=await safeImagePath(req.file.buffer,req.file.mimetype)||'';
      if(!uploadedHeroImage) uploadFailure='Use a valid JPG, PNG or WebP image up to 2 MiB.';
    }catch(error){
      uploadFailure=error?.message==='IMAGE_STORAGE_QUOTA_REACHED'
        ? 'The image-storage limit has been reached. No new hero image was saved.'
        : error?.message==='IMAGE_STORAGE_NOT_CONFIGURED'
          ? 'Image storage is not configured. No new hero image was saved.'
          : 'The hero image could not be saved. Check the image file and storage configuration.';
      logOperationalFailure('Storefront hero image upload',error);
    }
  }
  const removeHeroImage=req.body.removeHeroImage==='1';
  const locales={};
  const limits={eyebrow:80,title:90,accent:90,description:500};
  let invalid=!rawStoreName||rawStoreName.length>100||Boolean(uploadFailure)||(removeHeroImage&&Boolean(req.file));
  for(const code of BRANDING_LOCALES){
    locales[code]={};
    for(const field of BRANDING_FIELDS){
      const raw=String(req.body[`hero${field[0].toUpperCase()}${field.slice(1)}_${code}`]??'').trim();
      if(!raw||raw.length>limits[field]) invalid=true;
      locales[code][field]=cleanText(raw,limits[field]);
    }
  }
  const heroImageMode=removeHeroImage?'catalogue':uploadedHeroImage?'custom':oldHeroImageMode==='custom'?'custom':'catalogue';
  // Do not keep legacy hero uploads as active presentation when the owner has not
  // explicitly chosen a custom hero in this release. The product image remains the default.
  const heroImage=heroImageMode==='custom'?(uploadedHeroImage||oldHeroImage):'';
  const submitted={storeName,locales,heroImage:oldHeroImageMode==='custom'?oldHeroImage:'',heroImageMode:oldHeroImageMode==='custom'?'custom':'catalogue'};
  if(invalid){
    if(uploadedHeroImage) await deleteUploadedAsset(uploadedHeroImage).catch(error=>logOperationalFailure('Uncommitted hero image cleanup',error));
    const error=uploadFailure||((removeHeroImage&&req.file)?'Choose either a new hero image or remove the current image, not both.':'Enter a store name and all four homepage text fields in English, Sorani, Arabic and Dutch. Keep each field within its character limit.');
    return res.status(400).render('admin/branding',{branding:await loadBrandingFormData(submitted),saved:false,error});
  }
  const entries=[['store_name',storeName],['hero_image',heroImage],['hero_image_mode',heroImageMode]];
  for(const code of BRANDING_LOCALES) for(const field of BRANDING_FIELDS) entries.push([`hero_${field}_${code}`,locales[code][field]]);
  try{
    await setSettings(entries);
    for(const [key,expectedValue] of entries){
      const persistedValue=await getSetting(key,null);
      if(String(persistedValue??'')!==String(expectedValue??'')) throw new Error('BRANDING_READBACK_MISMATCH');
    }
  }catch(error){
    logOperationalFailure('Storefront branding save/readback',error);
    if(uploadedHeroImage) await deleteUploadedAsset(uploadedHeroImage).catch(cleanupError=>logOperationalFailure('Uncommitted hero image cleanup',cleanupError));
    return res.status(503).render('admin/branding',{branding:await loadBrandingFormData(submitted),saved:false,error:'The storefront settings could not be verified after saving. Your entries are preserved; refresh and verify the database before retrying.'});
  }
  if(oldHeroImage&&oldHeroImage!==heroImage) await deleteUploadedAsset(oldHeroImage).catch(error=>logOperationalFailure('Old hero image cleanup',error));
  await safeAudit(req.user.id,'storefront_branding_updated','store',null,{storeName,locales:BRANDING_LOCALES,heroImageChanged:oldHeroImage!==heroImage});
  return res.redirect(303,'/admin/branding?saved=1');
});
app.get('/admin/settings',requireManager,async(req,res)=>{
  try {
    const data=await buildAdminSettingsData({saved:req.query.saved==='1',currencyChanged:req.query.currencyChanged==='1',deliveryCountriesWarning:req.query.deliveryCountriesWarning==='1',shippingRulesReset:req.query.shippingRulesReset==='1'});
    return render(res,'admin/settings',data);
  } catch(error) {
    logOperationalFailure('Store settings page load',error);
    return res.status(503).render('error',{
      title:'Store settings temporarily unavailable',
      message:'ShopEasy could not load the settings from the database. No settings were changed. Check the local server terminal for the diagnostic error and retry when the database is available.'
    });
  }
});
app.post('/admin/settings',requireManager,async(req,res)=>{
  // Keep a simple, bounded copy of submitted strings before any validation or
  // database access, so a failure during normalization can still return the form.
  const body=req.body||{};
  const draftText=(value,max)=>typeof value==='string'?value.slice(0,max):'';
  let currencyDraft=DEFAULT_STORE_CURRENCY;
  let policies={
    privacy:{en:draftText(body.privacyPolicy,12000),ckb:draftText(body.privacyPolicyCkb,12000),ar:draftText(body.privacyPolicyAr,12000),nl:draftText(body.privacyPolicyNl,12000),fr:draftText(body.privacyPolicyFr,12000)},
    terms:{en:draftText(body.termsPolicy,12000),ckb:draftText(body.termsPolicyCkb,12000),ar:draftText(body.termsPolicyAr,12000),nl:draftText(body.termsPolicyNl,12000),fr:draftText(body.termsPolicyFr,12000)},
    shipping:{en:draftText(body.shippingPolicy,8000),ckb:draftText(body.shippingPolicyCkb,8000),ar:draftText(body.shippingPolicyAr,8000),nl:draftText(body.shippingPolicyNl,8000),fr:draftText(body.shippingPolicyFr,8000)},
    returns:{en:draftText(body.returnsPolicy,8000),ckb:draftText(body.returnsPolicyCkb,8000),ar:draftText(body.returnsPolicyAr,8000),nl:draftText(body.returnsPolicyNl,8000),fr:draftText(body.returnsPolicyFr,8000)}
  };
  let failureStage='normalize-submitted-form';
  let submitted={
    storeName:storeNameFallback,
    uiDefaultLocale:getDefaultUiLocale(process.env.DEFAULT_LOCALE),
    uiEnabledLocales:[...SUPPORTED_UI_LOCALES],
    currency:draftText(body.currency,3).toUpperCase()||DEFAULT_STORE_CURRENCY,
    legalName:draftText(body.legalName,160),
    businessAddress:draftText(body.businessAddress,500),
    supportEmail:draftText(body.supportEmail,160),
    businessPhone:draftText(body.businessPhone,40),
    enterpriseNumber:draftText(body.enterpriseNumber,80),
    vatNumber:draftText(body.vatNumber,80),
    shippingFeeCents:0,
    deliveryCountries:draftText(body.deliveryCountries,5000),
    shippingZoneRules:draftText(body.shippingZoneRules,25000),
    taxRules:draftText(body.taxRules,25000),
    pricesIncludeTax:body.pricesIncludeTax==='on',
    aiEnabled:body.aiEnabled==='on',
    ...(body.optionalFeaturesSubmitted==='1'?{featureStoriesEnabled:body.featureStoriesEnabled==='on',featureWishlistEnabled:body.featureWishlistEnabled==='on',featureAutocompleteEnabled:body.featureAutocompleteEnabled==='on',featureRelatedProductsEnabled:body.featureRelatedProductsEnabled==='on'}:{}),
    marketSetupMode:draftText(body.marketSetupMode,40),
    paymentMode:normalizePaymentMode(body.paymentMode),
    paymentProvider:normalizePaymentProvider(body.paymentProvider),
    paymentMerchantCountry:draftText(body.paymentMerchantCountry,2).toUpperCase(),
    bankContactName:draftText(body.bankContactName,120),
    bankContactEmail:draftText(body.bankContactEmail,160).toLowerCase(),
    bankContactPhone:draftText(body.bankContactPhone,40),
    bankContactReference:draftText(body.bankContactReference,120),
    bankTransferEnabled:body.bankTransferEnabled==='on',
    bankTransferBankName:draftText(body.bankTransferBankName,100),
    bankTransferAccountHolder:draftText(body.bankTransferAccountHolder,120),
    bankTransferAccount:draftText(body.bankTransferAccount,40),
    bankTransferBic:draftText(body.bankTransferBic,11),
    bankTransferInstructions:draftText(body.bankTransferInstructions,500),
    policies,
    storeReady:false,
    saved:false
  };
  try {
    currencyDraft=cleanText(body.currency,3).toUpperCase()||DEFAULT_STORE_CURRENCY;
    policies={
      privacy:{en:cleanText(body.privacyPolicy,12000),ckb:cleanText(body.privacyPolicyCkb,12000),ar:cleanText(body.privacyPolicyAr,12000),nl:cleanText(body.privacyPolicyNl,12000),fr:cleanText(body.privacyPolicyFr,12000)},
      terms:{en:cleanText(body.termsPolicy,12000),ckb:cleanText(body.termsPolicyCkb,12000),ar:cleanText(body.termsPolicyAr,12000),nl:cleanText(body.termsPolicyNl,12000),fr:cleanText(body.termsPolicyFr,12000)},
      shipping:{en:cleanText(body.shippingPolicy,8000),ckb:cleanText(body.shippingPolicyCkb,8000),ar:cleanText(body.shippingPolicyAr,8000),nl:cleanText(body.shippingPolicyNl,8000),fr:cleanText(body.shippingPolicyFr,8000)},
      returns:{en:cleanText(body.returnsPolicy,8000),ckb:cleanText(body.returnsPolicyCkb,8000),ar:cleanText(body.returnsPolicyAr,8000),nl:cleanText(body.returnsPolicyNl,8000),fr:cleanText(body.returnsPolicyFr,8000)}
    };
    submitted={...submitted,currency:isValidCurrency(currencyDraft)?currencyDraft:DEFAULT_STORE_CURRENCY,
      legalName:cleanText(body.legalName,160),businessAddress:cleanText(body.businessAddress,500),
      supportEmail:cleanText(body.supportEmail,160).toLowerCase(),businessPhone:cleanText(body.businessPhone,40),
      enterpriseNumber:cleanText(body.enterpriseNumber,80),vatNumber:cleanText(body.vatNumber,80),
      shippingFeeCents:moneyCents(body.shippingFee||'0',currencyDraft)??0,
      deliveryCountries:cleanText(body.deliveryCountries,5000),
      shippingZoneRules:normalizeCommerceRuleText(body.shippingZoneRules).slice(0,25000),
      taxRules:normalizeCommerceRuleText(body.taxRules).slice(0,25000),
      pricesIncludeTax:body.pricesIncludeTax==='on',
      aiEnabled:body.aiEnabled==='on',marketSetupMode:normalizeMarketSetupMode(body.marketSetupMode),
      paymentMode:normalizePaymentMode(body.paymentMode),paymentProvider:normalizePaymentProvider(body.paymentProvider),
      paymentMerchantCountry:draftText(body.paymentMerchantCountry,2).toUpperCase(),
      bankContactName:cleanText(body.bankContactName,120),bankContactEmail:cleanText(body.bankContactEmail,160).toLowerCase(),
      bankContactPhone:cleanText(body.bankContactPhone,40),bankContactReference:cleanText(body.bankContactReference,120),
      bankTransferEnabled:body.bankTransferEnabled==='on',bankTransferBankName:cleanText(body.bankTransferBankName,100),
      bankTransferAccountHolder:cleanText(body.bankTransferAccountHolder,120),bankTransferAccount:cleanText(body.bankTransferAccount,40),
      bankTransferBic:cleanText(body.bankTransferBic,11),bankTransferInstructions:cleanText(body.bankTransferInstructions,500),policies};
    // Settings are editable configuration, not the launch gate. A manager must be
    // able to save a draft (for example legal details first) and return later to
    // complete delivery, tax and policy requirements. The storefront remains
    // blocked from checkout until storeLaunchConfig() reports ready.
    failureStage='read-current-settings';
    const storeName=await getSetting('store_name',storeNameFallback);
    const aiToggle=body.aiEnabled==='on';
    const optionalFeatureEntries=body.optionalFeaturesSubmitted==='1'
      ? {feature_stories_enabled:body.featureStoriesEnabled==='on'?'1':'0',feature_wishlist_enabled:body.featureWishlistEnabled==='on'?'1':'0',feature_autocomplete_enabled:body.featureAutocompleteEnabled==='on'?'1':'0',feature_related_products_enabled:body.featureRelatedProductsEnabled==='on'?'1':'0'}
      : {};
    if(body.optionalFeaturesSubmitted==='1') submitted={...submitted,featureStoriesEnabled:body.featureStoriesEnabled==='on',featureWishlistEnabled:body.featureWishlistEnabled==='on',featureAutocompleteEnabled:body.featureAutocompleteEnabled==='on',featureRelatedProductsEnabled:body.featureRelatedProductsEnabled==='on'};
    const pricesIncludeTax=body.pricesIncludeTax==='on';
    const marketSetupMode=normalizeMarketSetupMode(body.marketSetupMode);
    const [oldCurrencySetting,currentCurrencyReviewSetting,storedCountriesSetting,storedShippingFeeSetting,storedShippingZoneRulesSetting,storedTaxRulesSetting,
      storedPaymentMode,storedPaymentProvider,storedPaymentMerchantCountry,storedBankContactName,storedBankContactEmail,storedBankContactPhone,storedBankContactReference,storedUiDefaultLocale,storedUiEnabledLocales]=await Promise.all([
      getSetting('currency',DEFAULT_STORE_CURRENCY),
      getSetting('currency_price_review_required','0'),
      getSetting('delivery_countries',''),
      getSetting('shipping_fee_cents','0'),
      getSetting('shipping_zone_rules',''),
      getSetting('tax_rules',''),
      getSetting('payment_mode',PAYMENT_MODES.CASH_ON_DELIVERY),
      getSetting('payment_provider','none'),
      getSetting('payment_merchant_country',''),
      getSetting('bank_contact_name',''),
      getSetting('bank_contact_email',''),
      getSetting('bank_contact_phone',''),
      getSetting('bank_contact_reference',''),
      getSetting('ui_default_locale',getDefaultUiLocale(process.env.DEFAULT_LOCALE)),
      getSetting('ui_enabled_locales',JSON.stringify(SUPPORTED_UI_LOCALES))
    ]);
    const [storedBankTransferEnabled,storedBankTransferBankName,storedBankTransferAccountHolder,storedBankTransferAccount,storedBankTransferBic,storedBankTransferInstructions]=await Promise.all([
      getSetting('bank_transfer_enabled','0'),getSetting('bank_transfer_bank_name',''),getSetting('bank_transfer_account_holder',''),
      getSetting('bank_transfer_account',''),getSetting('bank_transfer_bic',''),getSetting('bank_transfer_instructions','')
    ]);
    const storedLanguagePreferences=getUiLanguagePreferences(storedUiDefaultLocale,storedUiEnabledLocales,process.env.DEFAULT_LOCALE);
    const languageSettingsSubmitted=body.uiLanguagesSubmitted==='1';
    const uiEnabledLocales=languageSettingsSubmitted?normalizeUiLocalesForForm(Array.isArray(body.enabledUiLocales)?body.enabledUiLocales:(body.enabledUiLocales?[body.enabledUiLocales]:[])):storedLanguagePreferences.enabledLocales;
    const uiDefaultLocale=languageSettingsSubmitted?String(body.uiDefaultLocale||'').trim().toLowerCase():storedLanguagePreferences.defaultLocale;
    const uiLanguagesValid=uiEnabledLocales.length>0&&SUPPORTED_UI_LOCALES.includes(uiDefaultLocale)&&uiEnabledLocales.includes(uiDefaultLocale)&&(!languageSettingsSubmitted||uiEnabledLocales.every(code=>SUPPORTED_UI_LOCALES.includes(code)));
    submitted={...submitted,uiDefaultLocale:SUPPORTED_UI_LOCALES.includes(uiDefaultLocale)?uiDefaultLocale:storedLanguagePreferences.defaultLocale,uiEnabledLocales};
    // Preserve settings omitted by an older tab or stale client. Explicit empty
    // contact fields can be cleared; no stale form can reset unrelated settings.
    const useSettingString=(key,stored,max)=>Object.prototype.hasOwnProperty.call(body,key)
      ? (typeof body[key]==='string'?cleanText(body[key],max):'__INVALID_FIELD__')
      : String(stored??'');
    const paymentModeInput=useSettingString('paymentMode',storedPaymentMode,40);
    const paymentProviderInput=useSettingString('paymentProvider',storedPaymentProvider,40);
    const paymentMerchantCountryInput=useSettingString('paymentMerchantCountry',storedPaymentMerchantCountry,2).toUpperCase();
    const bankContactName=useSettingString('bankContactName',storedBankContactName,120);
    const bankContactEmail=useSettingString('bankContactEmail',storedBankContactEmail,160).toLowerCase();
    const bankContactPhone=useSettingString('bankContactPhone',storedBankContactPhone,40);
    const bankContactReference=useSettingString('bankContactReference',storedBankContactReference,120);
    const bankTransferSettingsSubmitted=body.bankTransferSettingsSubmitted==='1';
    const bankTransferEnabled=bankTransferSettingsSubmitted?body.bankTransferEnabled==='on':storedBankTransferEnabled==='1';
    const bankTransferBankName=useSettingString('bankTransferBankName',storedBankTransferBankName,100);
    const bankTransferAccountHolder=useSettingString('bankTransferAccountHolder',storedBankTransferAccountHolder,120);
    const bankTransferAccount=useSettingString('bankTransferAccount',storedBankTransferAccount,40);
    const bankTransferBic=useSettingString('bankTransferBic',storedBankTransferBic,11);
    const bankTransferInstructions=useSettingString('bankTransferInstructions',storedBankTransferInstructions,500);
    const bankTransferConfig=normalizeBankTransferConfig({enabled:bankTransferEnabled,bankName:bankTransferBankName,accountHolder:bankTransferAccountHolder,account:bankTransferAccount,bic:bankTransferBic,instructions:bankTransferInstructions});
    const bankTransferFieldTypesValid=[bankTransferBankName,bankTransferAccountHolder,bankTransferAccount,bankTransferBic,bankTransferInstructions].every(value=>value!=='__INVALID_FIELD__');
    const bankTransferConfigValid=bankTransferFieldTypesValid&&bankTransferConfig.valid;
    const validPaymentModes=new Set(Object.values(PAYMENT_MODES));
    const validPaymentProviders=new Set(PAYMENT_PROVIDER_IDS);
    const validMerchantCountry=paymentMerchantCountryInput===''||MERCHANT_COUNTRY_OPTIONS.some(item=>item.code===paymentMerchantCountryInput);
    const paymentModeValid=paymentModeInput!=='__INVALID_FIELD__'&&validPaymentModes.has(paymentModeInput);
    const paymentProviderValid=paymentProviderInput!=='__INVALID_FIELD__'&&validPaymentProviders.has(paymentProviderInput);
    const paymentMerchantCountryValid=paymentMerchantCountryInput!=='__INVALID_FIELD__'&&validMerchantCountry;
    const bankContactFieldTypesValid=[bankContactName,bankContactEmail,bankContactPhone,bankContactReference].every(value=>value!=='__INVALID_FIELD__');
    const bankContactEmailValid=bankContactEmail===''||/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(bankContactEmail);
    const bankContactPhoneValid=bankContactPhone===''||isValidPhone(bankContactPhone);
    const paymentMode=paymentModeValid?paymentModeInput:normalizePaymentMode(storedPaymentMode);
    const paymentProvider=paymentProviderValid?paymentProviderInput:normalizePaymentProvider(storedPaymentProvider);
    const paymentMerchantCountry=paymentMerchantCountryValid?paymentMerchantCountryInput:String(storedPaymentMerchantCountry||'').toUpperCase();
    const oldCurrency=String(oldCurrencySetting||DEFAULT_STORE_CURRENCY).toUpperCase();
    const currentCurrencyReviewRequired=currentCurrencyReviewSetting==='1';
    // Some browsers/older open tabs can omit a disabled or stale select from the
    // POST body. In that case retain the persisted currency rather than reporting
    // a false validation error when EUR (or another currency) is already selected.
    const currencyInput=resolveSettingsCurrency(body,oldCurrency,DEFAULT_STORE_CURRENCY);
    const requestedCurrency=currencyInput.value;
    let currency=requestedCurrency;
    let currencyChangeNeedsReview=false;
    let currencyChangeBlockedByOrders=false;
    let currencyProductsCount=0;
    let currencyCouponsCount=0;
    let currencyOrdersCount=0;
    const legalName=cleanText(body.legalName,160);
    const businessAddress=cleanText(body.businessAddress,500);
    const supportEmail=cleanText(body.supportEmail,160).toLowerCase();
    const businessPhone=cleanText(body.businessPhone,40);
    const enterpriseNumber=cleanText(body.enterpriseNumber,80);
    const vatNumber=cleanText(body.vatNumber,80);
    // Missing fields from older/stale form submissions preserve existing settings;
    // an explicitly empty countries field is allowed for a draft (checkout remains
    // blocked until at least one valid delivery country is configured).
    const countriesInput=resolveDeliveryCountries(body,storedCountriesSetting);
    const deliveryCountriesInput=countriesInput.value;
    const normalizedDeliveryCountries=countriesInput.normalized;
    const deliveryCountriesValid=countriesInput.valid;
    // Policy completeness belongs to the launch gate, not draft persistence.
    // Values are already normalized and bounded above, so even a partial draft may
    // be saved without making checkout ready or exposing that draft publicly.
    const policyVersionsValid=Object.entries(policies).every(([field,versions])=>
      Object.entries(versions).every(([locale,value])=>
        ['privacy','terms','shipping','returns'].includes(field) &&
        ['en','ckb','ar','nl','fr'].includes(locale) && typeof value==='string' &&
        value.length<=(field==='shipping'||field==='returns'?8000:12000)
      )
    );
    // A store can always save a draft. When changing currency, product/coupon presence
    // is allowed and those values are precision-rescaled; historic orders retain their
    // recorded currency. To keep the current single-currency aggregates mathematically
    // valid, an existing history must all match the requested target currency.
    failureStage='check-currency-change-guard';
    const orderCurrencyRows=await getRows('SELECT UPPER(currency) AS currency,COUNT(*) AS c FROM orders GROUP BY UPPER(currency) ORDER BY UPPER(currency)');
    const currencyOrderCurrencies=orderCurrencyRows.map(row=>({currency:String(row.currency||'').toUpperCase(),count:Number(row.c||0)})).filter(row=>row.currency&&row.count>0);
    currencyOrdersCount=currencyOrderCurrencies.reduce((sum,row)=>sum+row.count,0);
    currencyChangeBlockedByOrders=currencyOrdersCount>0&&currencyOrderCurrencies.some(row=>row.currency!==currency);
    if(isValidCurrency(currency)&&currency!==oldCurrency){
      const [productsCount,couponsCount]=await Promise.all([getRow('SELECT COUNT(*) AS c FROM products'),getRow(`SELECT COUNT(*) AS c FROM coupons WHERE ${CURRENCY_SENSITIVE_COUPON_WHERE}`)]);
      currencyProductsCount=Number(productsCount?.c||0);
      currencyCouponsCount=Number(couponsCount?.c||0);
      currencyChangeNeedsReview=currencyProductsCount>0||currencyCouponsCount>0;
    }
    // A currency change must not silently reinterpret the old delivery fee. The UI
    // resets it to zero; enforce the same rule server-side for no-JS clients and
    // crafted requests, then let the manager enter a fee in the new currency.
    const submittedShippingFee=readSettingsStringField(body,'shippingFee',formatMoneyInput(Number(storedShippingFeeSetting)||0,oldCurrency),80);
    const effectiveShippingFeeInput=currency!==oldCurrency?'0':(submittedShippingFee.value||'0');
    const shippingFeeCents=moneyCents(effectiveShippingFeeInput,currency);
    const supportEmailValid=!supportEmail||/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(supportEmail);
    const businessPhoneValid=!businessPhone||isValidPhone(businessPhone);
    const shippingFeeValid=shippingFeeCents!==null&&shippingFeeCents<=100000*currencyMinorUnitFactor(currency);
    // Textarea fields preserve line breaks: cleanText() collapses whitespace and would
    // corrupt one-rule-per-line pricing configuration. A currency change invalidates
    // delivery fee amounts, so regional delivery overrides are intentionally reset.
    const readRuleTextarea=(key,stored)=>{
      if(!Object.prototype.hasOwnProperty.call(body,key)) return {value:normalizeCommerceRuleText(stored).slice(0,25000),valid:true,supplied:false};
      if(typeof body[key]!=='string') return {value:'',valid:false,supplied:true};
      const source=body[key];
      const raw=normalizeCommerceRuleText(source);
      return {value:raw.slice(0,25000),valid:source.length<=25000,supplied:true};
    };
    const submittedShippingRules=readRuleTextarea('shippingZoneRules',storedShippingZoneRulesSetting);
    const submittedTaxRules=readRuleTextarea('taxRules',storedTaxRulesSetting);
    const shippingZoneRulesText=currency!==oldCurrency?'':submittedShippingRules.value;
    const taxRulesText=submittedTaxRules.value;
    const effectiveDeliveryCountriesForRules=deliveryCountriesValid?normalizedDeliveryCountries:(normalizeDeliveryCountries(storedCountriesSetting)||[]);
    const shippingRulesValidation=parseShippingZoneRules(shippingZoneRulesText,currency,effectiveDeliveryCountriesForRules);
    const taxRulesValidation=parseTaxRules(taxRulesText,effectiveDeliveryCountriesForRules);
    const shippingRulesValid=submittedShippingRules.valid&&shippingRulesValidation.valid;
    const taxRulesValid=submittedTaxRules.valid&&taxRulesValidation.valid;
    submitted={...submitted,storeName,currency:isValidCurrency(currency)?currency:submitted.currency,legalName,businessAddress,supportEmail,businessPhone,enterpriseNumber,vatNumber,shippingFeeCents:shippingFeeCents??0,deliveryCountries:deliveryCountriesInput,shippingZoneRules:shippingZoneRulesText,taxRules:taxRulesText,pricesIncludeTax,aiEnabled:aiToggle,marketSetupMode,
      paymentMode,paymentProvider,paymentMerchantCountry,bankContactName,bankContactEmail,bankContactPhone,bankContactReference,
      bankTransferEnabled,bankTransferBankName,bankTransferAccountHolder,bankTransferAccount,bankTransferBic,bankTransferInstructions,bankTransferReady:bankTransferConfig.ready,
      policies,storeReady:false,saved:false,currencyChangeNeedsReview,currencyChangeBlockedByOrders,currencyOrderCount:currencyOrdersCount,currencyOrderCurrencies,currencyPriceReviewRequired:currentCurrencyReviewRequired,confirmCurrencyPriceReview:body.confirmCurrencyPriceReview==='on'};
    const inputIsValid=Boolean(
      currencyInput.valid&&isValidCurrency(currency)&&uiLanguagesValid&&supportEmailValid&&businessPhoneValid&&shippingFeeValid&&
      paymentModeValid&&paymentProviderValid&&paymentMerchantCountryValid&&bankContactFieldTypesValid&&bankContactEmailValid&&bankContactPhoneValid&&bankTransferConfigValid&&
      submittedShippingFee.valid&&submittedShippingRules.valid&&submittedTaxRules.valid&&shippingRulesValid&&taxRulesValid&&policyVersionsValid&&!(currency!==oldCurrency&&currencyChangeBlockedByOrders)
    );
    if(!inputIsValid){
      failureStage='render-validation-feedback';
      const invalidFields=[];
      if(!currencyInput.valid||!isValidCurrency(currency)) invalidFields.push('store currency');
      if(!uiLanguagesValid) invalidFields.push('interface languages (enable at least one language and select a default that is enabled)');
      if(currency!==oldCurrency&&currencyChangeBlockedByOrders) invalidFields.push('store currency (the selected currency must match every historical order; mixed-currency history is not supported)');
      if(!supportEmailValid) invalidFields.push('support email');
      if(!businessPhoneValid) invalidFields.push('business phone (use 7–20 digits and only +, spaces, brackets or dashes)');
      if(!paymentModeValid) invalidFields.push('payment mode');
      if(!paymentProviderValid) invalidFields.push('payment provider');
      if(!paymentMerchantCountryValid) invalidFields.push('legal merchant country');
      if(!bankContactFieldTypesValid) invalidFields.push('bank/payment-provider contact fields');
      if(!bankContactEmailValid) invalidFields.push('bank/payment-provider contact email');
      if(!bankContactPhoneValid) invalidFields.push('bank/payment-provider contact phone');
      if(!bankTransferConfigValid|| (bankTransferEnabled&&!bankTransferConfig.ready)) invalidFields.push('bank transfer details (enable only after bank name, account holder and a valid IBAN/account number are entered; BIC is optional)');
      if(!shippingFeeValid||!submittedShippingFee.valid) invalidFields.push('delivery fee (use the selected currency’s decimal precision)');
      if(!deliveryCountriesValid) invalidFields.push('delivery countries (use valid country names, one per line; maximum 250; invalid list will not replace the saved list)');
      if(!shippingRulesValid) invalidFields.push(`regional delivery rules (${shippingRulesValidation.errors.join('; ')||'textarea exceeds 25,000 characters'})`);
      if(!taxRulesValid) invalidFields.push(`regional tax rules (${taxRulesValidation.errors.join('; ')||'textarea exceeds 25,000 characters'})`);
      if(!policyVersionsValid) invalidFields.push('policy text length or field values');
      const validationMessage=currency!==oldCurrency&&currencyChangeBlockedByOrders
        ? 'Store currency was not changed because the selected currency does not match every historical order. Sales, customer and profit reports currently assume one currency. Choose the currency used by every existing order; your order totals will not be converted.'
        : `Please check: ${invalidFields.join(', ')||'the submitted settings'}. Incomplete business details, missing products, and missing delivery countries may be saved as a draft; launch requirements block checkout, not saving.`;
      const data=await buildAdminSettingsData({...submitted,storeReady:false,error:validationMessage,validationErrors:invalidFields});
      return res.status(400).render('admin/settings',data);
    }
    const effectiveDeliveryCountries=deliveryCountriesValid?normalizedDeliveryCountries:(normalizeDeliveryCountries(storedCountriesSetting)||[]);
    const entries={...optionalFeatureEntries,ai_enabled:aiToggle?'1':'0',market_setup_mode:marketSetupMode,ui_default_locale:uiDefaultLocale,ui_enabled_locales:JSON.stringify(uiEnabledLocales),currency,legal_name:legalName,business_address:businessAddress,support_email:supportEmail,business_phone:businessPhone,enterprise_number:enterpriseNumber,vat_number:vatNumber,shipping_fee_cents:String(shippingFeeCents),delivery_countries:effectiveDeliveryCountries.join('\n'),shipping_zone_rules:shippingZoneRulesText,tax_rules:taxRulesText,prices_include_tax:pricesIncludeTax?'1':'0',
      payment_mode:paymentMode,payment_provider:paymentProvider,payment_merchant_country:paymentMerchantCountry,
      bank_contact_name:bankContactName,bank_contact_email:bankContactEmail,bank_contact_phone:bankContactPhone,bank_contact_reference:bankContactReference,
      bank_transfer_enabled:bankTransferEnabled&&bankTransferConfig.ready?'1':'0',bank_transfer_bank_name:bankTransferConfig.bankName,
      bank_transfer_account_holder:bankTransferConfig.accountHolder,bank_transfer_account:bankTransferConfig.account,
      bank_transfer_bic:bankTransferConfig.bic,bank_transfer_instructions:bankTransferConfig.instructions};
    for(const [field,baseKey] of Object.entries(POLICY_FIELDS)){
      entries[baseKey]=policies[field].en;
      entries[`${baseKey}_ckb`]=policies[field].ckb;
      entries[`${baseKey}_ar`]=policies[field].ar;
      entries[`${baseKey}_nl`]=policies[field].nl;
      entries[`${baseKey}_fr`]=policies[field].fr;
    }
    const currencyChangedWithAmounts=currency!==oldCurrency&&(currencyProductsCount>0||currencyCouponsCount>0);
    // Any re-denominated product/coupon money must be manually reviewed before
    // checkout can reopen. Existing order snapshots remain untouched.
    entries.currency_price_review_required=currencyChangedWithAmounts?'1':(body.confirmCurrencyPriceReview==='on'?'0':(currentCurrencyReviewRequired?'1':'0'));
    const settingsEntries=Object.entries(entries);
    failureStage='write-settings-batch';
    await saveStoreSettingsWithCurrency(settingsEntries,{
      oldCurrency,
      newCurrency:currency,
      // A currency selection is an explicit manager action. Do not make Save fail
      // just because catalog data exists: rescale precision atomically and keep
      // checkout disabled until the mandatory post-change price review is done.
      allowAmountRescale:true
    });
    // A successful database call is not enough feedback for a form that has had
    // repeated Save regressions. Read every submitted setting back from the primary
    // adapter after commit; only show the success redirect if the persisted values
    // match what the manager submitted (including the guarded currency-review flag).
    failureStage='verify-settings-readback';
    for(const [key,expectedValue] of settingsEntries){
      const persistedValue=await getSetting(key,null);
      if(String(persistedValue??'')!==String(expectedValue??'')){
        throw new Error('SETTINGS_READBACK_MISMATCH');
      }
    }
    failureStage='write-audit-event';
    await safeAudit(req.user.id,'settings_updated','store',null,{storeName,currency,aiEnabled:aiToggle,paymentMode,paymentProvider,paymentMerchantCountry,deliveryCountryCount:effectiveDeliveryCountries.length,shippingRuleCount:shippingRulesValidation.rules.length,taxRuleCount:taxRulesValidation.rules.length,policyLocales:['en','ckb','ar','nl','fr'],uiDefaultLocale,uiEnabledLocales,currencyAmountReviewRequired:currencyChangedWithAmounts,currencyOrdersPreserved:currencyOrdersCount, currencyProductsRescaled:currencyProductsCount, currencyCouponsRescaled:currencyCouponsCount});
    return res.redirect(303,`/admin/settings?saved=1${currencyChangedWithAmounts?'&currencyChanged=1':''}${deliveryCountriesValid?'':'&deliveryCountriesWarning=1'}${currency!==oldCurrency&&String(storedShippingZoneRulesSetting||'').trim()?'&shippingRulesReset=1':''}`);
  } catch(error) {
    logOperationalFailure(`Store settings request failed at ${failureStage}`,error);
    const errorCode=String(error?.message||'');
    const currencyTransactionError=['CURRENCY_CONFIRM_REQUIRED','CURRENCY_CHANGED_CONCURRENTLY','CURRENCY_CHANGE_HAS_ORDERS','CURRENCY_SCALE_OVERFLOW','CURRENCY_SCALE_CONFLICT'].includes(errorCode);
    const errorMessage=errorCode==='CURRENCY_CHANGE_HAS_ORDERS'
      ? 'Store currency must match every historical order currency; historic totals are never converted.'
      : currencyTransactionError
        ? 'The currency change could not be safely completed. No settings from this submission were confirmed as saved. Refresh Settings, review the affected prices/coupons and retry.'
        : failureStage==='write-settings-batch'
          ? 'Store settings could not be saved. No successful save was confirmed; your entered values are preserved on this page. Check the server terminal for the diagnostic error if it happens again.'
          : failureStage==='verify-settings-readback'
            ? 'The database did not return the settings just submitted, so ShopEasy cannot confirm they were saved. Your entered values are preserved on this page; check the server terminal and database connection before retrying.'
            : 'ShopEasy could not complete this settings request. Your entered values are preserved on this page. Check the server terminal for the diagnostic error if it happens again.';
    try {
      const renderOverrides={...submitted,storeReady:false,saved:false,error:errorMessage};
      // A transaction can detect an order created after route preflight. In that
      // race, render the persisted currency/order lock, not the rejected selection.
      if(errorCode==='CURRENCY_CHANGE_HAS_ORDERS'){
        // Do not reuse the preflight order-history snapshot after a concurrent order
        // creates the transaction guard failure; reload both currency and breakdown.
        for(const key of ['currency','storedCurrency','currencyChangeBlockedByOrders','currencyOrderCurrencies','currencyOrderCount','currencyChangeNeedsReview','currencyPriceReviewRequired','confirmCurrencyPriceReview']) delete renderOverrides[key];
      }
      const data=await buildAdminSettingsData(renderOverrides);
      return res.status(currencyTransactionError?409:503).render('admin/settings',{...data,...renderOverrides,storeReady:false,saved:false,error:errorMessage});
    } catch(recoveryError) {
      logOperationalFailure(`Settings recovery form failed after ${failureStage}`,recoveryError);
      return res.status(503).render('error',{
        title:'Store settings temporarily unavailable',
        message:'The settings form could not be reloaded, so no successful save was confirmed. Check the server terminal for the diagnostic error and retry when the database is available.'
      });
    }
  }
});

app.use((req,res)=>res.status(404).render('error',{title:'Page not found',message:'The page you requested does not exist.'}));
app.use((err,req,res,next)=>{
  // Body parser errors — 413 Payload Too Large (raised limits still allow a clean response).
  if(err?.type === 'entity.too.large' || err?.status === 413) {
    return res.status(413).render('error',{title:'Form too large',message:'Your submitted form is too large. Please shorten the policy texts and try again.'});
  }
  if(err?.type === 'entity.parse.failed') {
    return res.status(400).render('error',{title:'Invalid submission',message:'The form could not be read. Please try again.'});
  }
  if(err?.code==='LIMIT_FILE_SIZE')return res.status(400).render('error',{title:'File too large',message:'Images must be 2 MiB or smaller.'});
  if(err?.code==='LIMIT_UNEXPECTED_FILE')return res.status(400).render('error',{title:'Upload rejected',message:'Only one image may be uploaded.'});
  if(err?.message==='INVALID_IMAGE_TYPE')return res.status(400).render('error',{title:'Upload rejected',message:'Only JPG, PNG or WebP images are supported.'});
  if(err?.code==='LIMIT_FILE_COUNT')return res.status(400).render('error',{title:'Upload rejected',message:'Only one image may be uploaded.'});
  if(err?.message==='IMAGE_STORAGE_QUOTA_REACHED')return res.status(507).render('error',{title:'Image storage limit reached',message:'The image-storage safety limit has been reached. No new image was saved. Contact the store administrator before trying again.'});
  if(err?.message==='IMAGE_STORAGE_NOT_CONFIGURED')return res.status(503).render('error',{title:'Image storage unavailable',message:'Image storage is not configured. No new image was saved. Contact the store administrator.'});
  if (isCheckoutPost(req)) {
    const reference=req.shopEasyCheckoutDiagnosticId||`CKO-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
    const stage=String(req.shopEasyCheckoutDiagnosticStage||'unclassified-before-route').slice(0,100);
    const safeName=typeof err?.name==='string'&&/^[A-Za-z0-9_$-]{1,80}$/.test(err.name)?err.name:'Error';
    const safeCode=typeof err?.code==='string'&&/^[A-Za-z0-9_-]{1,64}$/.test(err.code)?err.code:undefined;
    const diagnostic={timestamp:new Date().toISOString(),reference,stage,method:'POST',path:'/checkout',name:safeName,...(safeCode?{code:safeCode}:{}),message:redactCheckoutDiagnosticText(err?.message||'No error message supplied'),stack:redactCheckoutDiagnosticText(err?.stack||'')};
    if (isProd) {
      console.error('[ShopEasy] Checkout request failed',JSON.stringify({reference,stage,name:safeName,...(safeCode?{code:safeCode}:{})}));
    } else {
      console.error(`[ShopEasy] Checkout diagnostic ${reference} failed at stage: ${stage}`,err);
      // Local-only, gitignored trace survives closing a PowerShell window. No form
      // body, address, phone, session ID, CSRF token or idempotency token is logged.
      fs.promises.mkdir(path.join(root,'data'),{recursive:true})
        .then(()=>fs.promises.appendFile(path.join(root,'data','checkout-diagnostics.log'),`${JSON.stringify(diagnostic)}\n`,'utf8'))
        .catch(logError=>console.error('[ShopEasy] Could not save local checkout diagnostic log:',logError?.code||logError?.name||'Error'));
    }
    req.shopEasyCheckoutDiagnosticId=reference;
  } else if (isProd) {
    // Record enough safe diagnostics to locate production failures without logging
    // raw SQL, request bodies, customer data, tokens or provider error messages.
    const safeCode = typeof err?.code === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(err.code) ? err.code : undefined;
    const safeName = typeof err?.name === 'string' && /^[A-Za-z0-9_$-]{1,80}$/.test(err.name) ? err.name : 'Error';
    const safeRoute = typeof req.route?.path === 'string' && req.route.path.length <= 160 ? req.route.path : 'unmatched';
    console.error('[ShopEasy] Unhandled request error', JSON.stringify({
      name: safeName,
      route: safeRoute,
      ...(safeCode ? { code: safeCode } : {}),
      status: Number.isInteger(err?.status) && err.status >= 400 && err.status <= 599 ? err.status : 500,
      method: String(req.method || 'UNKNOWN').slice(0, 12)
    }));
  } else console.error(`[ShopEasy] Unhandled ${String(req.method||'UNKNOWN')} ${String(req.path||'/')}`,err);
  for(const [key,value] of Object.entries({storeName:'ShopEasy',csrf:'',isLoggedIn:Boolean(req.user),user:req.user||null,wishlistCount:0,cartCount:0,supportEmail:'',businessPhone:'',enterpriseNumber:'',legalName:'',businessAddress:'',path:req.path||'/',isAdminRoute:req.path?.startsWith('/admin')||false,isCheckoutRoute:req.path?.startsWith('/checkout')||false})) if(res.locals[key]===undefined) res.locals[key]=value;
  // Keep unexpected settings failures out of the generic storefront error page.
  // This also catches failures thrown by earlier middleware before the POST route
  // can preserve the form values; only safe operational guidance is shown here.
  const settingsRequestPath=String(req.path||'').replace(/\/+$/,'');
  if(req.method==='POST'&&settingsRequestPath==='/admin/settings'){
    return res.status(503).render('error',{
      title:'Store settings temporarily unavailable',
      message:'ShopEasy could not complete the settings request. The save status could not be confirmed. Check the local server terminal for the diagnostic error, then reopen Settings and verify what was saved before retrying.'
    });
  }
  if(req.method==='GET'&&settingsRequestPath==='/admin/settings'){
    return res.status(503).render('error',{
      title:'Store settings temporarily unavailable',
      message:'ShopEasy could not load the settings. No change was requested. Check the local server terminal for the diagnostic error and retry when the database is available.'
    });
  }
  const requestPath=String(req.path||'/');
  const accountOrderMatch=requestPath.match(/^\/account\/order\/(\d+)\/cancel$/);
  const accountReturnMatch=requestPath.match(/^\/account\/order\/(\d+)\/returns$/);
  const orderIdFromPath=requestPath.match(/^\/account\/order\/(\d+)$/)?.[1];
  const guestReturnMatch=requestPath.match(/^\/order\/(\d+)\/return-request$/);
  if(req.method==='POST'&&requestPath==='/checkout') {
    return res.status(503).render('error',{title:'Order status needs checking',message:'ShopEasy could not confirm the final checkout response. Do not submit or pay again yet. Check your order status or contact the store so a duplicate order or payment is not created.',guidance:`Do not submit this checkout form again until you have checked the order status or asked the store to verify whether an order was created. Diagnostic reference: ${req.shopEasyCheckoutDiagnosticId||'not available'}. In local development, see data/checkout-diagnostics.log.`,actionUrl:'/order-lookup',actionLabel:'Check an existing order'});
  }
  if(req.method==='GET'&&requestPath==='/checkout/success') {
    const orderId=String(req.query.order||'');
    const safeOrderUrl=/^\d{1,12}$/.test(orderId)?`/checkout/success?order=${orderId}`:'/order-lookup';
    return res.status(503).render('error',{title:'Order status temporarily unavailable',message:'The order page could not load its latest status. Your order and payment were not changed by opening this page. Reopen the order status page; do not place a second order while the status is unavailable.',actionUrl:safeOrderUrl,actionLabel:'Check order status'});
  }
  if(req.method==='GET'&&requestPath==='/cart') {
    return res.status(503).render('error',{title:'Your bag is temporarily unavailable',message:'ShopEasy could not load the current bag. No checkout was started. Reopen your bag to verify its contents before continuing.',actionUrl:'/cart',actionLabel:'Reopen my bag'});
  }
  if(req.method==='GET'&&requestPath==='/checkout') {
    return res.status(503).render('error',{title:'Checkout temporarily unavailable',message:'ShopEasy could not prepare a fresh checkout. Your order has not been submitted by this page load. Reopen the bag and check the current items before trying checkout again.',actionUrl:'/cart',actionLabel:'Review my bag'});
  }
  if(accountOrderMatch||accountReturnMatch||req.method==='POST'&&requestPath==='/checkout/success/returns'||req.method==='POST'&&requestPath==='/checkout/success/cancel') {
    const id=accountOrderMatch?.[1]||accountReturnMatch?.[1]||String(req.body?.orderId||'');
    const url=/^\d{1,12}$/.test(id)?`/account/order/${id}`:'/order-lookup';
    return res.status(503).render('error',{title:'Order update not confirmed',message:'ShopEasy could not confirm whether this request was recorded. Check the current order status or contact the store before sending the request again.',actionUrl:url,actionLabel:'Review order status'});
  }
  if(req.method==='POST'&&requestPath==='/order-lookup') {
    return res.status(503).render('error',{title:'Order lookup temporarily unavailable',message:'ShopEasy could not check the order right now. Your order was not changed. Please reopen order lookup and try again.',actionUrl:'/order-lookup',actionLabel:'Reopen order lookup'});
  }
  if(req.method==='POST'&&guestReturnMatch) {
    return res.status(503).render('error',{title:'Return request not confirmed',message:'ShopEasy could not confirm whether the return request was recorded. Check with the store before submitting another request.',actionUrl:'/order-lookup',actionLabel:'Check order status'});
  }
  if(req.method==='GET'&&orderIdFromPath) {
    return res.status(503).render('error',{title:'Order details temporarily unavailable',message:'ShopEasy could not load the order details. No order change was requested. Open the order again when the database is available.',actionUrl:`/account/order/${orderIdFromPath}`,actionLabel:'Reopen order'});
  }
  return res.status(500).render('error',{title:'Something went wrong',message:'The request could not be completed. No automatic form submission was repeated. Please return to the relevant page and verify the current state before trying again.'});
});

async function bootstrapManager(){
  // Bootstrap a Manager only when no Manager already exists. This can safely add
  // a Manager to an older database that has a restricted Admin, but never promotes
  // or overwrites any existing account. Once the Manager exists, .env secrets are
  // ignored and credentials can be changed only from the authenticated Manager UI.
  const existingManager=await getRow("SELECT id FROM users WHERE role='manager' LIMIT 1");
  if(existingManager) return;
  const email=String(process.env.MANAGER_EMAIL||'').trim().toLowerCase();
  const password=process.env.MANAGER_PASSWORD;
  const fullName=cleanText(process.env.MANAGER_NAME||'Store Manager',120)||'Store Manager';
  if(!email||!/^\S+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>120||typeof password!=='string'||password.length<8||password.length>200){
    console.error('No Manager account exists. Configure MANAGER_NAME, MANAGER_EMAIL and a MANAGER_PASSWORD of 15–200 characters that is not common or repeated in .env, then restart ShopEasy. Existing Admin/customer accounts are never promoted automatically.');
    return;
  }
  const configured=await getUserAuthByEmail(email);
  if(configured){
    // Upgrade path from older releases: the former .env bootstrap account was an
    // Admin. It may become the Manager only when the explicitly configured Manager
    // email matches that account AND the supplied Manager password proves current
    // control. The stored password is never replaced by .env during this migration.
    if(configured.role==='admin' && await verifyPassword(password,configured.password_hash)) {
      const promoted=await promoteBootstrapAdminToManager(configured.id,fullName);
      if(promoted) {
        await safeAudit(null,'legacy_admin_promoted_to_manager','user',configured.id,{source:'verified-manager-bootstrap'});
        console.info('Verified legacy bootstrap Admin upgraded to Manager. The existing password was preserved; future credential changes belong in /admin/staff.');
        return;
      }
      const managerAfterPromotion=await getRow("SELECT id FROM users WHERE role='manager' LIMIT 1");
      if(managerAfterPromotion) return;
    }
    console.error('MANAGER_EMAIL already belongs to an account. A legacy Admin can be upgraded only when MANAGER_PASSWORD exactly matches that Admin account’s current password. ShopEasy will not reset the password or change another account role.');
    return;
  }
  // A legacy Admin promotion above proves its existing password without imposing
  // a new-password rule. Apply the stronger policy only to a new Manager account.
  if(!isStrongEnoughPassword(password)) {
    console.error('Initial Manager password rejected. Use 15–200 characters that are not common or repeated. No account was created.');
    return;
  }
  try {
    await createUser(email,await hashPassword(password),'manager',fullName,null);
    console.info('Initial Manager account created from MANAGER_* configuration. Future starts will not reset its credentials.');
  } catch(error) {
    // Simultaneous first serverless cold starts may race on the unique staff email.
    // Treat it as completed only if a Manager now exists; otherwise fail closed.
    const managerAfterRace=await getRow("SELECT id FROM users WHERE role='manager' LIMIT 1");
    if(managerAfterRace) return;
    throw error;
  }
}
await cleanupSessions();
if(isPostgresPreview) lastRequestMaintenanceAt=Date.now();
await bootstrapManager();
const port=Number(process.env.PORT||3000);
if (process.env.CLOUDFLARE_WORKER === '1') {
  // Required by Cloudflare's official Express httpServerHandler adapter.
  // Do not install intervals in Workers; maintenance is request-triggered above.
  app.listen(port);
} else if (process.env.NODE_ENV !== 'test' && !isPostgresPreview) {
  const server=app.listen(port,()=>{ if(process.env.NODE_ENV!=='production') console.info('ShopEasy local server started.'); });
  server.keepAliveTimeout=5000;
  server.headersTimeout=10000;
  server.requestTimeout=30000;
  const shutdown=()=>{ server.close(async()=>{ try{ await db.close(); } finally { process.exit(0); } }); };
  setInterval(()=>{ cleanupSessions().catch(error=>logOperationalFailure('Session cleanup',error)); },5*60*1000).unref();
  process.once('SIGTERM',shutdown);
  process.once('SIGINT',shutdown);
}

export default app;
