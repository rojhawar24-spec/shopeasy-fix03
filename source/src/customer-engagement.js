/** Optional, first-party engagement features.
 * Consent is a verified, single-purpose email action; no user address is disclosed
 * to anonymous browsers, third-party analytics, or public GET endpoints.
 */
import crypto from 'node:crypto';
import { getRow, getRows, run } from './database.js';

import { emailAddress, actionToken, tokenHash, validActionToken, sanitizeReview } from './engagement-validation.js';
export { emailAddress, validActionToken, sanitizeReview } from './engagement-validation.js';
const TOKEN_EXPIRY_MS = 48 * 60 * 60 * 1000;

export async function subscribeNewsletter(email) {
  const mailbox=emailAddress(email);if(!mailbox)throw new Error('INVALID_EMAIL');
  const token=actionToken(), now=Date.now();
  const result=await run(`INSERT INTO newsletter_subscriptions(email,status,confirmation_hash,confirmation_expires_ms,unsubscribe_hash,created_at)
    VALUES(?,'pending',?,?,?,datetime('now'))
    ON CONFLICT(email) DO UPDATE SET status='pending',confirmation_hash=excluded.confirmation_hash,
      confirmation_expires_ms=excluded.confirmation_expires_ms,unsubscribe_hash=excluded.unsubscribe_hash
    WHERE newsletter_subscriptions.status IN ('pending','unsubscribed')`,[mailbox,tokenHash(token),now+TOKEN_EXPIRY_MS,tokenHash(actionToken())]);
  return {send:result.changes===1,token};
}
export async function confirmNewsletter(token){
  if(!validActionToken(token))return false;
  const result=await run(`UPDATE newsletter_subscriptions SET status='active',confirmation_hash=NULL,confirmation_expires_ms=NULL
    WHERE status='pending' AND confirmation_hash=? AND confirmation_expires_ms>?`,[tokenHash(token),Date.now()]);
  return result.changes===1;
}
export async function unsubscribeNewsletter(token){
  if(!validActionToken(token))return false;
  const result=await run(`UPDATE newsletter_subscriptions SET status='unsubscribed',confirmation_hash=NULL,confirmation_expires_ms=NULL
    WHERE status='active' AND unsubscribe_hash=?`,[tokenHash(token)]);
  return result.changes===1;
}
// Visitors receive a single-click-ready unsubscribe URL with each owner-approved campaign.
// GET only shows confirmation; POST consumes the bearer token with CSRF protection.

export async function createStockAlert(productId,email){
  const mailbox=emailAddress(email), id=Number(productId);
  if(!mailbox||!Number.isSafeInteger(id)||id<=0)throw new Error('INVALID_ALERT');
  const token=actionToken();
  const result=await run(`INSERT INTO stock_alerts(product_id,email,status,confirmation_hash,confirmation_expires_ms,created_at)
     VALUES(?,?,'pending',?,?,datetime('now'))
     ON CONFLICT(product_id,email) DO UPDATE SET status='pending',confirmation_hash=excluded.confirmation_hash,
       confirmation_expires_ms=excluded.confirmation_expires_ms,notified_at=NULL
     WHERE stock_alerts.status IN ('pending','sent')`,[id,mailbox,tokenHash(token),Date.now()+TOKEN_EXPIRY_MS]);
  return {token,send:result.changes===1};
}
export async function confirmStockAlert(token){
  if(!validActionToken(token))return false;
  const result=await run(`UPDATE stock_alerts SET status='confirmed',confirmation_hash=NULL,confirmation_expires_ms=NULL
    WHERE status='pending' AND confirmation_hash=? AND confirmation_expires_ms>?`,[tokenHash(token),Date.now()]);
  return result.changes===1;
}
export async function claimStockAlerts(productId,limit=20){
  const id=Number(productId);if(!Number.isSafeInteger(id)||id<=0)return [];
  const stock=await getRow('SELECT id,slug,name,active,stock,reserved_stock FROM products WHERE id=?',[id]);
  if(!stock||Number(stock.active)!==1)return [];
  const available=await getRow('SELECT CASE WHEN EXISTS (SELECT 1 FROM product_variants WHERE product_id=? AND active=1) THEN (SELECT COALESCE(SUM(MAX(stock-reserved_stock,0)),0) FROM product_variants WHERE product_id=? AND active=1) ELSE MAX(?,0) END AS count',[id,id,Number(stock.stock)-Number(stock.reserved_stock)]);
  if(Number(available?.count||0)<=0)return [];
  const candidates=await getRows("SELECT id,email FROM stock_alerts WHERE product_id=? AND status='confirmed' ORDER BY id LIMIT ?",[id,Math.min(50,Math.max(1,limit))]);
  const claimed=[];
  for(const row of candidates){
    const changed=await run("UPDATE stock_alerts SET status='sending' WHERE id=? AND status='confirmed'",[row.id]);
    if(changed.changes===1)claimed.push({...row,slug:stock.slug,name:stock.name});
  }
  return claimed;
}
export async function finishStockAlert(id,delivered){
  return run(`UPDATE stock_alerts SET status=?,notified_at=CASE WHEN ?=1 THEN datetime('now') ELSE notified_at END
    WHERE id=? AND status='sending'`,[delivered?'sent':'confirmed',delivered?1:0,id]);
}

