# Changelog

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
