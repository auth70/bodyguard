export function generateBoundary(): string {
    let length = 10;
    let chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

export function generateMultipartBody(formData: {[key: string]: any}, boundary: string): string[] {
    let bodyArray: string[] = [];

    for (let key in formData) {
        if (typeof formData[key] === 'object' && !Array.isArray(formData[key]) && formData[key] !== null) {
            // This is a nested object. We need a new boundary.
            const nestedBoundary = generateBoundary();
            bodyArray.push(`--${boundary}`);
            bodyArray.push(`Content-Disposition: form-data; name="${key}"`);
            bodyArray.push(`Content-Type: multipart/mixed; boundary=${nestedBoundary}`);
            bodyArray.push('');

            const nestedBody = generateMultipartBody(formData[key], nestedBoundary);
            bodyArray = bodyArray.concat(nestedBody);
            bodyArray.push(`--${nestedBoundary}--`);
            bodyArray.push('');
        } else if(Array.isArray(formData[key])) {
            formData[key].forEach((val: any, index: number) => {
                bodyArray.push(`--${boundary}`);
                bodyArray.push(`Content-Disposition: form-data; name="${key}[]"`);
                bodyArray.push('');
                bodyArray.push(val);
            });
        } else {
            bodyArray.push(`--${boundary}`);
            bodyArray.push(`Content-Disposition: form-data; name="${key}"`);
            bodyArray.push('');
            bodyArray.push(formData[key]);
        }
    }

    return bodyArray;
}

export function createMultipartRequest(formData: {[key: string]: any}, options?: {
    noBoundary?: boolean;
    brokenBoundary?: boolean;
    prototypePollution?: boolean;
}): [Request, string] {
    const boundary = generateBoundary();
    let bodyArray: string[] = generateMultipartBody(formData, boundary);

    if(options?.prototypePollution) {
        bodyArray.push('');
        bodyArray.push(`--${boundary}`);
        bodyArray.push(`Content-Disposition: form-data; name="__proto__"`);
        bodyArray.push('');
        bodyArray.push('a');
    }

    bodyArray.push(`--${boundary}--`);
    bodyArray.push('');

    let bodyStr = bodyArray.join('\r\n');

    const stream = new ReadableStream({
        start(controller) {
            controller.enqueue(new TextEncoder().encode(bodyStr));
            controller.close();
        }
    })

    let hdr = `multipart/form-data; boundary=${boundary}`;

    if(options?.noBoundary) {
        hdr = "multipart/form-data";
    }

    if(options?.brokenBoundary) {
        hdr = `multipart/form-data; boundary=`;
    }

    return [new Request("http://localhost", ({
        method: "POST",
        headers: {
            "content-type": hdr,
            "content-length": bodyStr.length.toString()
        },
        body: stream,
        duplex: "half"
    } as any)), boundary];
}
