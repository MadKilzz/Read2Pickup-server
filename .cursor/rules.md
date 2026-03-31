You are contributing to an existing Node.js + Express + Prisma project written in TypeScript.

General:
Follow the existing structure (routes, controllers, services).
Match the coding style of surrounding files.
Do not introduce new architecture or patterns unless asked.
Consistency with the current codebase is more important than innovation.

TypeScript:
Use proper types and interfaces.
Avoid using any unless absolutely necessary.
Use Prisma-generated types when possible.

Validation:
This project uses Zod for request validation.
Always use Zod schemas for validating request data.
Do not introduce other validation libraries.
Follow the existing Zod validation pattern used in the project (controller or middleware).
- For controller endpoints, use `ValidatedRequest<T>` with typed `validatedBody` / `validatedQuery`.
- Register schemas in routes via `formMiddelware.validateForm(...)` or `formMiddelware.validateQuery(...)`.
- In controllers, always handle `req.validationErrors` first and return `ApiError("INCORRECT_BODY")` when present.

Error handling:
Use async/await.
Use try/catch blocks as already implemented.
Follow the existing error response format.
Do not introduce new global error systems unless present.

Prisma:
Use Prisma Client only.
Avoid raw SQL unless already used.
Use select to prevent overfetching.
Never return sensitive fields (password, tokens).
Respect existing schema relations.

Authentication:
Authentication is handled via HTTP-only cookies.
Do not introduce localStorage-based auth.
Do not change the existing auth flow unless asked.

---------------------------------------
IDS & PACKAGE MANAGER
---------------------------------------

IDs:
- This project uses **Snowflake IDs** (numeric strings, typically 17–19 digits) for primary keys.
- Do not introduce UUID/CUID ID generation patterns unless explicitly asked.
- When creating new DB records on the server, generate IDs via `Snowflake.generate()`.

Package manager:
- Use **Yarn** for installs and scripts.
- Prefer `yarn add <pkg>` / `yarn remove <pkg>` and `yarn <script>` over npm/pnpm commands.