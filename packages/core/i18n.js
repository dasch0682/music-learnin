// Tiny bilingual helper (English / French).
const listeners = new Set();
let lang = localStorage.getItem('ml:lang') || ((navigator.language || 'en').toLowerCase().startsWith('fr') ? 'fr' : 'en');
document.documentElement.lang = lang;

export const getLang = () => lang;
export function setLang(l) {
  lang = l === 'fr' ? 'fr' : 'en';
  localStorage.setItem('ml:lang', lang);
  document.documentElement.lang = lang;
  listeners.forEach((fn) => fn(lang));
}
export const onLang = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

/** Resolve a { en, fr } object (or plain string) in the current language. */
export const tr = (v) => (v && typeof v === 'object' ? v[lang] ?? v.en : v);

/** Make a translator from a dictionary { key: { en, fr } }. Supports {name} placeholders. */
export function createT(dict) {
  return (key, vars) => {
    let s = tr(dict[key]) ?? key;
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, v);
    return s;
  };
}
