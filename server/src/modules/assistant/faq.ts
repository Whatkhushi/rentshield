/**
 * Offline help: answers common questions without any AI, so the Help
 * button always works (no key configured, or the free AI quota is used up).
 * Matching is simple keyword scoring over English, Hindi and Hinglish words.
 */
type Lang = 'en' | 'hi';
interface Entry {
  keys: string[];
  en: string;
  hi: string;
}

const ENTRIES: Entry[] = [
  {
    keys: ['invite', 'link', 'join', 'landlord', 'owner', 'bulao', 'bulaun', 'बुला', 'इनवाइट', 'लिंक', 'मकान मालिक', 'जोड़'],
    en: 'To invite the other person:\n1. Open the tenancy and stay on the Overview tab.\n2. Press "Create invite link" and then "Copy".\n3. Send it on WhatsApp or email.\nThe link works once and expires after 7 days. They open it, sign up or log in, and join.',
    hi: 'दूसरे व्यक्ति को बुलाने के लिए:\n1. किरायेदारी खोलें और "सारांश" टैब पर रहें।\n2. "इनवाइट लिंक बनाएँ" दबाएँ, फिर "कॉपी करें"।\n3. इसे WhatsApp या ईमेल पर भेजें।\nलिंक एक ही बार चलता है और 7 दिन में समाप्त हो जाता है। वे इसे खोलकर साइन अप या लॉग इन करें और जुड़ जाएँ।',
  },
  {
    keys: ['start', 'move-in', 'move in', 'inspection', 'checklist', 'shuru', 'जाँच', 'जांच', 'शुरू', 'मूव-इन', 'चेकलिस्ट'],
    en: 'To start the move-in inspection: open the tenancy, go to the Move-in tab and press "Start inspection". Each room gets a checklist. Give every item a condition (Good, Fair, Damaged, Missing or N/A), add notes and photos for anything not in good shape, then press "Submit for review".',
    hi: 'मूव-इन जाँच शुरू करने के लिए: किरायेदारी खोलें, "मूव-इन" टैब पर जाएँ और "जाँच शुरू करें" दबाएँ। हर कमरे की चेकलिस्ट बनेगी। हर चीज़ की हालत चुनें (अच्छा, ठीक-ठाक, खराब, गायब या लागू नहीं), जो चीज़ अच्छी हालत में नहीं है उसके नोट और फ़ोटो जोड़ें, फिर "जाँच के लिए भेजें" दबाएँ।',
  },
  {
    keys: ['photo', 'picture', 'image', 'upload', 'camera', 'pic', 'फ़ोटो', 'फोटो', 'तस्वीर', 'कैमरा'],
    en: 'Photos are optional but important for anything not in good shape. On each item press "Add photos" to upload. On a phone you also get "Camera", and at move-out it shows the old photo faintly so you can take the same shot. Each photo is fingerprinted, and if it has GPS data it shows whether it was taken at the property.',
    hi: 'फ़ोटो ज़रूरी नहीं, पर जो चीज़ अच्छी हालत में नहीं है उसके लिए बहुत काम की है। हर चीज़ पर "फ़ोटो जोड़ें" दबाएँ। फ़ोन पर "कैमरा" भी मिलता है, और मूव-आउट पर पुरानी फ़ोटो हल्की दिखती है ताकि आप वही फ़ोटो दोबारा ले सकें। हर फ़ोटो की फ़िंगरप्रिंट ली जाती है, और GPS हो तो दिखता है कि फ़ोटो प्रॉपर्टी पर ली गई या नहीं।',
  },
  {
    keys: ['all items', 'every item', 'too many', 'mark', 'good', 'n/a', 'remove item', 'add item', 'wardrobe', 'बाकी', 'अच्छा', 'हटा', 'लागू नहीं'],
    en: 'You don\'t need to click every item one by one. In each room press "Mark remaining as Good" after noting anything that is not fine. If something doesn\'t exist in the flat, choose N/A or remove it with the bin icon. "Add item" adds things like a sofa or geyser.',
    hi: 'हर चीज़ अलग-अलग क्लिक करने की ज़रूरत नहीं। हर कमरे में, जो ठीक नहीं है उसे दर्ज करने के बाद "बाकी को अच्छा मार्क करें" दबाएँ। जो चीज़ घर में है ही नहीं, उसके लिए "लागू नहीं" चुनें या बिन आइकन से हटा दें। "चीज़ जोड़ें" से सोफ़ा, गीज़र जैसी चीज़ें जोड़ सकते हैं।',
  },
  {
    keys: ['review', 'approve', 'dispute', 'send back', 'disagree', 'disagreement', 'reject', 'मंज़ूर', 'मंजूर', 'आपत्ति', 'असहमति', 'वापस भेज'],
    en: 'The reviewer has three choices on each item:\n- Approve: you agree.\n- Send back: something is wrong; the other person fixes it and it comes back to you.\n- Record disagreement: both views are saved side by side, and the item stops blocking the record.\nWhen every item is approved or has a recorded disagreement, the inspection locks forever.',
    hi: 'जाँचने वाले के पास हर चीज़ पर तीन विकल्प हैं:\n- मंज़ूर करें: आप सहमत हैं।\n- वापस भेजें: कुछ गलत है; दूसरा व्यक्ति सुधारेगा और फिर आपके पास आएगा।\n- असहमति दर्ज करें: दोनों की राय साथ-साथ सेव होती है, और यह चीज़ रिकॉर्ड को नहीं रोकती।\nजब हर चीज़ मंज़ूर हो जाए या उस पर असहमति दर्ज हो, जाँच हमेशा के लिए लॉक हो जाती है।',
  },
  {
    keys: ['move-out', 'move out', 'leaving', 'vacate', 'compare', 'छोड़', 'खाली', 'मूव-आउट', 'तुलना'],
    en: 'When you leave: open the Move-out tab and start the move-out inspection (available once move-in is locked). Photograph the same items again and give each a condition. After it is reviewed, the Compare tab shows move-in and move-out photos side by side, with a slider and "Highlight changes".',
    hi: 'घर छोड़ते समय: "मूव-आउट" टैब खोलें और मूव-आउट जाँच शुरू करें (मूव-इन लॉक होने के बाद मिलती है)। उन्हीं चीज़ों की फिर फ़ोटो लें और हालत चुनें। जाँच के बाद "तुलना" टैब में मूव-इन और मूव-आउट की फ़ोटो साथ-साथ दिखती हैं, स्लाइडर और "बदलाव दिखाएँ" के साथ।',
  },
  {
    keys: ['deposit', 'refund', 'deduction', 'deduct', 'settlement', 'money', 'paisa', 'paise', 'डिपॉज़िट', 'डिपॉजिट', 'वापस', 'कटौती', 'हिसाब', 'पैसे'],
    en: 'Settlement happens after the move-out inspection is locked. The landlord opens it in the Settlement tab and proposes deductions, each with an amount, a reason and evidence; they can never add up to more than the deposit. The tenant accepts or disputes each one. When nothing is open, both press "Confirm final settlement" and the refund is final.',
    hi: 'हिसाब मूव-आउट जाँच लॉक होने के बाद होता है। मकान मालिक "हिसाब" टैब में इसे शुरू करते हैं और कटौतियाँ प्रस्तावित करते हैं, हर एक के साथ रकम, कारण और सबूत; कुल कटौती डिपॉज़िट से ज़्यादा नहीं हो सकती। किरायेदार हर एक को मानते हैं या चुनौती देते हैं। जब कुछ बाकी न रहे, दोनों "अंतिम हिसाब की पुष्टि करें" दबाते हैं और वापसी तय हो जाती है।',
  },
  {
    // Phrases ("deposit kitna", "how much deposit") outweigh the bare word "deposit",
    // which would otherwise send these questions to the settlement answer.
    keys: [
      'how much',
      'how much deposit',
      'deposit kitna',
      'kitna hona',
      'maximum',
      'limit',
      'legal',
      'law',
      'months',
      'tenancy act',
      'kitna',
      'कितना',
      'कितना होना',
      'कानून',
      'महीने',
    ],
    en: 'India\'s Model Tenancy Act, 2021 suggests a residential deposit of at most two months\' rent, but each state adopts it differently, so local rules may vary. This is general information, not legal advice. For a serious dispute, keep the PDF report and contact the local Rent Authority, a consumer forum or a lawyer.',
    hi: 'भारत का मॉडल किरायेदारी अधिनियम, 2021 सुझाता है कि रहने के लिए घर का डिपॉज़िट दो महीने के किराये से ज़्यादा न हो, पर हर राज्य इसे अलग तरह लागू करता है। यह सामान्य जानकारी है, कानूनी सलाह नहीं। गंभीर विवाद में PDF रिपोर्ट रखें और स्थानीय रेंट अथॉरिटी, उपभोक्ता फ़ोरम या वकील से संपर्क करें।',
  },
  {
    keys: ['pdf', 'report', 'download', 'proof', 'रिपोर्ट', 'सबूत', 'डाउनलोड'],
    en: 'Go to the Records tab and press "Generate PDF report". It contains both inspections with photos, agreed and disputed items, every deduction and response, photo fingerprints and the full history. Press "Open" to view it or the download icon to save it.',
    hi: '"रिकॉर्ड" टैब पर जाएँ और "PDF रिपोर्ट बनाएँ" दबाएँ। इसमें दोनों जाँचें फ़ोटो के साथ, सहमत और विवादित चीज़ें, हर कटौती और जवाब, फ़ोटो फ़िंगरप्रिंट और पूरा इतिहास होता है। देखने के लिए "खोलें" दबाएँ, या सेव करने के लिए डाउनलोड आइकन।',
  },
  {
    keys: ['fingerprint', 'verify', 'tamper', 'edit', 'fake', 'change', 'audit', 'history', 'फ़िंगरप्रिंट', 'बदल', 'इतिहास', 'नकली'],
    en: 'Every uploaded file gets a fingerprint (a SHA-256 code). Click a photo and press "Verify integrity now" to check the stored file is unchanged since upload. The Records tab shows every action in order; "Chain intact" means no past entry was altered. A fingerprint shows a file hasn\'t changed; it doesn\'t prove when or where a photo was taken.',
    hi: 'हर अपलोड की गई फ़ाइल की एक फ़िंगरप्रिंट (SHA-256 कोड) बनती है। किसी फ़ोटो पर क्लिक करके "अभी जाँचें" दबाएँ, तो पता चलेगा कि फ़ाइल अपलोड के बाद नहीं बदली। "रिकॉर्ड" टैब में हर काम क्रम से दिखता है; "चेन सही है" का मतलब है कि पुरानी कोई एंट्री नहीं बदली गई।',
  },
  {
    keys: ['location', 'map', 'pin', 'gps', 'away', 'नक्शा', 'लोकेशन', 'पिन', 'दूर'],
    en: 'Pin the property on the map from the Overview tab ("Pin the property"). Phone photos usually carry GPS, so each photo shows "At property" (within 150 m), "x km away" or "No location". The pin locks once an inspection is agreed.',
    hi: '"सारांश" टैब से "प्रॉपर्टी पिन करें" दबाकर नक्शे पर घर पिन करें। फ़ोन की फ़ोटो में अक्सर GPS होता है, इसलिए हर फ़ोटो पर "प्रॉपर्टी पर" (150 मीटर के अंदर), "x किमी दूर" या "लोकेशन नहीं" दिखता है। जाँच पर सहमति के बाद पिन लॉक हो जाता है।',
  },
  {
    keys: ['delete', 'remove tenancy', 'mistake', 'by mistake', 'cancel', 'हटा', 'गलती', 'डिलीट'],
    en: 'A tenancy can be deleted from the bottom of its Overview tab ("Delete this tenancy"), but only while the other person hasn\'t joined. After they join, the record belongs to both of you and can\'t be deleted.',
    hi: 'किरायेदारी को उसके "सारांश" टैब के नीचे "यह किरायेदारी हटाएँ" से हटा सकते हैं, पर सिर्फ़ तब तक जब तक दूसरा व्यक्ति नहीं जुड़ा। उनके जुड़ने के बाद रिकॉर्ड आप दोनों का होता है और हटाया नहीं जा सकता।',
  },
  {
    keys: ['what is', 'rentshield', 'about', 'purpose', 'kya hai', 'क्या है', 'किस लिए'],
    en: 'RentShield helps tenants and landlords avoid deposit fights. You record the flat\'s condition together on day one, the record locks once both agree, and at move-out the deposit is settled item by item with evidence.',
    hi: 'RentShield किरायेदार और मकान मालिक को डिपॉज़िट के झगड़ों से बचाता है। आप पहले ही दिन मिलकर घर की हालत दर्ज करते हैं, दोनों की सहमति के बाद रिकॉर्ड लॉक हो जाता है, और घर छोड़ते समय सबूत के साथ एक-एक चीज़ का हिसाब होता है।',
  },
];

