import type { TranslationMap } from './types';

class Translator {
    private locale: string = 'en';
    private translations: Record<string, TranslationMap> = {};
    private listeners: Set<() => void> = new Set();

    constructor() {
        // Try to load saved locale
        try {
            const saved = localStorage.getItem('moltbot-locale');
            if (saved) {
                this.locale = saved;
            } else if (navigator.language.startsWith('pt')) {
                this.locale = 'pt-BR';
            }
        } catch (e) {
            // ignore
        }
    }

    get currentLocale() {
        return this.locale;
    }

    subscribe(cb: () => void) {
        this.listeners.add(cb);
        return () => this.listeners.delete(cb);
    }

    private notify() {
        this.listeners.forEach(cb => cb());
    }

    setResources(locale: string, resources: TranslationMap) {
        this.translations[locale] = resources;
        this.notify();
    }

    setLocale(locale: string) {
        if (this.locale === locale) return;
        this.locale = locale;
        try {
            localStorage.setItem('moltbot-locale', locale);
        } catch (e) {
            // ignore
        }
        this.notify();
    }

    t(key: string, params?: Record<string, string | number>): string {
        const table = this.translations[this.locale];

        let val = this.resolve(table, key);

        if (val === undefined || val === null) {
            // Fallback to EN if key missing in current
            if (this.locale !== 'en') {
                val = this.resolve(this.translations['en'], key);
            }
        }

        if (val === undefined || val === null) return key;
        if (typeof val !== 'string') return key;

        return this.interpolate(val, params);
    }

    private resolve(table: TranslationMap | undefined, key: string): any {
        if (!table) return undefined;
        return key.split('.').reduce((obj, i) => (obj ? obj[i] : null), table);
    }

    private interpolate(text: string, params?: Record<string, string | number>) {
        if (!params) return text;
        return text.replace(/\{(\w+)\}/g, (_, k) => String(params[k] ?? `{${k}}`));
    }
}

export const i18n = new Translator();
export const t = i18n.t.bind(i18n);
