import { MiddlewareNext } from './MiddlewareNext';

export type MiddlewarePromise = Promise<Error|void> | void;
export type MiddlewareHandler = (request: Request, response: Response, next?: MiddlewareNext) => MiddlewarePromise;