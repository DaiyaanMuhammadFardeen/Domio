/**
 * Storefront i18n — lightweight translation layer for the marketplace.
 *
 * Uses @domio/i18n for locale types, currency formatting, and Bengali digit
 * rendering. Provides storefront-specific translation dictionaries inline.
 */

import { isLocaleId, formatCurrency, type LocaleId, type CurrencyCode } from '@domio/i18n';

export type { LocaleId };

/* ── Re-export useful utilities ─────────────────────────────────────── */
export { isLocaleId, formatCurrency, type CurrencyCode };

/** All supported locales for the storefront. */
export const LOCALES: readonly LocaleId[] = ['en', 'bn', 'es', 'fr', 'de', 'ja', 'zh-CN'] as const;

const STORAGE_KEY = 'domio.locale';

/* ── Detect locale from localStorage (client only) ──────────────────── */
export function detectLocale(): LocaleId {
  if (typeof window === 'undefined') return 'en';
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored && isLocaleId(stored)) return stored;
  } catch { /* SSR guard */ }
  return 'en';
}

export function setLocale(locale: LocaleId): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, locale);
  } catch { /* no-op */ }
}

/* ── Translation dictionaries ───────────────────────────────────────── */

type Dict = Record<string, string>;

const en: Dict = {
  // Navigation
  'nav.home': 'Home',
  'nav.browse': 'Browse',
  'nav.creators': 'Creators',
  'nav.library': 'Library',

  // Hero
  'hero.title': 'Find the right building blocks',
  'hero.subtitle': 'Components, templates, themes, and more — ready to use in your next project.',
  'hero.searchPlaceholder': 'Search marketplace...',

  // Sidebar
  'sidebar.kind': 'Type',
  'sidebar.kind.all': 'All types',
  'sidebar.kind.component': 'Components',
  'sidebar.kind.template': 'Templates',
  'sidebar.kind.theme': 'Themes',
  'sidebar.kind.sticker_pack': 'Sticker packs',
  'sidebar.kind.icon_pack': 'Icon packs',
  'sidebar.price': 'Price',
  'sidebar.price.all': 'All prices',
  'sidebar.price.free': 'Free',
  'sidebar.price.one_time': 'One-time purchase',
  'sidebar.price.subscription': 'Subscription',
  'sidebar.price.team': 'Team license',
  'sidebar.clear': 'Clear filters',

  // Cards
  'card.free': 'Free',
  'card.downloads': '{count} downloads',
  'card.rating': '{avg} ({count})',
  'card.viewDetails': 'View details',

  // Featured
  'featured.title': 'Featured',

  // Listing detail
  'detail.about': 'About',
  'detail.license': 'License',
  'detail.version': 'Version',
  'detail.lastUpdated': 'Last updated',
  'detail.creator': 'Creator',
  'detail.buy': 'Buy now',
  'detail.install': 'Install',
  'detail.freeInstall': 'Install for free',
  'detail.reviews': 'Reviews',
  'detail.reviewsCount': '{count} reviews',
  'detail.changelog': 'Changelog',
  'detail.related': 'Related listings',
  'detail.backToBrowse': 'Back to browse',

  // Checkout
  'checkout.initiated': 'Purchase initiated',
  'checkout.redirecting': 'Redirecting to payment provider...',
  'checkout.pending': 'Your purchase is being processed.',
  'checkout.success': 'Payment successful! Your item is ready to use.',
  'checkout.failed': 'Payment did not complete. You were not charged.',
  'checkout.expired': 'This purchase link has expired. Please try again.',
  'checkout.backToItem': 'Back to item',

  // Empty / Error
  'empty.title': 'No listings found',
  'empty.subtitle': 'Try adjusting your search or filters.',
  'error.title': 'Something went wrong',
  'error.subtitle': 'We could not load marketplace data. Please try again.',
  'error.retry': 'Try again',
  'notfound.title': 'Listing not found',
  'notfound.subtitle': 'This listing may have been removed or does not exist.',

  // Footer
  'footer.madeBy': 'Built for the Domio creator economy',

  // Misc
  'loading': 'Loading...',
  'sort.newest': 'Newest',
  'sort.popular': 'Most popular',
  'sort.priceLow': 'Price: low to high',
  'sort.priceHigh': 'Price: high to low',
  'sort.rating': 'Top rated',
};

