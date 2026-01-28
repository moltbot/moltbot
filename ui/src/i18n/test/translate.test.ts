import { describe, it, expect, beforeEach } from 'vitest';
import { i18n } from '../lib/translate';

describe('i18n', () => {
    beforeEach(() => {
        i18n.setResources('en', {
            hello: 'Hello World',
            greeting: 'Hello {name}',
            nested: {
                key: 'Nested Value'
            }
        });
        i18n.setResources('pt-BR', {
            hello: 'Olá Mundo',
            greeting: 'Olá {name}'
        });
        i18n.setLocale('en');
    });

    it('translates simple keys', () => {
        expect(i18n.t('hello')).toBe('Hello World');
    });

    it('translates with interpolation', () => {
        expect(i18n.t('greeting', { name: 'Alice' })).toBe('Hello Alice');
    });

    it('handles nested keys', () => {
        expect(i18n.t('nested.key')).toBe('Nested Value');
    });

    it('switches locales', () => {
        i18n.setLocale('pt-BR');
        expect(i18n.t('hello')).toBe('Olá Mundo');
    });

    it('fallbacks to en', () => {
        i18n.setLocale('pt-BR');
        // 'nested.key' is not in pt-BR
        expect(i18n.t('nested.key')).toBe('Nested Value');
    });

    it('returns key if missing', () => {
        expect(i18n.t('missing.key')).toBe('missing.key');
    });
});
