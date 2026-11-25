// Security-flow interface text. Seller-authored content is never translated here.
const copy = {
  en: {
    password: 'Use 15–200 characters. Avoid common or repeated passwords.',
    passwordError: 'Use a password with 15–200 characters that is not common or repeated.',
    passwordChangeError: 'Check your current password and use a new password with 15–200 characters that is not common or repeated.',
    lookupIntro: 'Enter your order number and checkout email. Sign in for an account order. For a guest order, use the checkout browser or your saved private access code.',
    lookupProtection: 'Order details require proof of access as well as matching order and email details.',
    guestAccess: 'Guest order access code (if saved)',
    guestHelp: 'Leave this blank when using the browser where you placed the guest order. Keep access codes private.',
    accessCode: 'Private order access code',
    saveCode: 'Keep this code private. Save it securely to open this guest order on another browser. Anyone with this code and your order details can access the order.'
  },
  ckb: {
    password: '١٥–٢٠٠ پیت بەکاربهێنە. وشەی نهێنیی باو یان دووبارەبووەوە بەکارمەهێنە.',
    passwordError: 'وشەی نهێنییەکی ١٥–٢٠٠ پیتی بەکاربهێنە کە باو یان دووبارەبووەوە نەبێت.',
    passwordChangeError: 'وشەی نهێنیی ئێستات بپشکنە و وشەیەکی نوێی ١٥–٢٠٠ پیتی بەکاربهێنە کە باو یان دووبارەبووەوە نەبێت.',
    lookupIntro: 'ژمارەی داواکاری و ئیمەیڵی کاتی کڕین بنووسە. بۆ داواکاریی هەژمارەکەت بچۆ ژوورەوە. بۆ داواکاریی میوان، وێبگەڕی کاتی کڕین یان کۆدی تایبەتیی پاشەکەوتکراوت بەکاربهێنە.',
    lookupProtection: 'بۆ بینینی وردەکارییەکان، جگە لە ژمارە و ئیمەیڵی دروست، پێویستە مافی دەستگەیشتن پشتڕاست بکرێتەوە.',
    guestAccess: 'کۆدی دەستگەیشتن بە داواکاریی میوان (ئەگەر پاشەکەوتت کردووە)',
    guestHelp: 'ئەگەر هەمان وێبگەڕی کاتی کڕین بەکاردەهێنیت، ئەمە بە بەتاڵی جێبهێڵە. کۆدەکە نهێنی بپارێزە.',
    accessCode: 'کۆدی تایبەتیی دەستگەیشتن بە داواکاری',
    saveCode: 'ئەم کۆدە نهێنی بپارێزە. بە سەلامەتی پاشەکەوتی بکە بۆ کردنەوەی داواکاریی میوان لە وێبگەڕێکی تر. هەر کەسێک ئەم کۆدە و وردەکاریی داواکارییەکەت هەبێت، دەتوانێت داواکارییەکە ببینێت.'
  },
  ar: {
    password: 'استخدم 15–200 حرفًا. تجنب كلمات المرور الشائعة أو المتكررة.',
    passwordError: 'استخدم كلمة مرور من 15–200 حرفًا غير شائعة أو متكررة.',
    passwordChangeError: 'تحقق من كلمة مرورك الحالية واستخدم كلمة جديدة من 15–200 حرفًا غير شائعة أو متكررة.',
    lookupIntro: 'أدخل رقم الطلب والبريد المستخدم عند الشراء. سجّل الدخول لطلب حسابك. لطلب ضيف، استخدم متصفح الشراء أو رمز الوصول الخاص المحفوظ.',
    lookupProtection: 'تتطلب تفاصيل الطلب إثبات الوصول إلى جانب تطابق رقم الطلب والبريد الإلكتروني.',
    guestAccess: 'رمز الوصول لطلب الضيف (إن كان محفوظًا)',
    guestHelp: 'اتركه فارغًا إذا كنت تستخدم المتصفح الذي أجريت منه طلب الضيف. حافظ على سرية الرموز.',
    accessCode: 'رمز الوصول الخاص بالطلب',
    saveCode: 'حافظ على سرية هذا الرمز واحفظه بأمان لفتح طلب الضيف في متصفح آخر. يمكن لمن لديه الرمز وتفاصيل طلبك الوصول إلى الطلب.'
  },
  nl: {
    password: 'Gebruik 15–200 tekens. Vermijd veelgebruikte of herhaalde wachtwoorden.',
    passwordError: 'Gebruik een wachtwoord van 15–200 tekens dat niet veelgebruikt of herhaald is.',
    passwordChangeError: 'Controleer je huidige wachtwoord en gebruik een nieuw wachtwoord van 15–200 tekens dat niet veelgebruikt of herhaald is.',
    lookupIntro: 'Vul je bestelnummer en het e-mailadres van de aankoop in. Log in voor een accountbestelling. Gebruik voor een gastbestelling de aankoopbrowser of je opgeslagen privétoegangscode.',
    lookupProtection: 'Bestelgegevens vereisen toegangscontrole naast een overeenkomend bestelnummer en e-mailadres.',
    guestAccess: 'Toegangscode voor gastbestelling (indien opgeslagen)',
    guestHelp: 'Laat dit leeg als je de browser gebruikt waarmee je als gast bestelde. Houd toegangscodes privé.',
    accessCode: 'Privétoegangscode voor bestelling',
    saveCode: 'Houd deze code privé. Bewaar hem veilig om de gastbestelling in een andere browser te openen. Iedereen met deze code en je bestelgegevens heeft toegang tot de bestelling.'
  },
  fr: {
    password: 'Utilisez 15 à 200 caractères. Évitez les mots de passe courants ou répétés.',
    passwordError: 'Utilisez un mot de passe de 15 à 200 caractères qui ne soit ni courant ni répété.',
    passwordChangeError: 'Vérifiez votre mot de passe actuel et choisissez un nouveau mot de passe de 15 à 200 caractères qui ne soit ni courant ni répété.',
    lookupIntro: 'Saisissez le numéro de commande et l’adresse e-mail utilisée lors de l’achat. Connectez-vous pour une commande de compte. Pour une commande invitée, utilisez le navigateur d’achat ou votre code d’accès privé enregistré.',
    lookupProtection: 'L’accès aux détails nécessite une preuve d’accès en plus du numéro de commande et de l’adresse e-mail correspondants.',
    guestAccess: 'Code d’accès de commande invitée (si enregistré)',
    guestHelp: 'Laissez ce champ vide si vous utilisez le navigateur de votre commande invitée. Gardez les codes confidentiels.',
    accessCode: 'Code d’accès privé à la commande',
    saveCode: 'Gardez ce code confidentiel et conservez-le en lieu sûr pour ouvrir cette commande invitée dans un autre navigateur. Toute personne disposant de ce code et des détails de votre commande peut y accéder.'
  }
};

const englishKeys=new Map(Object.entries(copy.en).map(([key,value])=>[value,key]));
export function authPolicyText(locale,value) {
  const key=englishKeys.get(value);
  return key ? (copy[locale]||copy.en)[key] : undefined;
}