const bn: Dict = {
  'nav.home': 'হোম',
  'nav.browse': 'ব্রাউজ',
  'nav.creators': 'নির্মাতারা',
  'nav.library': 'লাইব্রেরি',
  'hero.title': 'সঠিক বিল্ডিং ব্লক খুঁজুন',
  'hero.subtitle': 'কম্পোনেন্ট, টেমপ্লেট, থিম, এবং আরও — আপনার পরবর্তী প্রজেক্টে ব্যবহারের জন্য প্রস্তুত।',
  'hero.searchPlaceholder': 'মার্কেটপ্লেস অনুসন্ধান...',
  'sidebar.kind': 'ধরন',
  'sidebar.kind.all': 'সব ধরন',
  'sidebar.kind.component': 'কম্পোনেন্ট',
  'sidebar.kind.template': 'টেমপ্লেট',
  'sidebar.kind.theme': 'থিম',
  'sidebar.kind.sticker_pack': 'স্টিকার প্যাক',
  'sidebar.kind.icon_pack': 'আইকন প্যাক',
  'sidebar.price': 'মূল্য',
  'sidebar.price.all': 'সব মূল্য',
  'sidebar.price.free': 'বিনামূল্যে',
  'sidebar.price.one_time': 'এককালীন ক্রয়',
  'sidebar.price.subscription': 'সাবস্ক্রিপশন',
  'sidebar.price.team': 'টিম লাইসেন্স',
  'sidebar.clear': 'ফিল্টার মুছুন',
  'card.free': 'বিনামূল্যে',
  'card.downloads': '{count} ডাউনলোড',
  'card.rating': '{avg} ({count})',
  'card.viewDetails': 'বিস্তারিত দেখুন',
  'featured.title': 'বৈশিষ্ট্যযুক্ত',
  'detail.about': 'সম্পর্কে',
  'detail.license': 'লাইসেন্স',
  'detail.version': 'সংস্করণ',
  'detail.lastUpdated': 'শেষ আপডেট',
  'detail.creator': 'নির্মাতা',
  'detail.buy': 'এখনই কিনুন',
  'detail.install': 'ইনস্টল',
  'detail.freeInstall': 'বিনামূল্যে ইনস্টল',
  'detail.reviews': 'পর্যালোচনা',
  'detail.reviewsCount': '{count}টি পর্যালোচনা',
  'detail.changelog': 'চেঞ্জলগ',
  'detail.related': 'সম্পর্কিত লিস্টিং',
  'detail.backToBrowse': 'ব্রাউজে ফিরুন',
  'checkout.initiated': 'ক্রয় শুরু হয়েছে',
  'checkout.redirecting': 'পেমেন্ট প্রোভাইডারে পুনঃনির্দেশিত হচ্ছে...',
  'checkout.pending': 'আপনার ক্রয় প্রক্রিয়া হচ্ছে।',
  'checkout.success': 'পেমেন্ট সফল! আপনার আইটেম ব্যবহারের জন্য প্রস্তুত।',
  'checkout.failed': 'পেমেন্ট সম্পন্ন হয়নি। আপনার কাছ থেকে কোনো চার্জ হয়নি।',
  'checkout.expired': 'এই ক্রয় লিংকের মেয়াদ শেষ হয়েছে। আবার চেষ্টা করুন।',
  'checkout.backToItem': 'আইটেমে ফিরুন',
  'empty.title': 'কোনো লিস্টিং পাওয়া যায়নি',
  'empty.subtitle': 'আপনার অনুসন্ধান বা ফিল্টার সামঞ্জস্য করার চেষ্টা করুন।',
  'error.title': 'কিছু ভুল হয়েছে',
  'error.subtitle': 'আমরা মার্কেটপ্লেস ডেটা লোড করতে পারিনি। আবার চেষ্টা করুন।',
  'error.retry': 'আবার চেষ্টা করুন',
  'notfound.title': 'লিস্টিং পাওয়া যায়নি',
  'notfound.subtitle': 'এই লিস্টিং সরিয়ে নেওয়া হতে পারে বা বিদ্যমান নাও থাকতে পারে।',
  'footer.madeBy': 'ডোমিও ক্রিয়েটর ইকোনমির জন্য তৈরি',
  'loading': 'লোড হচ্ছে...',
  'sort.newest': 'নতুন',
  'sort.popular': 'সবচেয়ে জনপ্রিয়',
  'sort.priceLow': 'মূল্য: কম থেকে বেশি',
  'sort.priceHigh': 'মূল্য: বেশি থেকে কম',
  'sort.rating': 'সর্বোচ্চ রেটিং',
};

