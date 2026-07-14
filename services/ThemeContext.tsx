import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Language, translations, TranslationKey, getTranslation } from './i18n';

interface ThemeContextType {
  isDarkMode: boolean;
  toggleDarkMode: () => void;
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: TranslationKey) => string;
  isRTL: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const getStoredValue = (key: string, defaultValue: string): string => {
  if (typeof window === 'undefined') return defaultValue;
  try {
    return localStorage.getItem(key) || defaultValue;
  } catch {
    return defaultValue;
  }
};

export const ThemeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [language, setLanguageState] = useState<Language>('en');
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    setIsDarkMode(getStoredValue('farmxpert_dark_mode', 'false') === 'true');
    setLanguageState((getStoredValue('farmxpert_language', 'en') as Language) || 'en');
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    if (!isHydrated) return;
    try {
      localStorage.setItem('farmxpert_dark_mode', String(isDarkMode));
    } catch {}
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  useEffect(() => {
    if (!isHydrated) return;
    try {
      localStorage.setItem('farmxpert_language', language);
    } catch {}
    document.documentElement.dir = language === 'ur' ? 'rtl' : 'ltr';
    document.documentElement.lang = language;
  }, [language, isHydrated]);

  const toggleDarkMode = () => setIsDarkMode(prev => !prev);
  
  const setLanguage = (lang: Language) => setLanguageState(lang);
  
  const t = (key: TranslationKey): string => getTranslation(language, key);
  
  const isRTL = language === 'ur';

  return (
    <ThemeContext.Provider value={{ isDarkMode, toggleDarkMode, language, setLanguage, t, isRTL }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = (): ThemeContextType => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
