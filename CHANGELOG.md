# Changelog

## 2.0.0 (2026-09-19)

### Security

Both of these affect every earlier version.

- A form field named after something every object inherits, such as `toString.call`, was followed into the built-in and wrote on it. After one such request `Object.prototype.toString.call()` threw in every module of the process, while the request itself succeeded. Form keys are now only looked up among an object's own properties, and `toString` is an ordinary key of the result.
- A body that failed mid-stream, as when a client goes away, became an unhandled rejection in `json()`, `text()` and `pat()` and in their soft versions, and an unhandled rejection exits a Node process. The error is now thrown, or returned by the soft methods.

### Breaking

- `convertPluses` is on by default: a `+` in a URL-encoded body is a space, as browsers write it and as every other parser reads it. The `+` is now read before the percent escapes, so a plus sign posted as `%2B` stays one, which it did not when the option was on before. Pass `convertPluses: false` for a client that posts a raw plus sign.
- JSON: data after the document is refused with `INVALID_INPUT`, as `JSON.parse()` refuses it. It used to be ignored.
- Form keys that contradict each other fail with the new `KEY_CONFLICT`. `a=1&a.b=2` used to fail with the engine's `TypeError`, and other mixes of a plain value, an object and a list under one name succeeded and dropped data. A repeated plain name still keeps the last value.
- A `[]` before the end of a key starts a new item when a key comes that the item already holds: `rows[].name=a&rows[].age=1&rows[].name=b&rows[].age=2` is two rows. It used to be one row, holding the last values.
- An explicit list index has to stay below `maxKeys`, and fails with the new `INDEX_TOO_LARGE` otherwise. `a[4294967294]=x` used to pass every limit.
- `maxKeys` counts every named pair or part, and refuses the first one beyond the limit, in all parsers. The URL-encoded parser used to leave out the last pair and to count empty ones; the multipart parser refused at the limit.
- `maxDepth` is the depth of the parsed value in all parsers, with a list as a level of its own: `items[0].name` is 3 deep in a form, as it is in JSON. The multipart parser used to count only how deep parts were nested in one another, and refused every body at `maxDepth: 1`.
- `maxFiles: 1` allows one file; it used to refuse it. A form without files passes `maxFiles: 0`.
- `allowedContentTypes` is checked for files only, by media type. It used to be held against text fields too, so a form with a text field beside an allowed file was refused.
- A file input that was left empty no longer counts toward `maxFiles` and is not checked against `allowedContentTypes`. It still comes back as an empty `File`.
- Values keep their trailing newline. It used to be removed from every form value, so a textarea that ended in one lost it.
- `maxKeyLength` measures the decoded key of a URL-encoded pair.
- Exported helpers: `possibleCast` no longer converts pluses or removes newlines; `assignNestedValue` takes the longest list an index may build as a fourth argument and throws on a contradiction; `URLParamsParser.parseStream` is private.

### Fixed

- URL-encoded names are percent-decoded. A browser posts `tags[]` as `tags%5B%5D`, so the key grammar never applied to a native form post. Names and values are decoded the way the URL Standard decodes them; a `%` that is no escape is kept, where it used to throw a `URIError`.
- An instance-level `convertPluses` is used. Only a per-call value was.
- Content types are read by media type: `application/x-www-form-urlencoded;charset=UTF-8` and `text/plain;charset=UTF-8`, which `fetch()` writes itself, and `application/json; charset=utf-8` were refused. The boundary is read among other parameters, and may be quoted.
- A JSON body that stops half-way, a body of whitespace and a bare number (`12`) never settled. The first two are `INVALID_INPUT`; the number is returned.
- A refused body is cancelled in every parser, so its source is let go of. The JSON parser read a refused body to its end.
- Multipart names and filenames may be in any script, in nested parts too. Characters above `U+00FF` (`фото.jpg`, `📷.png`) used to fail the form with a `TypeError`.
- A character split between two chunks of a text body is kept whole.
- Added `decodeFormComponent` to the exports, and a list of the error codes to the README.

## 1.8.1 (2026-09-02)

- Added a Standard Schema example to the README

## 1.8.0 (2026-09-02)

- Accept Standard Schema v1 objects as validators (`form`/`softForm`, `json`/`softJson`, `text`/`softText`, `pat`/`softPat`). Function validators still work.
- Add `transform` (after parse, before validate) on form and JSON config so callers can coerce by schema shape without turning on global `castNumbers`/`castBooleans`.
- Export `assignNestedValue`, `extractNestedKey`, and `possibleCast`. Form keys refuse `__proto__`, `constructor`, and `prototype` segments.

## 1.7.3 (2026-07-02)

- Migrated TypeScript config from deprecated `moduleResolution: "node"` to `NodeNext`

## 1.7.2 (2026-07-02)

- Fixed form parsing for field names containing `-` (e.g. `first-name`, `stay-start`) in urlencoded and multipart bodies

## 1.7.1 (2025-03-25)

- Changed test harness to use Vitest
- Added further test coverage

## 1.7.0 (2025-03-25)

- Updated dependencies (changed to `@apeleghq/multipart-parser`)

## 1.6.2 (2024-04-05)

Better GenericIssue type

## 1.6.1 (2024-04-05)

Updated dependencies

## 1.6.0 (2024-04-05)

`soft` versions now include a [typed error property `GenericError { issues?: GenericIssue[] }`](./src/lib.ts#L73), which is the error thrown by the validator. It is based on a Zod error, but you may type it as something else if your parser throws a different error type. This is helpful for type narrowing (ie. you don't have to type `(result.error as any).issues` to get to the issues).

If you're not using Zod, to type the error property, pass it as the second generic type argument to `soft` methods. For example, `softForm<typeof myschema.parse, MyErrorType>(obj, myschema.parse)`. Note that you have to also manually type the parser if you want type its error differently.

## 1.5.2 (2024-04-03)

`soft` versions can now also return the parsed value if there was one returned but it did not pass the validation. This is useful when you want to show the user the parsed value in the form after a validation error.

## 1.5.1 (2024-04-03)

Added missing export for `BodyguardFormConfig` interface

## 1.5.0 (2024-02-20)

### New Features

**File upload support in multipart forms.** `form()` and `softForm()` will return uploaded files as [File objects](https://developer.mozilla.org/en-US/docs/Web/API/File).

## 1.4.0 (2024-02-19)

- **Breaking:** The `error` returned from `soft*` methods is now the error thrown by the handler without coercing it into a string. If you need further type narrowing, you can use the `as` operator in your catch block. Bodyguard errors are regular `Error` instances with the message as one of the consts from `ERRORS`.

- You can pass `convertPluses` as an option to the form methods to convert `+` to spaces in the form data when it's submitted in URL-encoded format. It won't affect multipart form data.
