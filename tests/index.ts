import { describe, it, expect } from 'vitest';

import { Bodyguard } from '../src/index.js';
import { ERRORS, JSONLike, BodyguardValidator } from '../src/lib.js';

describe('Bodyguard basic tests', () => {
    it('fails with no content type (softForm)', async () => {
        const bodyguard = new Bodyguard();

        const req = new Request("http://localhost", {
            method: "POST",
            headers: {
                "content-type": "",
            },
            body: JSON.stringify({ a: 1 })
        });

        const validator: BodyguardValidator = (data: unknown): JSONLike => data as JSONLike;
        const result = await bodyguard.softForm(req, validator);

        expect(result.success).toBe(false);

        if (!result.success) {
            expect(result.error.message).toBe(ERRORS.NO_CONTENT_TYPE);
        }
    });

    it('fails with no body (softForm)', async () => {
        const bodyguard = new Bodyguard();

        const req = new Request("http://localhost", {
            method: "POST",
            headers: {
                "content-type": "application/json"
            },
        });

        const result = await bodyguard.softForm(req);

        expect(result.success).toBe(false);

        if (!result.success) {
            expect(result.error.message).toBe(ERRORS.BODY_NOT_AVAILABLE);
        }
    });

    it('fails with no body (text)', async () => {
        const bodyguard = new Bodyguard();

        const req = new Request("http://localhost", {
            method: "POST",
            headers: {
                "content-type": "application/json"
            },
        });

        await expect(bodyguard.text(req)).rejects.toThrow(ERRORS.BODY_NOT_AVAILABLE);
    });
});