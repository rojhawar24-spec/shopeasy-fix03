// Pure, testable customer input and token validation (no database/network imports).
import crypto from 'node:crypto';
export const emailAddress = value => {
  const email=String(value??'').trim().toLowerCase();
  return email.length<=254 && /^[^\s<>@]{1,64}@[^\s<>@.]+(?:\.[^\s<>@.]+)+$/.test(email) ? email : '';
};
export const actionToken = () => crypto.randomBytes(32).toString('base64url');
export const tokenHash = token => crypto.createHash('sha256').update(String(token)).digest('hex');
export const validActionToken = token => /^[A-Za-z0-9_-]{43}$/.test(String(token??''));
export const sanitizeReview = ({rating,title,body}={}) => {
  const stars=Number(rating), heading=String(title||'').trim(), message=String(body||'').trim();
  if(!Number.isSafeInteger(stars)||stars<1||stars>5||heading.length<3||heading.length>100||message.length<15||message.length>2000) return null;
  return {rating:stars,title:heading,body:message};
};
