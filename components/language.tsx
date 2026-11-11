'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { english, englishPatterns } from '@/lib/english';

type Language = 'cs' | 'en';
type Translate = <T extends string | number | null | undefined>(text: T) => T;
const LanguageContext = createContext<{language: Language; setLanguage: (value: Language) => void; t: Translate}>({
  language: 'cs', setLanguage: () => {}, t: text => text,
});

export function translate(text: string, language: Language): string {
  if (language === 'cs') return text;
  const normalized = text.trim().replace(/\s+/g, ' ');
  const exact = english[normalized];
  if (exact) return text.replace(text.trim(), exact);
  for (const [pattern, replacement] of englishPatterns) {
    if (pattern.test(normalized)) return normalized.replace(pattern, replacement);
  }
  return text;
}

export function LanguageProvider({children}: {children: ReactNode}) {
  const [language, setLanguage] = useState<Language>('cs');
  useEffect(() => {
    try { if (localStorage.getItem('dotace-language') === 'en') setLanguage('en'); } catch {}
  }, []);
  const changeLanguage = useCallback((value: Language) => {
    setLanguage(value);
    try { localStorage.setItem('dotace-language', value); } catch {}
  }, []);
  useEffect(() => { document.documentElement.lang = language; }, [language]);
  const t: Translate = useCallback(text => typeof text === 'string' ? translate(text, language) as typeof text : text, [language]);
  return <LanguageContext.Provider value={{language, setLanguage: changeLanguage, t}}>{children}</LanguageContext.Provider>;
}

export const useLanguage = () => useContext(LanguageContext);

export function LanguageSwitch() {
  const {language, setLanguage} = useLanguage();
  return <div className="language-switch" role="group" aria-label="Language / Jazyk">
    <button type="button" aria-pressed={language === 'cs'} onClick={() => setLanguage('cs')}>Čeština</button>
    <button type="button" aria-pressed={language === 'en'} onClick={() => setLanguage('en')}>English</button>
  </div>;
}
