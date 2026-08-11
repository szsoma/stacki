import React, { createContext, useContext, useMemo } from 'react';
import en from './en.json';

const I18nContext = createContext(null);

const LOCALES = { en };

export function I18nProvider({ locale = 'en', children }) {
  const strings = LOCALES[locale] || LOCALES.en;
  const t = useMemo(
    () => (key, params) => {
      let template = strings[key];
      if (template === undefined || template === null) {
        console.warn(`[i18n] Missing key: "${key}"`);
        return key;
      }
      if (!params) return template;
      return template.replace(/\{(\w+)\}/g, (_, name) => {
        const value = params[name];
        return value !== undefined && value !== null ? String(value) : `{${name}}`;
      });
    },
    [strings]
  );
  return <I18nContext.Provider value={t}>{children}</I18nContext.Provider>;
}

export function useT() {
  const t = useContext(I18nContext);
  if (!t) throw new Error('useT() must be used inside <I18nProvider>');
  return t;
}