const es: Dict = {
  'nav.home': 'Inicio',
  'nav.browse': 'Explorar',
  'nav.creators': 'Creadores',
  'nav.library': 'Biblioteca',
  'hero.title': 'Encuentra los componentes correctos',
  'hero.subtitle': 'Componentes, plantillas, temas y más, listos para usar en tu próximo proyecto.',
  'hero.searchPlaceholder': 'Buscar en el marketplace...',
  'sidebar.kind': 'Tipo',
  'sidebar.kind.all': 'Todos los tipos',
  'sidebar.kind.component': 'Componentes',
  'sidebar.kind.template': 'Plantillas',
  'sidebar.kind.theme': 'Temas',
  'sidebar.kind.sticker_pack': 'Paquetes de pegatinas',
  'sidebar.kind.icon_pack': 'Paquetes de iconos',
  'sidebar.price': 'Precio',
  'sidebar.price.all': 'Todos los precios',
  'sidebar.price.free': 'Gratis',
  'sidebar.price.one_time': 'Compra única',
  'sidebar.price.subscription': 'Suscripción',
  'sidebar.price.team': 'Licencia de equipo',
  'sidebar.clear': 'Limpiar filtros',
  'card.free': 'Gratis',
  'card.downloads': '{count} descargas',
  'card.rating': '{avg} ({count})',
  'card.viewDetails': 'Ver detalles',
  'featured.title': 'Destacados',
  'detail.about': 'Acerca de',
  'detail.license': 'Licencia',
  'detail.version': 'Versión',
  'detail.lastUpdated': 'Última actualización',
  'detail.creator': 'Creador',
  'detail.buy': 'Comprar ahora',
  'detail.install': 'Instalar',
  'detail.freeInstall': 'Instalar gratis',
  'detail.reviews': 'Reseñas',
  'detail.reviewsCount': '{count} reseñas',
  'detail.changelog': 'Registro de cambios',
  'detail.related': 'Listados relacionados',
  'detail.backToBrowse': 'Volver a explorar',
  'checkout.initiated': 'Compra iniciada',
  'checkout.redirecting': 'Redirigiendo al proveedor de pago...',
  'checkout.pending': 'Su compra está siendo procesada.',
  'checkout.success': '¡Pago exitoso! Su artículo está listo para usar.',
  'checkout.failed': 'El pago no se completó. No se le cobró.',
  'checkout.expired': 'Este enlace de compra ha expirado. Intente de nuevo.',
  'checkout.backToItem': 'Volver al artículo',
  'empty.title': 'No se encontraron listados',
  'empty.subtitle': 'Intente ajustar su búsqueda o filtros.',
  'error.title': 'Algo salió mal',
  'error.subtitle': 'No pudimos cargar los datos del marketplace. Intente de nuevo.',
  'error.retry': 'Intentar de nuevo',
  'notfound.title': 'Listado no encontrado',
  'notfound.subtitle': 'Este listado puede haber sido eliminado o no existe.',
  'footer.madeBy': 'Creado para la economía de creadores de Domio',
  'loading': 'Cargando...',
  'sort.newest': 'Más reciente',
  'sort.popular': 'Más popular',
  'sort.priceLow': 'Precio: menor a mayor',
  'sort.priceHigh': 'Precio: mayor a menor',
  'sort.rating': 'Mejor valorados',
};