const NEXT: Record<string, [string, string]> = {
  WAITING_FOR_PARTY: ['Next: invite the other person. On the Overview tab press "Create invite link" and send it to them.', 'अगला कदम: दूसरे व्यक्ति को बुलाएँ। "सारांश" टैब पर "इनवाइट लिंक बनाएँ" दबाएँ और उन्हें भेजें।'],
  MOVE_IN: ['Next: complete the move-in inspection in the Move-in tab and get it agreed by both of you.', 'अगला कदम: "मूव-इन" टैब में मूव-इन जाँच पूरी करें और दोनों की सहमति लें।'],
  LIVING: ['Your move-in record is locked. Nothing to do until you move out; then start the move-out inspection.', 'आपका मूव-इन रिकॉर्ड लॉक है। घर छोड़ने तक कुछ नहीं करना; तब मूव-आउट जाँच शुरू करें।'],
  MOVE_OUT: ['Next: complete the move-out inspection in the Move-out tab and get it agreed by both of you.', 'अगला कदम: "मूव-आउट" टैब में मूव-आउट जाँच पूरी करें और दोनों की सहमति लें।'],
  SETTLEMENT: ['Next: settle the deposit in the Settlement tab, deduction by deduction, then both confirm.', 'अगला कदम: "हिसाब" टैब में एक-एक कटौती का हिसाब करें, फिर दोनों पुष्टि करें।'],
  SETTLED: ['This tenancy is settled. You can download the final PDF report from the Records tab.', 'इस किरायेदारी का हिसाब पूरा हो गया है। अंतिम PDF रिपोर्ट "रिकॉर्ड" टैब से डाउनलोड करें।'],
};