export async function userCanReview(userId,productId){
  const id=Number(userId),product=Number(productId);
  if(!Number.isSafeInteger(id)||!Number.isSafeInteger(product)||id<1||product<1)return false;
  const row=await getRow(`SELECT 1 AS eligible FROM orders o INNER JOIN order_items i ON i.order_id=o.id
   WHERE o.user_id=? AND i.product_id=? AND o.status='completed' LIMIT 1`,[id,product]);
  return !!row;
}
export async function submitVerifiedReview({userId,productId,rating,title,body}){
  const review=sanitizeReview({rating,title,body});
  if(!review||!await userCanReview(userId,productId))throw new Error('REVIEW_NOT_ELIGIBLE');
  return run(`INSERT INTO product_reviews(product_id,user_id,rating,title,body,status,created_at)
   VALUES(?,?,?,?,?,'pending',datetime('now'))
   ON CONFLICT(product_id,user_id) DO UPDATE SET rating=excluded.rating,title=excluded.title,body=excluded.body,
     status='pending',updated_at=datetime('now')`,[productId,userId,review.rating,review.title,review.body]);
}
export async function visibleReviews(productId){
  return getRows(`SELECT r.id,r.rating,r.title,r.body,r.created_at
    FROM product_reviews r
    WHERE r.product_id=? AND r.status='approved' ORDER BY r.created_at DESC,r.id DESC LIMIT 50`,[productId]);
}
export async function reviewSummary(productId){
  const row=await getRow(`SELECT COUNT(*) AS count,AVG(rating) AS average FROM product_reviews
     WHERE product_id=? AND status='approved'`,[productId]);
  return {count:Number(row?.count||0),average:Number(row?.average||0)};
}
export async function pendingReviews(){
  return getRows(`SELECT r.*,p.name AS product_name,u.email AS account_email FROM product_reviews r
    JOIN products p ON p.id=r.product_id JOIN users u ON u.id=r.user_id
    WHERE r.status='pending' ORDER BY r.created_at ASC LIMIT 100`);
}
export async function moderateReview(id,status){
  if(!Number.isSafeInteger(Number(id))||!['approved','rejected'].includes(status))return false;
  const result=await run("UPDATE product_reviews SET status=?,updated_at=datetime('now') WHERE id=? AND status='pending'",[status,Number(id)]);
  return result.changes===1;
}