const fr: Dict = {
  'nav.home': 'Accueil',
  'nav.browse': 'Parcourir',
  'nav.creators': 'Créateurs',
  'nav.library': 'Bibliothèque',
  'hero.title': 'Trouvez les bons éléments constitutifs',
  'hero.subtitle': 'Composants, modèles, thèmes et plus, prêts à utiliser dans votre prochain projet.',
  'hero.searchPlaceholder': 'Rechercher sur le marketplace...',
  'sidebar.kind': 'Type',
  'sidebar.kind.all': 'Tous les types',
  'sidebar.kind.component': 'Composants',
  'sidebar.kind.template': 'Modèles',
  'sidebar.kind.theme': 'Thèmes',
  'sidebar.kind.sticker_pack': 'Packs d\'autocollants',
  'sidebar.kind.icon_pack': 'Packs d\'icônes',
  'sidebar.price': 'Prix',
  'sidebar.price.all': 'Tous les prix',
  'sidebar.price.free': 'Gratuit',
  'sidebar.price.one_time': 'Achat unique',
  'sidebar.price.subscription': 'Abonnement',
  'sidebar.price.team': 'Licence équipe',
  'sidebar.clear': 'Effacer les filtres',
  'card.free': 'Gratuit',
  'card.downloads': '{count} téléchargements',
  'card.rating': '{avg} ({count})',
  'card.viewDetails': 'Voir les détails',
  'featured.title': 'En vedette',
  'detail.about': 'À propos',
  'detail.license': 'Licence',
  'detail.version': 'Version',
  'detail.lastUpdated': 'Dernière mise à jour',
  'detail.creator': 'Créateur',
  'detail.buy': 'Acheter maintenant',
  'detail.install': 'Installer',
  'detail.freeInstall': 'Installer gratuitement',
  'detail.reviews': 'Avis',
  'detail.reviewsCount': '{count} avis',
  'detail.changelog': 'Journal des modifications',
  'detail.related': 'Annonces similaires',
  'detail.backToBrowse': 'Retour à la navigation',
  'checkout.initiated': 'Achat initié',
  'checkout.redirecting': 'Redirection vers le fournisseur de paiement...',
  'checkout.pending': 'Votre achat est en cours de traitement.',
  'checkout.success': 'Paiement réussi! Votre article est prêt à être utilisé.',
  'checkout.failed': 'Le paiement n\'a pas abouti. Vous n\'avez pas été facturé.',
  'checkout.expired': 'Ce lien d\'achat a expiré. Veuillez réessayer.',
  'checkout.backToItem': 'Retour à l\'article',
  'empty.title': 'Aucune annonce trouvée',
  'empty.subtitle': 'Essayez d\'ajuster votre recherche ou vos filtres.',
  'error.title': 'Une erreur s\'est produite',
  'error.subtitle': 'Nous n\'avons pas pu charger les données du marketplace. Veuillez réessayer.',
  'error.retry': 'Réessayer',
  'notfound.title': 'Annonce non trouvée',
  'notfound.subtitle': 'Cette annonce a peut-être été supprimée ou n\'existe pas.',
  'footer.madeBy': 'Créé pour l\'économie des créateurs Domio',
  'loading': 'Chargement...',
  'sort.newest': 'Plus récent',
  'sort.popular': 'Plus populaire',
  'sort.priceLow': 'Prix : croissant',
  'sort.priceHigh': 'Prix : décroissant',
  'sort.rating': 'Mieux notés',
};