const isHindiText = (s: string) => /[ऀ-ॿ]/.test(s);

export function faqAnswer(question: string, uiLanguage: Lang, stage?: string): string {
  const q = question.toLowerCase();
  const lang: Lang = isHindiText(question) || (uiLanguage === 'hi' && !/[a-z]{4,}/.test(q)) ? 'hi' : 'en';

  // "What should I do next?" uses the tenancy's actual stage.
  if (stage && /(next|what (should|do) i|aage|आगे|अगला|क्या करना)/.test(q)) {
    const n = NEXT[stage];
    if (n) return lang === 'hi' ? n[1] : n[0];
  }

  let best: Entry | null = null;
  let bestScore = 0;
  for (const e of ENTRIES) {
    const score = e.keys.reduce((s, k) => s + (q.includes(k) ? k.length : 0), 0);
    if (score > bestScore) {
      best = e;
      bestScore = score;
    }
  }
  if (best) return lang === 'hi' ? best.hi : best.en;

  return lang === 'hi'
    ? 'मैं इन विषयों में मदद कर सकता हूँ: दूसरे व्यक्ति को बुलाना, मूव-इन जाँच, फ़ोटो, जाँच और असहमति, मूव-आउट और तुलना, डिपॉज़िट का हिसाब, PDF रिपोर्ट, नक्शा पिन और किरायेदारी हटाना। कृपया इनमें से किसी के बारे में पूछें।'
    : 'I can help with: inviting the other person, the move-in inspection, photos, reviewing and disagreements, move-out and comparing, the deposit settlement, the PDF report, the map pin, and deleting a tenancy. Ask me about any of these.';
}
