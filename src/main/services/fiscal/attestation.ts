import { formatFiscalNumber, type AttestationLang, type VendorInfo } from '../../../shared/fiscal'
import { esc } from '../print-format'

/**
 * "Attestation de conformité" TEMPLATE (FR / AR), printed to PDF by the fiscal IPC.
 * It is deliberately marked as a MODEL to be reviewed by a legal professional: the software does
 * not claim any official certification. Legal references must be confirmed before use.
 */

export interface AttestationData {
  lang: AttestationLang
  vendor: VendorInfo
  restaurant: { name: string; legal_name: string; nif: string; nis: string; rc: string; ai: string; address: string }
  journal: { events: number; lastFiscalNumber: number; headHash: string | null; verifiedOk: boolean | null; verifiedAt: string | null }
  generatedAt: Date
}

const TEXT = {
  fr: {
    watermark: 'MODÈLE',
    draft: 'MODÈLE DE DOCUMENT — Ce texte est un modèle fourni à titre indicatif par l’éditeur du logiciel. Il doit être relu, complété et validé par un professionnel du droit (avocat, expert-comptable ou conseiller fiscal) avant toute signature ou utilisation. Il ne constitue ni une certification officielle ni un avis juridique.',
    title: 'Attestation de conformité du logiciel de caisse',
    subtitle: 'Engagement de l’éditeur — inaltérabilité, sécurisation et conservation des données de vente',
    vendor: '1. Éditeur du logiciel',
    software: '2. Logiciel',
    user: '3. Utilisateur (exploitant)',
    commitments: '4. Engagements',
    journal: '5. État du journal à la date d’édition',
    fields: {
      name: 'Raison sociale', legalForm: 'Forme juridique', nif: 'NIF', nis: 'NIS', rc: 'RC', ai: 'Article d’imposition',
      address: 'Adresse', email: 'E-mail', phone: 'Téléphone', signatory: 'Signataire', softwareName: 'Nom du logiciel',
      version: 'Version', entries: 'Écritures du journal', lastNumber: 'Dernier numéro fiscal', head: 'Empreinte de tête (SHA-256)',
      verification: 'Dernière vérification'
    },
    missing: '[à compléter]',
    verifiedOk: 'intègre', verifiedKo: 'anomalie détectée', notVerified: 'non vérifié',
    intro: (signatory: string, vendor: string, software: string) =>
      `Je soussigné(e) ${signatory}, agissant pour le compte de ${vendor}, éditeur du logiciel ${software}, atteste que ce logiciel, tel qu’installé chez l’utilisateur désigné ci-dessus, met en œuvre les mécanismes suivants, destinés à répondre aux exigences de l’article 74 de la loi de finances pour 2026 relatives aux logiciels de caisse et de gestion des ventes (références légales à confirmer par un professionnel) :`,
    items: [
      '<b>Inaltérabilité.</b> Chaque opération (création de ticket, modification de lignes ou d’en-tête, annulation, restauration, paiement, remboursement, suppression de ligne) est inscrite dans un journal chaîné par empreinte SHA-256. Toute modification, suppression ou insertion d’une écriture rompt la chaîne et est signalée par la fonction de vérification intégrée. La base de données refuse la modification et la suppression des écritures du journal et la suppression des tickets.',
      '<b>Numérotation.</b> Chaque ticket reçoit un numéro fiscal unique, séquentiel et sans rupture, attribué dans la même transaction que sa création et imprimé sur le ticket remis au client.',
      '<b>Sécurisation.</b> Les corrections sont enregistrées par des écritures complémentaires (annulation, remboursement) ; les données d’origine et l’historique des lignes restent consultables.',
      '<b>Conservation.</b> Les données de vente sont conservées au moins six (6) ans. Le logiciel ne procède à aucune purge automatique et permet l’export d’archives annuelles (JSON et CSV) accompagnées de leurs empreintes SHA-256.'
    ],
    limits: 'Ces garanties portent sur les opérations effectuées au moyen du logiciel. L’exploitant reste responsable de la sauvegarde des données, de l’exactitude de l’horloge du poste et de la conservation des archives exportées.',
    done: 'Fait à', on: 'le', signature: 'Signature et cachet de l’éditeur',
    footer: (software: string, date: string) => `Document généré par ${software} le ${date}. MODÈLE — non certifié, à faire valider par un professionnel du droit.`
  },
  ar: {
    watermark: 'نموذج',
    draft: 'نموذج وثيقة — هذا النص نموذج استرشادي يقدّمه ناشر البرنامج. يجب أن يراجعه ويستكمله ويصادق عليه مختص في القانون (محامٍ أو محاسب خبير أو مستشار جبائي) قبل أي توقيع أو استعمال. لا يُعدّ شهادة رسمية ولا استشارة قانونية.',
    title: 'شهادة مطابقة برنامج الصندوق',
    subtitle: 'التزام الناشر — عدم قابلية تعديل بيانات المبيعات وتأمينها وحفظها',
    vendor: '1. ناشر البرنامج',
    software: '2. البرنامج',
    user: '3. المستعمل (المستغِل)',
    commitments: '4. الالتزامات',
    journal: '5. حالة السجل في تاريخ الإصدار',
    fields: {
      name: 'التسمية الاجتماعية', legalForm: 'الشكل القانوني', nif: 'رقم التعريف الجبائي (NIF)', nis: 'رقم التعريف الإحصائي (NIS)',
      rc: 'السجل التجاري (RC)', ai: 'رقم المادة الجبائية', address: 'العنوان', email: 'البريد الإلكتروني', phone: 'الهاتف',
      signatory: 'الموقّع', softwareName: 'اسم البرنامج', version: 'الإصدار', entries: 'قيود السجل', lastNumber: 'آخر رقم جبائي',
      head: 'بصمة آخر قيد (SHA-256)', verification: 'آخر تحقق'
    },
    missing: '[يُستكمل]',
    verifiedOk: 'سليم', verifiedKo: 'تم رصد خلل', notVerified: 'لم يتم التحقق',
    intro: (signatory: string, vendor: string, software: string) =>
      `أنا الموقّع(ة) أدناه ${signatory}، بصفتي ممثلاً عن ${vendor}، ناشر البرنامج ${software}، أشهد بأن هذا البرنامج، كما هو مثبت لدى المستعمل المذكور أعلاه، يطبّق الآليات التالية الرامية إلى الاستجابة لمتطلبات المادة 74 من قانون المالية لسنة 2026 المتعلقة ببرامج الصندوق وتسيير المبيعات (المراجع القانونية يجب أن يؤكدها مختص):`,
    items: [
      '<b>عدم قابلية التعديل.</b> تُسجَّل كل عملية (إنشاء تذكرة، تعديل الأسطر أو البيانات، إلغاء، استرجاع، دفع، استرداد، حذف سطر) في سجل متسلسل ببصمة SHA-256. وأي تعديل أو حذف أو إدراج لقيد يكسر السلسلة وتكشفه وظيفة التحقق المدمجة. وترفض قاعدة البيانات تعديل قيود السجل أو حذفها، كما ترفض حذف التذاكر.',
      '<b>الترقيم.</b> تحصل كل تذكرة على رقم جبائي فريد ومتسلسل دون انقطاع، يُمنح في نفس المعاملة التي تُنشأ فيها التذكرة ويُطبع على التذكرة المسلَّمة للزبون.',
      '<b>التأمين.</b> تُسجَّل التصحيحات بقيود تكميلية (إلغاء، استرداد)، وتبقى البيانات الأصلية وتاريخ الأسطر قابلة للاطلاع.',
      '<b>الحفظ.</b> تُحفظ بيانات المبيعات ست (6) سنوات على الأقل. ولا يقوم البرنامج بأي حذف تلقائي، ويتيح تصدير أرشيفات سنوية (JSON وCSV) مرفقة ببصماتها SHA-256.'
    ],
    limits: 'تشمل هذه الضمانات العمليات المنجزة بواسطة البرنامج. ويبقى المستغِل مسؤولاً عن حفظ نسخ احتياطية من البيانات، وعن ضبط ساعة الجهاز، وعن حفظ الأرشيفات المصدَّرة.',
    done: 'حُرّر بـ', on: 'في', signature: 'إمضاء وختم الناشر',
    footer: (software: string, date: string) => `وثيقة أنشأها ${software} بتاريخ ${date}. نموذج غير مصادق عليه، يجب أن يصادق عليه مختص في القانون.`
  }
} as const

