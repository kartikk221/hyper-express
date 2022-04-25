import { MiddlewareNext } from './MiddlewareNext';
import { Request } from '../http/Request';
import { Response } from '../http/Response';

export type MiddlewarePromise = Promise<Error | void>;
export type MiddlewareHandler = (request: Request, response: Response, next: MiddlewareNext) => MiddlewarePromise | void;
