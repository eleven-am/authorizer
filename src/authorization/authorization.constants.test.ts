import {
    CAN_PERFORM_KEY,
    ABILITY_KEY,
    AUTHORIZER_KEY,
    AUTHENTICATION_BACKEND,
} from './authorization.constants';

describe('Authorization Constants', () => {
    it('exports all constants as Symbols', () => {
        expect(typeof CAN_PERFORM_KEY).toBe('symbol');
        expect(typeof ABILITY_KEY).toBe('symbol');
        expect(typeof AUTHORIZER_KEY).toBe('symbol');
        expect(typeof AUTHENTICATION_BACKEND).toBe('symbol');
    });

    it('exports unique Symbols', () => {
        const symbols = [CAN_PERFORM_KEY, ABILITY_KEY, AUTHORIZER_KEY, AUTHENTICATION_BACKEND];
        const unique = new Set(symbols);

        expect(unique.size).toBe(4);
    });
});
