const copies = {
  en: {
    mode: 'Privacy action', deletion: 'Delete eligible account and order records', minimization: 'Minimize personal data and retain financial records',
    explanation: 'Minimization removes the account, sessions, engagement records and known contact/free-text fields from closed orders. It retains order and product identifiers, amounts, country, payment/refund references, timestamps and financial ledgers. These records can remain linkable; this is not complete erasure or guaranteed anonymity.',
    policy: 'Retention policy reference', policyHint: 'Required for minimization: enter the reference of your documented retention policy, not customer details. Maximum 200 characters.',
    acknowledgement: 'For minimization, I have checked the request and my documented retention policy, including legal holds. I understand which financial records remain.',
    warning: 'Check the requester’s identity and the applicable retention policy before either action. Provider copies, invoices outside this database and backups need separate handling. No legal retention period is chosen by this tool.',
    completed: 'Personal-data minimization completed. Financial records were retained. Check the audit entry for the action and policy reference.',
    errors: {
      GDPR_IDENTITY_REQUIRED: 'Enter exactly one customer ID or email address.', GDPR_CUSTOMER_NOT_FOUND: 'No customer or guest order matched these details.', GDPR_NOT_CUSTOMER: 'These tools are for customers only; Manager and Admin accounts are excluded.',
      GDPR_CONFIRMATION_REQUIRED: 'Type exactly DELETE to confirm the selected privacy action.', GDPR_FINANCIAL_RETENTION_REQUIRED: 'Financial ledger records prevent deletion. Review your retention policy and choose explicit minimization if appropriate.',
      GDPR_RETENTION_ACK_REQUIRED: 'Acknowledge the retained financial records before minimization.', GDPR_RETENTION_POLICY_REQUIRED: 'Enter a valid documented retention policy reference (1–200 characters).',
      GDPR_OPEN_ORDERS: 'Resolve open orders before minimizing their contact details.', GDPR_OPEN_RETURNS: 'Resolve open returns before minimizing their contact details.', GDPR_INVALID_MODE: 'Choose a supported privacy action.',
      GDPR_STOCK_INTEGRITY: 'The action stopped because an order stock reservation is inconsistent. The transaction was rolled back.', fallback: 'The operation could not be completed. No successful action was confirmed.'
    }
  },
  ckb: {
    mode: 'کرداری پاراستنی داتا', deletion: 'سڕینەوەی تۆمارە شیاوەکانی هەژمار و داواکاری', minimization: 'کەمکردنەوەی داتای کەسی و هێشتنەوەی تۆمارە داراییەکان',
    explanation: 'کەمکردنەوە، هەژمار، دانیشتنەکان، تۆمارەکانی بەشداری و خانە ناسراوەکانی پەیوەندی و دەقی ئازاد لە داواکارییە داخراوەکان دەسڕێتەوە. ناسنامەی داواکاری و کاڵا، بڕی پارە، وڵات، ئاماژەکانی پارەدان و گەڕاندنەوە، کات و تۆمارە داراییەکان دەمێننەوە. ڕەنگە ئەم تۆمارانە هێشتا بتوانرێت بە کەسەکەوە ببەسترێنەوە؛ ئەمە سڕینەوەی تەواو یان بێناسنامەکردنی مسۆگەر نییە.',
    policy: 'ئاماژەی سیاسەتی هێشتنەوەی داتا', policyHint: 'بۆ کەمکردنەوە پێویستە: ئاماژەی سیاسەتی نووسراوت بنووسە، نەک زانیاریی کڕیار. زۆرترین ٢٠٠ پیت.',
    acknowledgement: 'بۆ کەمکردنەوە، داواکارییەکە و سیاسەتی نووسراوی هێشتنەوە، لەگەڵ پابەندییە یاساییەکان، پشکنراون. دەزانم کام تۆمارە داراییانە دەمێننەوە.',
    warning: 'پێش هەر کردارێک ناسنامەی داواکار و سیاسەتی هێشتنەوەی داتا بپشکنە. کۆپیی دابینکەران، پسووڵەکانی دەرەوەی ئەم داتابەیسە و پاڵپشتەکان پێویستیان بە چارەسەری جیا هەیە. ئەم ئامرازە ماوەیەکی یاسایی دیاری ناکات.',
    completed: 'کەمکردنەوەی داتای کەسی تەواو بوو. تۆمارە داراییەکان پارێزراون. بۆ کردار و ئاماژەی سیاسەتەکە تۆماری پشکنین ببینە.',
    errors: {
      GDPR_IDENTITY_REQUIRED: 'تەنها یەک ناسنامەی کڕیار یان یەک ئیمەیڵ بنووسە.', GDPR_CUSTOMER_NOT_FOUND: 'هیچ کڕیار یان داواکاریی میوانێک بەو زانیارییانە نەدۆزرایەوە.', GDPR_NOT_CUSTOMER: 'ئەم ئامرازانە تەنها بۆ کڕیارانن؛ هەژماری بەڕێوەبەر و ئەدمین ناگرنەوە.',
      GDPR_CONFIRMATION_REQUIRED: 'بۆ پشتڕاستکردنەوەی کردارەکە بە وردی DELETE بنووسە.', GDPR_FINANCIAL_RETENTION_REQUIRED: 'تۆمارە داراییەکان ڕێگری لە سڕینەوە دەکەن. سیاسەتەکەت بپشکنە و ئەگەر گونجاوە کەمکردنەوە بە ئاشکرا هەڵبژێرە.',
      GDPR_RETENTION_ACK_REQUIRED: 'پێش کەمکردنەوە، هێشتنەوەی تۆمارە داراییەکان پشتڕاست بکەرەوە.', GDPR_RETENTION_POLICY_REQUIRED: 'ئاماژەیەکی دروستی سیاسەتی نووسراو بنووسە (١–٢٠٠ پیت).',
      GDPR_OPEN_ORDERS: 'پێش کەمکردنەوەی زانیاریی پەیوەندی، داواکارییە کراوەکان یەکلایی بکەرەوە.', GDPR_OPEN_RETURNS: 'پێش کەمکردنەوەی زانیاریی پەیوەندی، داواکارییە کراوەکانی گەڕاندنەوە یەکلایی بکەرەوە.', GDPR_INVALID_MODE: 'کردارێکی پشتگیریکراوی پاراستنی داتا هەڵبژێرە.',
      GDPR_STOCK_INTEGRITY: 'کردارەکە وەستا چونکە بڕی گیراوی کاڵای داواکارییەک ناگونجێت. مامەڵەکە گەڕێندرایەوە.', fallback: 'کردارەکە تەواو نەبوو. هیچ کردارێکی سەرکەوتوو پشتڕاست نەکرایەوە.'
    }
  },
  ar: {
    mode: 'إجراء الخصوصية', deletion: 'حذف سجلات الحساب والطلبات المؤهلة', minimization: 'تقليل البيانات الشخصية مع الاحتفاظ بالسجلات المالية',
    explanation: 'يُزيل التقليل الحساب والجلسات وسجلات الاشتراك وحقول الاتصال والنص الحر المعروفة من الطلبات المغلقة. وتبقى معرّفات الطلبات والمنتجات والمبالغ والدولة ومراجع الدفع والاسترداد والتواريخ والسجلات المالية. وقد تظل قابلة للربط بالشخص؛ هذا ليس محواً كاملاً أو ضماناً لإخفاء الهوية.',
    policy: 'مرجع سياسة الاحتفاظ', policyHint: 'مطلوب للتقليل: أدخل مرجع سياستك الموثقة، وليس بيانات العميل. الحد الأقصى 200 حرف.',
    acknowledgement: 'للتقليل، راجعت الطلب وسياسة الاحتفاظ الموثقة والالتزامات القانونية. أفهم السجلات المالية التي ستبقى.',
    warning: 'تحقق من هوية مقدم الطلب وسياسة الاحتفاظ قبل أي إجراء. نسخ المزوّدين والفواتير خارج هذه القاعدة والنسخ الاحتياطية تحتاج إلى معالجة منفصلة. لا تختار هذه الأداة مدة احتفاظ قانونية.',
    completed: 'اكتمل تقليل البيانات الشخصية مع الاحتفاظ بالسجلات المالية. راجع سجل التدقيق لمعرفة الإجراء ومرجع السياسة.',
    errors: {GDPR_IDENTITY_REQUIRED:'أدخل معرّف عميل واحداً أو بريداً إلكترونياً واحداً.',GDPR_CUSTOMER_NOT_FOUND:'لم يُعثر على عميل أو طلب ضيف مطابق.',GDPR_NOT_CUSTOMER:'هذه الأدوات للعملاء فقط؛ حسابات المدير والمسؤول مستثناة.',GDPR_CONFIRMATION_REQUIRED:'اكتب DELETE تماماً لتأكيد الإجراء.',GDPR_FINANCIAL_RETENTION_REQUIRED:'تمنع السجلات المالية الحذف. راجع سياستك واختر التقليل صراحةً إن كان مناسباً.',GDPR_RETENTION_ACK_REQUIRED:'أقرّ بالسجلات المالية المحتفظ بها قبل التقليل.',GDPR_RETENTION_POLICY_REQUIRED:'أدخل مرجع سياسة موثقة صالحاً من 1 إلى 200 حرف.',GDPR_OPEN_ORDERS:'عالج الطلبات المفتوحة قبل تقليل بيانات الاتصال.',GDPR_OPEN_RETURNS:'عالج المرتجعات المفتوحة قبل تقليل بيانات الاتصال.',GDPR_INVALID_MODE:'اختر إجراء خصوصية مدعوماً.',GDPR_STOCK_INTEGRITY:'توقف الإجراء بسبب عدم اتساق حجز المخزون. تم التراجع عن المعاملة.',fallback:'تعذر إكمال العملية. لم يتم تأكيد نجاح أي إجراء.'}
  },
  nl: {
    mode: 'Privacyactie', deletion: 'Toegestane account- en bestelgegevens verwijderen', minimization: 'Persoonsgegevens beperken en financiële gegevens behouden',
    explanation: 'Beperking verwijdert het account, sessies, inschrijvingen en bekende contact- en vrije tekstvelden uit afgesloten orders. Order- en productnummers, bedragen, land, betaal- en terugbetalingsreferenties, datums en financiële administratie blijven behouden. Deze gegevens kunnen herleidbaar blijven; dit is geen volledige verwijdering of gegarandeerde anonimisering.',
    policy: 'Referentie bewaarbeleid', policyHint: 'Vereist voor beperking: voer de referentie van uw vastgelegde bewaarbeleid in, geen klantgegevens. Maximaal 200 tekens.',
    acknowledgement: 'Voor beperking heb ik het verzoek en mijn vastgelegde bewaarbeleid, inclusief wettelijke bewaarplichten, beoordeeld. Ik begrijp welke financiële gegevens behouden blijven.',
    warning: 'Controleer de identiteit en het toepasselijke bewaarbeleid vóór elke actie. Kopieën bij dienstverleners, externe facturen en back-ups vereisen afzonderlijke behandeling. Deze tool bepaalt geen wettelijke bewaartermijn.',
    completed: 'Persoonsgegevens zijn beperkt; financiële gegevens zijn behouden. Bekijk het auditlog voor de actie en beleidsreferentie.',
    errors:{GDPR_IDENTITY_REQUIRED:'Vul precies één klant-ID óf één e-mailadres in.',GDPR_CUSTOMER_NOT_FOUND:'Geen klant of gastbestelling met deze gegevens gevonden.',GDPR_NOT_CUSTOMER:'Deze functie is uitsluitend voor klanten; Manager- en Admin-accounts zijn uitgesloten.',GDPR_CONFIRMATION_REQUIRED:'Typ exact DELETE om de gekozen privacyactie te bevestigen.',GDPR_FINANCIAL_RETENTION_REQUIRED:'Financiële gegevens verhinderen verwijdering. Beoordeel uw bewaarbeleid en kies expliciet beperking indien passend.',GDPR_RETENTION_ACK_REQUIRED:'Bevestig welke financiële gegevens behouden blijven.',GDPR_RETENTION_POLICY_REQUIRED:'Vul een geldige referentie van het vastgelegde bewaarbeleid in (1–200 tekens).',GDPR_OPEN_ORDERS:'Handel open orders af voordat u contactgegevens beperkt.',GDPR_OPEN_RETURNS:'Handel open retouren af voordat u contactgegevens beperkt.',GDPR_INVALID_MODE:'Kies een ondersteunde privacyactie.',GDPR_STOCK_INTEGRITY:'De actie is gestopt door een onjuiste voorraadreservering. De transactie is teruggedraaid.',fallback:'De bewerking kon niet worden voltooid. Er is geen succesvolle actie bevestigd.'}
  },
  fr: {
    mode: 'Action de confidentialité', deletion: 'Supprimer les données de compte et commandes admissibles', minimization: 'Réduire les données personnelles et conserver les données financières',
    explanation: 'La réduction supprime le compte, les sessions, les inscriptions et les champs connus de contact et de texte libre des commandes clôturées. Les identifiants, montants, pays, références de paiement et remboursement, dates et registres financiers restent conservés. Ils peuvent rester identifiants ; ce n’est ni un effacement complet ni une anonymisation garantie.',
    policy: 'Référence de la politique de conservation', policyHint: 'Obligatoire pour la réduction : indiquez la référence de votre politique documentée, pas des données du client. Maximum 200 caractères.',
    acknowledgement: 'Pour la réduction, j’ai vérifié la demande et ma politique documentée, y compris les obligations légales. Je comprends quelles données financières restent conservées.',
    warning: 'Vérifiez l’identité et la politique applicable avant toute action. Les copies des prestataires, factures externes et sauvegardes nécessitent un traitement distinct. Cet outil ne fixe aucune durée légale de conservation.',
    completed: 'Réduction des données personnelles terminée ; les données financières sont conservées. Consultez le journal pour l’action et la référence de la politique.',
    errors:{GDPR_IDENTITY_REQUIRED:'Saisissez un seul identifiant client ou une seule adresse e-mail.',GDPR_CUSTOMER_NOT_FOUND:'Aucun client ou commande invité ne correspond.',GDPR_NOT_CUSTOMER:'Ces outils sont réservés aux clients ; les comptes Manager et Admin sont exclus.',GDPR_CONFIRMATION_REQUIRED:'Saisissez exactement DELETE pour confirmer l’action.',GDPR_FINANCIAL_RETENTION_REQUIRED:'Les registres financiers empêchent la suppression. Vérifiez votre politique et choisissez explicitement la réduction si approprié.',GDPR_RETENTION_ACK_REQUIRED:'Confirmez les données financières conservées avant la réduction.',GDPR_RETENTION_POLICY_REQUIRED:'Indiquez une référence valide de politique documentée (1–200 caractères).',GDPR_OPEN_ORDERS:'Traitez les commandes ouvertes avant de réduire les coordonnées.',GDPR_OPEN_RETURNS:'Traitez les retours ouverts avant de réduire les coordonnées.',GDPR_INVALID_MODE:'Choisissez une action de confidentialité prise en charge.',GDPR_STOCK_INTEGRITY:'L’action est interrompue : la réservation de stock est incohérente. La transaction a été annulée.',fallback:'L’opération n’a pas pu être terminée. Aucune réussite n’a été confirmée.'}
  }
};

export function privacyActionCopy(locale='en') {
  const language=String(locale).toLowerCase().split('-')[0];
  return Object.hasOwn(copies,language)?copies[language]:copies.en;
}