const de: Dict = {
  'nav.home': 'Startseite',
  'nav.browse': 'Durchsuchen',
  'nav.creators': 'Ersteller',
  'nav.library': 'Bibliothek',
  'hero.title': 'Finden Sie die richtigen Bausteine',
  'hero.subtitle': 'Komponenten, Vorlagen, Themen und mehr — bereit zur Verwendung in Ihrem nächsten Projekt.',
  'hero.searchPlaceholder': 'Marketplace durchsuchen...',
  'sidebar.kind': 'Typ',
  'sidebar.kind.all': 'Alle Typen',
  'sidebar.kind.component': 'Komponenten',
  'sidebar.kind.template': 'Vorlagen',
  'sidebar.kind.theme': 'Themen',
  'sidebar.kind.sticker_pack': 'Aufkleber-Pakete',
  'sidebar.kind.icon_pack': 'Symbol-Pakete',
  'sidebar.price': 'Preis',
  'sidebar.price.all': 'Alle Preise',
  'sidebar.price.free': 'Kostenlos',
  'sidebar.price.one_time': 'Einmalkauf',
  'sidebar.price.subscription': 'Abonnement',
  'sidebar.price.team': 'Team-Lizenz',
  'sidebar.clear': 'Filter löschen',
  'card.free': 'Kostenlos',
  'card.downloads': '{count} Downloads',
  'card.rating': '{avg} ({count})',
  'card.viewDetails': 'Details ansehen',
  'featured.title': 'Empfohlen',
  'detail.about': 'Über',
  'detail.license': 'Lizenz',
  'detail.version': 'Version',
  'detail.lastUpdated': 'Zuletzt aktualisiert',
  'detail.creator': 'Ersteller',
  'detail.buy': 'Jetzt kaufen',
  'detail.install': 'Installieren',
  'detail.freeInstall': 'Kostenlos installieren',
  'detail.reviews': 'Bewertungen',
  'detail.reviewsCount': '{count} Bewertungen',
  'detail.changelog': 'Änderungsprotokoll',
  'detail.related': 'Ähnliche Einträge',
  'detail.backToBrowse': 'Zurück zum Durchsuchen',
  'checkout.initiated': 'Kauf gestartet',
  'checkout.redirecting': 'Weiterleitung zum Zahlungsanbieter...',
  'checkout.pending': 'Ihr Kauf wird bearbeitet.',
  'checkout.success': 'Zahlung erfolgreich! Ihr Artikel ist einsatzbereit.',
  'checkout.failed': 'Zahlung wurde nicht abgeschlossen. Es wurde nichts berechnet.',
  'checkout.expired': 'Dieser Kauf-Link ist abgelaufen. Bitte versuchen Sie es erneut.',
  'checkout.backToItem': 'Zurück zum Artikel',
  'empty.title': 'Keine Einträge gefunden',
  'empty.subtitle': 'Versuchen Sie, Ihre Suche oder Filter anzupassen.',
  'error.title': 'Etwas ist schiefgelaufen',
  'error.subtitle': 'Wir konnten die Marketplace-Daten nicht laden. Bitte versuchen Sie es erneut.',
  'error.retry': 'Erneut versuchen',
  'notfound.title': 'Eintrag nicht gefunden',
  'notfound.subtitle': 'Dieser Eintrag wurde möglicherweise entfernt oder existiert nicht.',
  'footer.madeBy': 'Erstellt für die Domio-Ersteller-Ökonomie',
  'loading': 'Wird geladen...',
  'sort.newest': 'Neueste',
  'sort.popular': 'Beliebteste',
  'sort.priceLow': 'Preis: aufsteigend',
  'sort.priceHigh': 'Preis: absteigend',
  'sort.rating': 'Bestbewertet',
};

