// Public registration has the same outcome for new and existing addresses.
// An offline shop can approve a pending customer only after identity verification
// and replacement of the pending password through the Manager workflow.
const notices = {
  en: {
    email: 'If this email address can be used, check your inbox for the next steps. If you already have an account, you can sign in or reset your password.',
    offline: 'If this email address can be used, contact the store to verify your identity and privately agree a new password before signing in. If you already have an account, you can sign in.'
  },
  nl: {
    email: 'Als dit e-mailadres kan worden gebruikt, ontvang je de volgende stappen per e-mail. Heb je al een account, dan kun je inloggen of je wachtwoord herstellen.',
    offline: 'Als dit e-mailadres kan worden gebruikt, neem dan contact op met de winkel om je identiteit te bevestigen en privé een nieuw wachtwoord af te spreken voordat je inlogt. Heb je al een account, dan kun je inloggen.'
  },
  fr: {
    email: 'Si cette adresse e-mail peut être utilisée, consultez votre boîte de réception pour la suite. Si vous avez déjà un compte, vous pouvez vous connecter ou réinitialiser votre mot de passe.',
    offline: 'Si cette adresse e-mail peut être utilisée, contactez la boutique pour vérifier votre identité et convenir en privé d’un nouveau mot de passe avant de vous connecter. Si vous avez déjà un compte, vous pouvez vous connecter.'
  },
  ar: {
    email: 'إذا كان بالإمكان استخدام هذا البريد الإلكتروني، فستجد الخطوات التالية في بريدك. إذا كان لديك حساب بالفعل، يمكنك تسجيل الدخول أو إعادة تعيين كلمة المرور.',
    offline: 'إذا كان بالإمكان استخدام هذا البريد الإلكتروني، فاتصل بالمتجر للتحقق من هويتك والاتفاق على كلمة مرور جديدة بشكل خاص قبل تسجيل الدخول. إذا كان لديك حساب بالفعل، يمكنك تسجيل الدخول.'
  },
  ckb: {
    email: 'ئەگەر ئەم ئیمەیڵە بەکاربهێنرێت، هەنگاوەکانی دواتر لە سندوقی ئیمەیڵەکەت دەبینیت. ئەگەر هەژمارت هەیە، دەتوانیت بچیتە ژوورەوە یان وشەی نهێنی نوێ بکەیتەوە.',
    offline: 'ئەگەر ئەم ئیمەیڵە بەکاربهێنرێت، پەیوەندی بە فرۆشگاوە بکە بۆ پشتڕاستکردنەوەی ناسنامەت و ڕێککەوتن لەسەر وشەی نهێنییەکی نوێ بە نهێنی پێش چوونەژوورەوە. ئەگەر هەژمارت هەیە، دەتوانیت بچیتە ژوورەوە.'
  }
};

export function registrationNotice(locale='en', emailConfigured=false) {
  const language=String(locale||'en').toLowerCase().split('-')[0];
  return (notices[language]||notices.en)[emailConfigured?'email':'offline'];
}
