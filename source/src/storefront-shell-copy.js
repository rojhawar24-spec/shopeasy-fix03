// Canonical customer-shell labels. Badini (kmr-Arab) entries are draft preview copy, not a production language approval.
const languages=['en','nl','fr','ckb','ar','kmr'];
const rows=[
  [
    "Skip to content",
    "Naar inhoud",
    "Aller au contenu",
    "بڕۆ بۆ ناوەڕۆک",
    "انتقل إلى المحتوى",
    "بچۆ ناڤەڕۆکێ"
  ],
  [
    "Search products",
    "Zoek producten",
    "Rechercher des produits",
    "گەڕانی بەرهەم",
    "ابحث عن المنتجات",
    "ل بەرهەمان بگەڕێ"
  ],
  [
    "Search",
    "Zoeken",
    "Rechercher",
    "گەڕان",
    "بحث",
    "لێگەڕیان"
  ],
  [
    "What are you looking for?",
    "Wat zoek je?",
    "Que recherchez-vous ?",
    "بەدوای چیدا دەگەڕێیت؟",
    "عمّ تبحث؟",
    "ل چ تشتەکی دگەڕێی؟"
  ],
  [
    "Open search",
    "Zoekfunctie openen",
    "Ouvrir la recherche",
    "کردنەوەی گەڕان",
    "فتح البحث",
    "لێگەڕیانێ ڤەکە"
  ],
  [
    "Close search",
    "Zoekfunctie sluiten",
    "Fermer la recherche",
    "داخستنی گەڕان",
    "إغلاق البحث",
    "لێگەڕیانێ داخە"
  ],
  [
    "Open navigation",
    "Navigatie openen",
    "Ouvrir la navigation",
    "کردنەوەی ڕێنیشاندەر",
    "فتح قائمة التنقل",
    "لیستا گەڕانێ ڤەکە"
  ],
  [
    "Primary navigation",
    "Hoofdnavigatie",
    "Navigation principale",
    "ڕێنیشاندەری سەرەکی",
    "التنقل الرئيسي",
    "لیستا گەڕانا سەرەکی"
  ],
  [
    "Mobile navigation",
    "Mobiele navigatie",
    "Navigation mobile",
    "ڕێنیشاندەری مۆبایل",
    "التنقل على الهاتف",
    "لیستا گەڕانا موبایلێ"
  ],
  [
    "Choose language",
    "Kies een taal",
    "Choisir la langue",
    "زمان هەڵبژێرە",
    "اختر اللغة",
    "زمانێ خۆ هەلبژێرە"
  ],
  [
    "Change language",
    "Taal wijzigen",
    "Changer de langue",
    "گۆڕینی زمان",
    "تغيير اللغة",
    "زمانی بگوهۆڕە"
  ],
  [
    "Language",
    "Taal",
    "Langue",
    "زمان",
    "اللغة",
    "زمان"
  ],
  [
    "Apply",
    "Toepassen",
    "Appliquer",
    "جێبەجێکردن",
    "تطبيق",
    "جێبەجێ بکە"
  ],
  [
    "Store announcements",
    "Winkelmededelingen",
    "Annonces de la boutique",
    "ڕاگەیاندنەکانی فرۆشگا",
    "إعلانات المتجر",
    "راگەهاندنێن فرۆشگەهێ"
  ],
  [
    "Use dark mode",
    "Donkere modus gebruiken",
    "Activer le mode sombre",
    "دۆخی تاریک بەکاربهێنە",
    "استخدام الوضع الداكن",
    "دۆخێ تاری بکاربینە"
  ],
  [
    "Cash on delivery and card",
    "Contant bij levering of met kaart",
    "Paiement à la livraison ou par carte",
    "پارەدان لە کاتی گەیاندن یان بە کارت",
    "الدفع عند الاستلام أو بالبطاقة",
    "پارەدان ل دەمێ گەهاندنێ یان ب کارتێ"
  ],
  [
    "Cash on delivery",
    "Contant betalen bij levering",
    "Paiement à la livraison",
    "پارەدان لە کاتی گەیاندن",
    "الدفع نقدًا عند الاستلام",
    "پارەدان ل دەمێ گەهاندنێ"
  ],
  [
    "Bank transfer",
    "Bankoverschrijving",
    "Virement bancaire",
    "گواستنەوەی بانکی",
    "تحويل مصرفي",
    "ڤەگوهاستنا بانکی"
  ],
  [
    "Clear pricing",
    "Duidelijke prijzen",
    "Prix transparents",
    "نرخی ڕوون",
    "أسعار واضحة",
    "بهایێن دیار"
  ],
  [
    "Saved",
    "Opgeslagen",
    "Favoris",
    "دڵخوازەکان",
    "المفضلة",
    "لیستا دڵخوازان"
  ],
  [
    "Shop by category",
    "Shop per categorie",
    "Par catégorie",
    "بەپێی پۆل بگەڕێ",
    "تسوّق حسب الفئة",
    "ل دویڤ پۆلی بکڕە"
  ],
  [
    "View all",
    "Alles bekijken",
    "Tout voir",
    "هەمووی ببینە",
    "عرض الكل",
    "هەمییان ببینە"
  ],
  [
    "Browse categories",
    "Bekijk categorieën",
    "Parcourir les catégories",
    "بینینی پۆلەکان",
    "تصفح الفئات",
    "ل پۆلان بنێڕە"
  ],
  [
    "Search categories",
    "Zoek categorieën",
    "Rechercher des catégories",
    "گەڕانی پۆلەکان",
    "ابحث في الفئات",
    "ل پۆلان بگەڕێ"
  ],
  [
    "No categories found.",
    "Geen categorieën gevonden.",
    "Aucune catégorie trouvée.",
    "هیچ پۆلێک نەدۆزرایەوە.",
    "لم يتم العثور على فئات.",
    "چ پۆل نەهاتنە دیتن."
  ],
  [
    "Subcategories",
    "Subcategorieën",
    "Sous-catégories",
    "ژێرپۆلەکان",
    "الفئات الفرعية",
    "پۆلێن لاوەکی"
  ],
  [
    "Filters",
    "Filters",
    "Filtres",
    "پاڵاوتن",
    "الفلاتر",
    "فلتەر"
  ],
  [
    "Refine selection",
    "Verfijn je selectie",
    "Affiner la sélection",
    "پاڵاوتنی بەرهەم",
    "تصفية المنتجات",
    "هەلبژاردنا خۆ ورد بکە"
  ],
  [
    "Reset",
    "Wissen",
    "Effacer",
    "سڕینەوە",
    "مسح",
    "ژێببە"
  ],
  [
    "Close filters",
    "Filters sluiten",
    "Fermer les filtres",
    "داخستنی پاڵاوتن",
    "إغلاق الفلاتر",
    "فلتەران داخە"
  ],
  [
    "Price range",
    "Prijsbereik",
    "Fourchette de prix",
    "مەودای نرخ",
    "نطاق السعر",
    "مەودایا بها"
  ],
  [
    "Min",
    "Van",
    "Min.",
    "کەمترین",
    "الأدنى",
    "کێمترین"
  ],
  [
    "Max",
    "Tot",
    "Max.",
    "زۆرترین",
    "الأقصى",
    "زێدەترین"
  ],
  [
    "Show results",
    "Toon resultaten",
    "Voir les résultats",
    "ئەنجامەکان پیشان بدە",
    "عرض النتائج",
    "ئەنجامان نیشان بدە"
  ],
  [
    "In-stock products only",
    "Alleen producten op voorraad",
    "Uniquement les produits en stock",
    "تەنها بەرهەمە بەردەستەکان",
    "المنتجات المتوفرة فقط",
    "ب تنێ بەرهەمێن بەردەست"
  ],
  [
    "Active filters",
    "Actieve filters",
    "Filtres actifs",
    "پاڵاوتنە چالاکەکان",
    "الفلاتر النشطة",
    "فلتەرێن چالاک"
  ],
  [
    "Remove category:",
    "Categorie verwijderen:",
    "Supprimer la catégorie :",
    "سڕینەوەی پۆل:",
    "إزالة الفئة:",
    "پۆلێ ژێببە:"
  ],
  [
    "Remove search:",
    "Zoekterm verwijderen:",
    "Supprimer la recherche :",
    "سڕینەوەی گەڕان:",
    "إزالة البحث:",
    "لێگەڕیانێ ژێببە:"
  ],
  [
    "Recently viewed products",
    "Recent bekeken producten",
    "Produits consultés récemment",
    "بەرهەمە تازە بینراوەکان",
    "المنتجات التي شوهدت مؤخرًا",
    "بەرهەمێن نوکە دیتی"
  ],
  [
    "Recently viewed",
    "Recent bekeken",
    "Consultés récemment",
    "دوایین بەرهەمە بینراوەکان",
    "شوهدت مؤخرًا",
    "نوکە دیتی"
  ],
  [
    "EXPLORE AGAIN",
    "OPNIEUW ONTDEKKEN",
    "À DÉCOUVRIR À NOUVEAU",
    "دووبارە بگەڕێ",
    "اكتشف مجددًا",
    "دووبارە بگەڕێ"
  ],
  [
    "YOUR BAG",
    "JOUW WINKELMANDJE",
    "VOTRE PANIER",
    "سەبەتەکەت",
    "سلتك",
    "سەبەتا تە"
  ],
  [
    "Language and region suggestion",
    "Taal- en regiosuggestie",
    "Langue et région suggérées",
    "پێشنیاری زمان و ناوچە",
    "اقتراح اللغة والمنطقة",
    "پێشنیارا زمان و هەرێمێ"
  ],
  [
    "Based only on your browser settings. Choose a language if you want. Confirm your real delivery country and prices at checkout.",
    "Alleen gebaseerd op je browserinstellingen. Kies desgewenst een taal. Bevestig het werkelijke bezorgland en de prijzen bij het afrekenen.",
    "Suggestion basée uniquement sur les paramètres de votre navigateur. Confirmez le pays de livraison et les prix lors de la commande.",
    "تەنها لەسەر بنەمای ڕێکخستنەکانی وێبگەڕەکەتە. ئەگەر دەتەوێت زمان هەڵبژێرە. وڵاتی گەیاندن و نرخەکان لە کاتی تەواوکردنی کڕین پشتڕاست بکەرەوە.",
    "يعتمد فقط على إعدادات متصفحك. اختر اللغة إن أردت. أكّد بلد التسليم الفعلي والأسعار عند إتمام الطلب.",
    "ب تنێ ل دویڤ رێکخستنێن وێبگەڕێ تەیە. ئەگەر دخازی زمان هەلبژێرە. وەلاتێ گەهاندنێ و بهایان د دەمێ کڕینێ دا پشتڕاست بکە."
  ],
  [
    "Dismiss language suggestion",
    "Taalsuggestie sluiten",
    "Ignorer la suggestion de langue",
    "داخستنی پێشنیاری زمان",
    "تجاهل اقتراح اللغة",
    "پێشنیارا زمانی داخە"
  ],
  [
    "Close product preview",
    "Productvoorbeeld sluiten",
    "Fermer l’aperçu du produit",
    "داخستنی پێشبینینی بەرهەم",
    "إغلاق معاينة المنتج",
    "پێشبینینا بەرهەمی داخە"
  ],
  [
    "Product preview",
    "Productvoorbeeld",
    "Aperçu du produit",
    "پێشبینینی بەرهەم",
    "معاينة المنتج",
    "پێشبینینا بەرهەمی"
  ],
  [
    "Review sizes, variants, availability and shipping on the full product page.",
    "Bekijk maten, varianten, voorraad en verzending op de productpagina.",
    "Consultez les tailles, variantes, disponibilités et conditions de livraison sur la fiche du produit.",
    "قەبارە، جۆر، بەردەستبوون و گەیاندن لە پەڕەی بەرهەم بپشکنە.",
    "راجع المقاسات والخيارات والتوفر والشحن في صفحة المنتج.",
    "قەبارە، هەلبژاردن، بەردەستبوون و گەهاندنێ ل لاپەڕا بەرهەمی ببینە."
  ],
  [
    "View full product →",
    "Bekijk product →",
    "Voir la fiche du produit →",
    "بینینی بەرهەم ←",
    "عرض المنتج بالكامل ←",
    "بەرهەمی ببینە ←"
  ],
  [
    "Products selected for comparison",
    "Producten voor vergelijking",
    "Produits sélectionnés pour la comparaison",
    "بەرهەمە هەڵبژێردراوەکان بۆ بەراورد",
    "المنتجات المحددة للمقارنة",
    "بەرهەمێن هەلبژارتی بۆ بەراوردکرنێ"
  ],
  [
    "Compare products ·",
    "Vergelijk producten ·",
    "Comparer les produits ·",
    "بەراوردکردنی بەرهەمەکان ·",
    "مقارنة المنتجات ·",
    "بەراوردکرنا بەرهەمان ·"
  ],
  [
    "Compare selection",
    "Vergelijk selectie",
    "Comparer la sélection",
    "بەراوردی هەڵبژاردەکان",
    "قارن الاختيارات",
    "هەلبژاردنان بەراورد بکە"
  ],
  [
    "Compare your selection",
    "Vergelijk jouw selectie",
    "Comparer votre sélection",
    "هەڵبژاردەکانت بەراورد بکە",
    "قارن اختياراتك",
    "هەلبژاردنێن خۆ بەراورد بکە"
  ],
  [
    "Close comparison",
    "Vergelijking sluiten",
    "Fermer la comparaison",
    "داخستنی بەراورد",
    "إغلاق المقارنة",
    "بەراوردکرنێ داخە"
  ],
  [
    "Compare displayed prices and open each product for current stock, delivery and complete specifications.",
    "Vergelijk de getoonde prijzen en open elk product voor actuele voorraad, levering en specificaties.",
    "Comparez les prix affichés et consultez chaque produit pour vérifier le stock, la livraison et les caractéristiques.",
    "نرخە پیشاندراوەکان بەراورد بکە و هەر بەرهەمێک بکەرەوە بۆ زانیاریی کۆگا، گەیاندن و تایبەتمەندییەکان.",
    "قارن الأسعار المعروضة وافتح كل منتج لمعرفة المخزون الحالي والتسليم والمواصفات.",
    "بهایێن دیار بەراورد بکە و هەر بەرهەمەکی ڤەکە بۆ زانینا بەردەستبوون، گەهاندن و تایبەتمەندییان."
  ],
  [
    "Clear prices and payment options at checkout.",
    "Duidelijke prijzen en betaalopties bij het afrekenen.",
    "Prix clairs et moyens de paiement indiqués à la commande.",
    "نرخی ڕوون و شێوازەکانی پارەدان لە کاتی تەواوکردنی کڕین.",
    "أسعار واضحة وخيارات الدفع عند إتمام الطلب.",
    "بهایێن دیار و رێکێن پارەدانێ د دەمێ کڕینێ دا."
  ],
  [
    "Clear prices and available payment methods at checkout.",
    "Duidelijke prijzen en beschikbare betaalmethoden bij het afrekenen.",
    "Prix clairs et moyens de paiement disponibles à la commande.",
    "نرخی ڕوون و شێوازە بەردەستەکانی پارەدان لە کاتی تەواوکردنی کڕین.",
    "أسعار واضحة وطرق الدفع المتاحة عند إتمام الطلب.",
    "بهایێن دیار و رێکێن پارەدانێ یێن بەردەست د دەمێ کڕینێ دا."
  ],
  [
    "Withdrawal form",
    "Modelformulier herroeping",
    "Formulaire de rétractation",
    "فۆرمی پاشگەزبوونەوە",
    "نموذج الانسحاب",
    "فۆرما پاشگەزبوونێ"
  ],
  [
    "Business information",
    "Bedrijfsgegevens",
    "Informations légales",
    "زانیاریی کۆمپانیا",
    "معلومات الشركة",
    "پێزانینێن کۆمپانیایێ"
  ],
  [
    "All rights reserved.",
    "Alle rechten voorbehouden.",
    "Tous droits réservés.",
    "هەموو مافەکان پارێزراون.",
    "جميع الحقوق محفوظة.",
    "هەمی ماف پاراستینە."
  ],
  [
    "Cookie settings",
    "Cookie-instellingen",
    "Paramètres des cookies",
    "ڕێکخستنی کوکی",
    "إعدادات ملفات تعريف الارتباط",
    "رێکخستنێن کوکیان"
  ],
  [
    "Cookie choice actions",
    "Cookiekeuzes",
    "Choix des cookies",
    "هەڵبژاردەکانی کوکی",
    "خيارات ملفات تعريف الارتباط",
    "هەلبژاردنێن کوکیان"
  ],
  [
    "Necessary storage supports your account, basket and security. Analytics and marketing stay off by default.",
    "Noodzakelijke opslag ondersteunt je account, winkelmandje en beveiliging. Analyses en marketing zijn standaard uitgeschakeld.",
    "Les données nécessaires assurent le fonctionnement du compte, du panier et de la sécurité. Les mesures d’audience et la publicité sont désactivées par défaut.",
    "بیرگەی پێویست بۆ هەژمار، سەبەتە و ئاسایشە. ئامار و ڕیکلام بە بنەڕەت ناچالاکن.",
    "التخزين الضروري يدعم الحساب والسلة والأمان. التحليلات والتسويق متوقفان افتراضيًا.",
    "هەڵگرتنا پێدڤی بۆ هەژمار، سەبەت و ئارامیێ یە. شیکارن و بازاڕگەری بنەڕەت ناچالاکن."
  ],
  [
    "Cookie choices",
    "Cookiekeuzes",
    "Choix des cookies",
    "هەڵبژاردەکانی کوکی",
    "خيارات ملفات تعريف الارتباط",
    "هەلبژاردنێن کوکیان"
  ],
  [
    "Read the cookie policy",
    "Lees het cookiebeleid",
    "Consulter la politique des cookies",
    "سیاسەتی کوکی بخوێنەوە",
    "اقرأ سياسة ملفات تعريف الارتباط",
    "سیاسەتا کوکیان بخوینە"
  ],
  [
    "Customize",
    "Instellingen",
    "Paramètres",
    "ڕێکخستن",
    "تخصيص",
    "رێک بخە"
  ],
  [
    "Reject optional",
    "Optionele weigeren",
    "Refuser les cookies facultatifs",
    "ڕەتکردنەوەی کوکیی ناپێویست",
    "رفض الاختيارية",
    "یێن ئارەزوومەندانە رەت بکە"
  ],
  [
    "Accept all",
    "Alles accepteren",
    "Tout accepter",
    "قبوڵکردنی هەموو",
    "قبول الكل",
    "هەمییان قەبوول بکە"
  ],
  [
    "Cookie preferences",
    "Cookie-instellingen",
    "Paramètres des cookies",
    "هەڵبژاردەکانی کوکی",
    "تفضيلات ملفات تعريف الارتباط",
    "رێکخستنێن کوکیان"
  ],
  [
    "Close preferences",
    "Voorkeuren sluiten",
    "Fermer les préférences",
    "داخستنی هەڵبژاردەکان",
    "إغلاق التفضيلات",
    "رێکخستنان داخە"
  ],
  [
    "Save choices",
    "Keuzes opslaan",
    "Enregistrer mes choix",
    "پاشەکەوتکردنی هەڵبژاردەکان",
    "حفظ التفضيلات",
    "هەلبژاردنان پاشەکەفت بکە"
  ],
  [
    "Ask for my choice again",
    "Opnieuw om toestemming vragen",
    "Revoir mon choix de consentement",
    "دووبارە داوای ڕەزامەندی بکە",
    "اطلب موافقتي من جديد",
    "دووبارە هەلبژاردنا من بخوازە"
  ],
  [
    "Necessary storage is always on. Your choice is saved on this device for 180 days. No analytics or advertising scripts are loaded in this release.",
    "Noodzakelijke opslag is altijd ingeschakeld. Je keuze wordt 180 dagen op dit apparaat bewaard. In deze versie worden geen analyse- of advertentiescripts geladen.",
    "Les cookies nécessaires sont toujours actifs. Votre choix est conservé pendant 180 jours sur cet appareil. Aucun script statistique ou publicitaire n’est chargé dans cette version.",
    "کوکیی پێویست هەمیشە چالاکە. هەڵبژاردەکانت لەسەر ئەم ئامێرە هەڵدەگیرێن بۆ ١٨٠ ڕۆژ. لەم وەشانەدا هیچ کۆدی ئامار یان ڕیکلام بار ناکرێت.",
    "الملفات الضرورية مفعّلة دائمًا. تُحفظ اختياراتك على هذا الجهاز لمدة 180 يومًا. لا يتم تحميل أدوات التحليلات أو الإعلانات في هذا الإصدار.",
    "هەڵگرتنا پێدڤی هەردەم چالاکە. هەلبژاردنا تە ١٨٠ رۆژان ل سەر ڤی ئامێری دهێتە پاشەکەفتکرن. د ڤێ وەشانێ دا چ کۆدێ شیکارن یان ریکلامێ ناهێتە بارکرن."
  ],
  [
    "Required for sessions, security and order handling.",
    "Vereist voor sessies, beveiliging en het verwerken van bestellingen.",
    "Indispensables aux sessions, à la sécurité et au traitement des commandes.",
    "بۆ سەشن، ئاسایش و بەڕێوەبردنی داواکاری پێویستن.",
    "مطلوبة للجلسة والأمان وإدارة الطلب.",
    "بۆ دانیشتن، ئارامی و بەڕێڤەبرنا داواکارییان پێدڤین."
  ],
  [
    "Usage measurement to improve the service.",
    "Gebruiksmeting om de dienstverlening te verbeteren.",
    "Mesure d’utilisation pour améliorer le service.",
    "پێوانەکردنی بەکارهێنان بۆ باشترکردنی خزمەتگوزاری.",
    "قياس الاستخدام لتحسين الخدمة.",
    "پێڤانا بکارئینانێ بۆ باشترکرنا خزمەتگوزاریێ."
  ],
  [
    "Advertising cookies and campaign measurement.",
    "Advertentiecookies en het meten van campagnes.",
    "Cookies publicitaires et mesure des campagnes.",
    "کوکیی ڕیکلام و پێوانەکردنی کاریگەری.",
    "ملفات تعريف الارتباط الإعلانية وقياس الحملات.",
    "کوکیێن ریکلامێ و پێڤانا کەمپەینان."
  ],
  [
    "Browser storage is unavailable, so this choice cannot be saved and this notice will return after refresh.",
    "De browseropslag is niet beschikbaar. Je keuze kan niet worden bewaard en dit bericht verschijnt opnieuw nadat je de pagina vernieuwt.",
    "Le stockage du navigateur est indisponible. Votre choix ne peut pas être mémorisé et cet avis réapparaîtra après actualisation.",
    "بیرگەی وێبگەڕ ڕێگەی پاشەکەوتکردن نادات. هەڵبژاردەکان لە نوێکردنەوەی پەڕەدا لەبیر دەچن.",
    "لا يسمح تخزين المتصفح بحفظ اختيارك. سيظهر الطلب مجددًا بعد تحديث الصفحة.",
    "هەڵگرتنا وێبگەڕێ بەردەست نینە. هەلبژاردنا تە ناهێتە پاشەکەفتکرن و پشتی نویکرنا لاپەڕێ ئەڤ پەیامە دێ ڤەگەریت."
  ],
  [
    "in your bag",
    "in je winkelmand",
    "dans votre panier",
    "لە سەبەتەکەتدا",
    "في سلتك",
    "د سەبەتا تە دا"
  ],
  [
    "Shopping information",
    "Winkelinformatie",
    "Informations d’achat",
    "زانیاریی کڕین",
    "معلومات التسوق",
    "پێزانینێن کڕینێ"
  ],
  [
    "Contact & business details",
    "Contact- en bedrijfsgegevens",
    "Coordonnées de l’entreprise",
    "زانیاری پەیوەندی و کۆمپانیا",
    "معلومات الاتصال والنشاط التجاري",
    "پێزانینێن پەیوەندی و کۆمپانیایێ"
  ],
  [
    "Registration / licence",
    "Registratie / vergunning",
    "Numéro d’entreprise",
    "تۆمارکردن / مۆڵەت",
    "التسجيل / الترخيص",
    "تۆمارکرن / مۆڵەت"
  ],
  [
    "Business name",
    "Bedrijfsnaam",
    "Raison sociale",
    "ناوی کۆمپانیا",
    "اسم النشاط التجاري",
    "ناڤێ کۆمپانیایێ"
  ],
  [
    "Phone",
    "Telefoon",
    "Téléphone",
    "تەلەفۆن",
    "الهاتف",
    "تەلەفۆن"
  ],
  [
    "Track",
    "Volgen",
    "Suivre",
    "بەدواداچوون",
    "التتبع",
    "دووڤچوون"
  ],
  [
    "Cancel",
    "Annuleren",
    "Annuler",
    "پاشگەزبوونەوە",
    "إلغاء",
    "پاشگەز ببە"
  ],
  [
    "PRIVACY CHOICES",
    "PRIVACYKEUZES",
    "VIE PRIVÉE",
    "تایبەتمەندی",
    "الخصوصية",
    "هەلبژاردنێن تایبەتمەندیێ"
  ],
  [
    "PRIVACY SETTINGS",
    "PRIVACYINSTELLINGEN",
    "CONFIDENTIALITÉ",
    "ڕێکخستنەکانی تایبەتمەندی",
    "إعدادات الخصوصية",
    "رێکخستنێن تایبەتمەندیێ"
  ],
  [
    "Necessary",
    "Noodzakelijk",
    "Nécessaires",
    "پێویست",
    "ضرورية",
    "پێدڤی"
  ],
  [
    "Always on",
    "Altijd actief",
    "Toujours actifs",
    "هەمیشە چالاک",
    "مفعلة دائماً",
    "هەردەم چالاک"
  ],
  [
    "Analytics",
    "Statistieken",
    "Statistiques",
    "ئامار و شیکردنەوە",
    "التحليلات",
    "شیکارن"
  ],
  [
    "Marketing",
    "Marketing",
    "Marketing",
    "ڕیکلام و بازاڕگەری",
    "التسويق",
    "بازاڕگەری"
  ],
  [
    "Email",
    "E-mail",
    "E-mail",
    "ئیمەیڵ",
    "البريد الإلكتروني",
    "ئیمێل"
  ],
  [
    "Manager account actions",
    "Manager-accountacties",
    "Actions du compte gestionnaire",
    "کردارەکانی هەژماری بەڕێوەبەر",
    "إجراءات حساب المدير",
    "کارێن هەژمارا بەڕێڤەبەری"
  ]
];
export const STOREFRONT_SHELL_KEYS=Object.freeze(rows.map(row=>row[0]));
const table=new Map(rows.map(row=>[row[0],Object.freeze(Object.fromEntries(languages.map((locale,i)=>[locale,row[i]])))]));
export function storefrontShellText(locale,value){
  const text=String(value??'');const key=text.trim();
  const translated=table.get(key)?.[locale];
  return translated===undefined?undefined:text.match(/^\s*/)[0]+translated+text.match(/\s*$/)[0];
}