const ja: Dict = {
  'nav.home': 'ホーム',
  'nav.browse': 'ブラウズ',
  'nav.creators': 'クリエイター',
  'nav.library': 'ライブラリ',
  'hero.title': '適切なビルドボロックを見つけよう',
  'hero.subtitle': 'コンポーネント、テンプレート、テーマなど、次のプロジェクトですぐ使える素材。',
  'hero.searchPlaceholder': 'マーケットプレイスを検索...',
  'sidebar.kind': 'タイプ',
  'sidebar.kind.all': 'すべてのタイプ',
  'sidebar.kind.component': 'コンポーネント',
  'sidebar.kind.template': 'テンプレート',
  'sidebar.kind.theme': 'テーマ',
  'sidebar.kind.sticker_pack': 'ステッカーパック',
  'sidebar.kind.icon_pack': 'アイコンパック',
  'sidebar.price': '価格',
  'sidebar.price.all': 'すべての価格',
  'sidebar.price.free': '無料',
  'sidebar.price.one_time': '一回限りの購入',
  'sidebar.price.subscription': 'サブスクリプション',
  'sidebar.price.team': 'チームライセンス',
  'sidebar.clear': 'フィルターをクリア',
  'card.free': '無料',
  'card.downloads': '{count} ダウンロード',
  'card.rating': '{avg} ({count})',
  'card.viewDetails': '詳細を見る',
  'featured.title': 'おすすめ',
  'detail.about': '概要',
  'detail.license': 'ライセンス',
  'detail.version': 'バージョン',
  'detail.lastUpdated': '最終更新',
  'detail.creator': 'クリエイター',
  'detail.buy': '今すぐ購入',
  'detail.install': 'インストール',
  'detail.freeInstall': '無料でインストール',
  'detail.reviews': 'レビュー',
  'detail.reviewsCount': '{count} 件のレビュー',
  'detail.changelog': '変更履歴',
  'detail.related': '関連リスティング',
  'detail.backToBrowse': 'ブラウズに戻る',
  'checkout.initiated': '購入を開始しました',
  'checkout.redirecting': '決済プロバイダーにリダイレクト中...',
  'checkout.pending': '購入を処理中です。',
  'checkout.success': 'お支払いが完了しました。アイテムの使用準備ができました。',
  'checkout.failed': 'お支払いが完了しませんでした。課金されていません。',
  'checkout.expired': 'この購入リンクの有効期限が切れました。もう一度お試しください。',
  'checkout.backToItem': 'アイテムに戻る',
  'empty.title': 'リスティングが見つかりません',
  'empty.subtitle': '検索条件やフィルターを調整してください。',
  'error.title': 'エラーが発生しました',
  'error.subtitle': 'マーケットプレイスデータを読み込めませんでした。もう一度お試しください。',
  'error.retry': '再試行',
  'notfound.title': 'リスティングが見つかりません',
  'notfound.subtitle': 'このリスティングは削除されたか、存在しない可能性があります。',
  'footer.madeBy': 'Domio クリエイターエコノミーのために作成',
  'loading': '読み込み中...',
  'sort.newest': '新しい順',
  'sort.popular': '人気順',
  'sort.priceLow': '価格: 安い順',
  'sort.priceHigh': '価格: 高い順',
  'sort.rating': '評価順',
};