export function buildAttestationHtml(data: AttestationData): string {
  const T = TEXT[data.lang]
  const rtl = data.lang === 'ar'
  const value = (text: string | null | undefined): string =>
    text && text.trim() ? `<bdi>${esc(text.trim())}</bdi>` : `<span class="missing">${esc(T.missing)}</span>`
  const rows = (pairs: [string, string | null | undefined][]): string =>
    `<table>${pairs.map(([label, text]) => `<tr><th>${esc(label)}</th><td>${value(text)}</td></tr>`).join('')}</table>`
  const v = data.vendor
  const r = data.restaurant
  const software = `${v.software_name || 'Fast Food Manager'} ${v.software_version || ''}`.trim()
  const date = data.generatedAt.toLocaleDateString(rtl ? 'ar-DZ' : 'fr-DZ', { timeZone: 'Africa/Algiers', numberingSystem: 'latn' })
  const verification = data.journal.verifiedOk === null
    ? T.notVerified
    : `${data.journal.verifiedOk ? T.verifiedOk : T.verifiedKo}${data.journal.verifiedAt ? ` (${data.journal.verifiedAt.slice(0, 16).replace('T', ' ')} UTC)` : ''}`
  const vendorName = v.vendor_name?.trim() ? esc(v.vendor_name.trim()) : `<span class="missing">${esc(T.missing)}</span>`
  const signatory = v.vendor_signatory?.trim() ? esc(v.vendor_signatory.trim()) : '…………………………'

  return `<!DOCTYPE html><html lang="${data.lang}" dir="${rtl ? 'rtl' : 'ltr'}"><head><meta charset="utf-8">
<title>${esc(T.title)}</title>
<style>
  @page { size: A4; margin: 16mm 15mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', Tahoma, Arial, sans-serif; color: #1c1917; font-size: 10.5pt; line-height: 1.5; margin: 0; }
  .watermark { position: fixed; top: 38%; left: 0; right: 0; text-align: center; font-size: 96pt; font-weight: 800;
    color: rgba(185, 28, 28, 0.07); transform: rotate(-22deg); z-index: 0; }
  .draft { position: relative; border: 2px solid #b91c1c; background: #fef2f2; color: #7f1d1d; padding: 8px 12px;
    border-radius: 6px; font-weight: 600; font-size: 9.5pt; }
  h1 { font-size: 17pt; margin: 16px 0 2px; }
  .subtitle { color: #57534e; margin: 0 0 10px; }
  h2 { font-size: 11.5pt; margin: 14px 0 6px; padding-bottom: 3px; border-bottom: 1px solid #d6d3d1; }
  table { border-collapse: collapse; width: 100%; }
  th { text-align: start; font-weight: 600; color: #44403c; width: 38%; padding: 3px 8px 3px 0; vertical-align: top; }
  td { padding: 3px 0; }
  .missing { color: #b45309; font-style: italic; }
  ol { padding-inline-start: 20px; margin: 6px 0; }
  li { margin: 5px 0; }
  .hash { font-family: Consolas, 'Courier New', monospace; font-size: 8.5pt; word-break: break-all; direction: ltr; unicode-bidi: embed; }
  .limits { color: #57534e; font-size: 9.5pt; }
  .sign { display: flex; justify-content: space-between; gap: 24px; margin-top: 22px; }
  .sign .box { flex: 1; border: 1px dashed #a8a29e; border-radius: 6px; min-height: 90px; padding: 8px; color: #57534e; }
  footer { margin-top: 18px; font-size: 8.5pt; color: #78716c; border-top: 1px solid #e7e5e4; padding-top: 6px; }
</style></head><body>
<div class="watermark">${esc(T.watermark)}</div>
<div class="draft">${esc(T.draft)}</div>
<h1>${esc(T.title)}</h1>
<p class="subtitle">${esc(T.subtitle)}</p>
<h2>${esc(T.vendor)}</h2>
${rows([
    [T.fields.name, v.vendor_name], [T.fields.legalForm, v.vendor_legal_form], [T.fields.nif, v.vendor_nif],
    [T.fields.nis, v.vendor_nis], [T.fields.rc, v.vendor_rc], [T.fields.ai, v.vendor_ai], [T.fields.address, v.vendor_address],
    [T.fields.email, v.vendor_email], [T.fields.phone, v.vendor_phone], [T.fields.signatory, v.vendor_signatory]
  ])}
<h2>${esc(T.software)}</h2>
${rows([[T.fields.softwareName, v.software_name], [T.fields.version, v.software_version]])}
<h2>${esc(T.user)}</h2>
${rows([
    [T.fields.name, r.legal_name || r.name], [T.fields.nif, r.nif], [T.fields.nis, r.nis], [T.fields.rc, r.rc],
    [T.fields.ai, r.ai], [T.fields.address, r.address]
  ])}
<h2>${esc(T.commitments)}</h2>
<p>${T.intro(signatory, vendorName, esc(software))}</p>
<ol>${T.items.map((item) => `<li>${item}</li>`).join('')}</ol>
<p class="limits">${esc(T.limits)}</p>
<h2>${esc(T.journal)}</h2>
<table>
  <tr><th>${esc(T.fields.entries)}</th><td><bdi>${data.journal.events}</bdi></td></tr>
  <tr><th>${esc(T.fields.lastNumber)}</th><td><bdi>${esc(formatFiscalNumber(data.journal.lastFiscalNumber))}</bdi></td></tr>
  <tr><th>${esc(T.fields.head)}</th><td class="hash">${esc(data.journal.headHash ?? '—')}</td></tr>
  <tr><th>${esc(T.fields.verification)}</th><td>${esc(verification)}</td></tr>
</table>
<div class="sign">
  <div>${esc(T.done)} ………………………… ${esc(T.on)} <bdi>${esc(date)}</bdi></div>
  <div class="box">${esc(T.signature)}</div>
</div>
<footer>${esc(T.footer(software, date))}</footer>
</body></html>`
}
