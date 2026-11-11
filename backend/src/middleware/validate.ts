import { NextFunction, Request, Response } from 'express';
import { AnyZodObject, ZodError, ZodTypeAny } from 'zod';
import { badRequest } from '../utils/errors';

type Part = 'body' | 'query' | 'params';

function formatIssues(error: ZodError) {
  return error.issues.map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
    code: issue.code,
  }));
}

export function validate(schema: AnyZodObject | ZodTypeAny, part: Part = 'body') {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req[part]);
    if (!result.success) {
      return next(badRequest(`Invalid request ${part}`, formatIssues(result.error)));
    }
    // Express 4 query is a getter in some versions; assign defensively.
    (req as unknown as Record<string, unknown>)[part] = result.data;
    return next();
  };
}
