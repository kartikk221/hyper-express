import { MiddlewareNext } from './MiddlewareNext';
import { Request, DefaultRequestLocals } from '../http/Request';
import { Response, DefaultResponseLocals } from '../http/Response';

export type MiddlewarePromise = PromiseLike<unknown>;
export type MiddlewareHandler = (
    request: Request<DefaultRequestLocals>,
    response: Response<DefaultResponseLocals>,
    next: MiddlewareNext
) => unknown;