// Newsletter campaigns are explicit Manager actions, never automatic bulk sends.
export function campaignUnsubscribeToken(email,secret=process.env.NEWSLETTER_UNSUBSCRIBE_SECRET){
  const mailbox=emailAddress(email);
  if(!mailbox || typeof secret!=='string'||secret.length<32)throw new Error('NEWSLETTER_SECRET_REQUIRED');
  return crypto.createHmac('sha256',secret).update(`shopeasy:newsletter:unsubscribe:v1:${mailbox}`).digest('base64url');
}
export async function createNewsletterCampaign({subject,body,userId}){
  const title=String(subject||'').trim(),message=String(body||'').trim();
  if(title.length<5||title.length>140||message.length<20||message.length>5000)throw new Error('NEWSLETTER_CONTENT_INVALID');
  const id=Number(userId);if(!Number.isSafeInteger(id)||id<1)throw new Error('NEWSLETTER_MANAGER_INVALID');
  return (await run('INSERT INTO newsletter_campaigns(subject,body,created_by) VALUES(?,?,?)',[title,message,id])).lastInsertRowid;
}
export async function listNewsletterCampaigns(){
  return getRows(`SELECT c.id,c.subject,c.body,c.created_at,
   (SELECT COUNT(*) FROM newsletter_deliveries d WHERE d.campaign_id=c.id AND d.status='sent') AS delivered
   FROM newsletter_campaigns c ORDER BY c.id DESC LIMIT 30`);
}
export async function newsletterSubscriberActive(email){
  const mailbox=emailAddress(email);if(!mailbox)return false;
  return !!(await getRow("SELECT 1 AS subscribed FROM newsletter_subscriptions WHERE email=? AND status='active'",[mailbox]));
}
export async function newsletterSubscriberCount(){
  return Number((await getRow("SELECT COUNT(*) AS n FROM newsletter_subscriptions WHERE status='active'"))?.n||0);
}
export async function claimNewsletterBatch(campaignId,limit=15){
  const id=Number(campaignId);
  if(!Number.isSafeInteger(id)||id<1)throw new Error('NEWSLETTER_CAMPAIGN_INVALID');
  const campaign=await getRow('SELECT id,subject,body FROM newsletter_campaigns WHERE id=?',[id]);
  if(!campaign)throw new Error('NEWSLETTER_CAMPAIGN_MISSING');
  const recipients=await getRows(`SELECT s.email FROM newsletter_subscriptions s
    LEFT JOIN newsletter_deliveries d ON d.campaign_id=? AND d.email=s.email
    WHERE s.status='active' AND (d.status IS NULL OR (d.status='failed' AND d.attempts<3))
    ORDER BY s.created_at,s.email LIMIT ?`,[id,Math.min(20,Math.max(1,limit))]);
  const claimed=[];
  for(const candidate of recipients){
    const previous=await getRow('SELECT status,attempts FROM newsletter_deliveries WHERE campaign_id=? AND email=?',[id,candidate.email]);
    let updated;
    if(previous){
      updated=await run("UPDATE newsletter_deliveries SET status='sending',attempts=attempts+1 WHERE campaign_id=? AND email=? AND status='failed' AND attempts<3",[id,candidate.email]);
    }else {
      updated=await run("INSERT INTO newsletter_deliveries(campaign_id,email,status,attempts) VALUES(?,?,'sending',1) ON CONFLICT(campaign_id,email) DO NOTHING",[id,candidate.email]);
    }
    if(updated.changes!==1)continue;
    // Token is derived only with a configured secret. The DB stores a hash, never the bearer token.
    const token=campaignUnsubscribeToken(candidate.email);
    await run("UPDATE newsletter_subscriptions SET unsubscribe_hash=? WHERE email=? AND status='active'",[tokenHash(token),candidate.email]);
    claimed.push({email:candidate.email,unsubscribeToken:token,...campaign});
  }
  return claimed;
}
export async function finishNewsletterDelivery(campaignId,email,delivered){
  return run(`UPDATE newsletter_deliveries SET status=?,sent_at=CASE WHEN ?=1 THEN datetime('now') ELSE NULL END
    WHERE campaign_id=? AND email=? AND status='sending'`,[delivered?'sent':'failed',delivered?1:0,campaignId,email]);
}