const zhCN: Dict = {
  'nav.home': '首页',
  'nav.browse': '浏览',
  'nav.creators': '创作者',
  'nav.library': '库',
  'hero.title': '找到合适的构建模块',
  'hero.subtitle': '组件、模板、主题等——随时可用于您的下一个项目。',
  'hero.searchPlaceholder': '搜索市场...',
  'sidebar.kind': '类型',
  'sidebar.kind.all': '所有类型',
  'sidebar.kind.component': '组件',
  'sidebar.kind.template': '模板',
  'sidebar.kind.theme': '主题',
  'sidebar.kind.sticker_pack': '贴纸包',
  'sidebar.kind.icon_pack': '图标包',
  'sidebar.price': '价格',
  'sidebar.price.all': '所有价格',
  'sidebar.price.free': '免费',
  'sidebar.price.one_time': '一次性购买',
  'sidebar.price.subscription': '订阅',
  'sidebar.price.team': '团队许可',
  'sidebar.clear': '清除筛选',
  'card.free': '免费',
  'card.downloads': '{count} 次下载',
  'card.rating': '{avg} ({count})',
  'card.viewDetails': '查看详情',
  'featured.title': '精选',
  'detail.about': '关于',
  'detail.license': '许可证',
  'detail.version': '版本',
  'detail.lastUpdated': '最后更新',
  'detail.creator': '创作者',
  'detail.buy': '立即购买',
  'detail.install': '安装',
  'detail.freeInstall': '免费安装',
  'detail.reviews': '评价',
  'detail.reviewsCount': '{count} 条评价',
  'detail.changelog': '更新日志',
  'detail.related': '相关列表',
  'detail.backToBrowse': '返回浏览',
  'checkout.initiated': '购买已发起',
  'checkout.redirecting': '正在重定向到支付提供商...',
  'checkout.pending': '您的购买正在处理中。',
  'checkout.success': '支付成功！您的项目已准备就绪。',
  'checkout.failed': '支付未完成。您未被扣费。',
  'checkout.expired': '此购买链接已过期。请重试。',
  'checkout.backToItem': '返回项目',
  'empty.title': '未找到列表',
  'empty.subtitle': '请尝试调整搜索或筛选条件。',
  'error.title': '出了点问题',
  'error.subtitle': '我们无法加载市场数据。请重试。',
  'error.retry': '重试',
  'notfound.title': '未找到列表',
  'notfound.subtitle': '此列表可能已被删除或不存在。',
  'footer.madeBy': '为 Domio 创作者经济而建',
  'loading': '加载中...',
  'sort.newest': '最新',
  'sort.popular': '最受欢迎',
  'sort.priceLow': '价格：从低到高',
  'sort.priceHigh': '价格：从高到低',
  'sort.rating': '评分最高',
};

const dictionaries: Record<LocaleId, Dict> = {
  en, bn, es, fr, de, ja, 'zh-CN': zhCN,
  ar: en,
  ur: en,
};

/* ── Translation function ───────────────────────────────────────────── */

/**
 * Translate a key for the given locale. Falls back to English.
 *
 * @example
 * t('card.downloads', 'bn', { count: '১,২৫০' })
 * // → '১,২৫০ ডাউনলোড'
 */
export function t(
  key: string,
  locale: LocaleId,
  params?: Record<string, string | number>,
): string {
  const allDicts = dictionaries as Record<string, Dict | undefined>;
  const dict = allDicts[locale] ?? allDicts.en ?? {};
  const fallback = allDicts.en ?? {};
  let out = dict[key] ?? fallback[key] ?? key;
  if (params) {
    out = out.replace(/\{(\w+)\}/g, (_, k: string) =>
      k in params ? String(params[k]) : `{${k}}`,
    );
  }
  return out;
}

/**
 * Format a price from integer cents using the current locale.
 * Handles free items and currency formatting (including ৳ Bengali digits).
 */
export function formatPrice(
  priceCents: number,
  currency: string,
  locale: LocaleId,
  isFree: boolean,
): string {
  if (isFree || priceCents === 0) {
    return t('card.free', locale);
  }
  try {
    return formatCurrency(priceCents, currency as CurrencyCode, locale);
  } catch {
    // Fallback for unsupported currencies
    return `${currency} ${(priceCents / 100).toFixed(2)}`;
  }
}
