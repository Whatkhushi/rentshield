import type { NextFunction, Request, Response } from 'express';
import type { ZodTypeAny, z } from 'zod';

/**
 * Validates req.body / req.query / req.params against zod schemas.
 * Parsed (typed, coerced) values are stored on res.locals so handlers
 * never touch unvalidated input.
 */
export function validate<
  B extends ZodTypeAny = ZodTypeAny,
  Q extends ZodTypeAny = ZodTypeAny,
  P extends ZodTypeAny = ZodTypeAny,
>(schemas: { body?: B; query?: Q; params?: P }) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      if (schemas.body) res.locals.body = schemas.body.parse(req.body ?? {});
      if (schemas.query) res.locals.query = schemas.query.parse(req.query);
      if (schemas.params) res.locals.params = schemas.params.parse(req.params);
      next();
    } catch (err) {
      next(err); // ZodError -> 400 in the error handler
    }
  };
}

export type Infer<T extends ZodTypeAny> = z.infer<T>;
