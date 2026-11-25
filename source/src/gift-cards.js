/** Gift cards are stored-value tender, never a price reduction. All balances use
 * integer currency-minor units; codes are cryptographically random and hashed.
 * This integration intentionally supports full-balance payment only, avoiding
 * mixed-tender captures/refunds which require a second reconciliation engine.
 */
import crypto from 'node:crypto';
export const giftCardHash = code => crypto.createHash('sha256').update(String(code||'').toUpperCase()).digest('hex');
export const generateGiftCardCode = () => 'SEGC-'+crypto.randomBytes(24).toString('hex').toUpperCase();
export const validGiftCardCode = code => /^SEGC-[A-F0-9]{48}$/.test(String(code||'').trim().toUpperCase());
export function giftCardCanCover(card,{amount,currency,now=Date.now()}={}) {
  const expires=card?.expires_at?Date.parse(card.expires_at):null;
  return Boolean(card && card.active===1 && String(card.currency).toUpperCase()===String(currency).toUpperCase() &&
    Number.isSafeInteger(amount)&&amount>0&&Number(card.balance_cents)>=amount &&
    (!card.expires_at || (Number.isFinite(expires)&&expires>now)));
}
