import { MiddlewareNext } from './MiddlewareNext';
import { Request, DefaultRequestLocals, RequestParams } from '../http/Request';
import { Response, DefaultResponseLocals } from '../http/Response';

export type MiddlewarePromise = Promise<Error | any>;
export type MiddlewareHandler<RequestOptions extends { Locals? : DefaultRequestLocals, Body? : any, Params? : RequestParams} = {Locals : DefaultRequestLocals}> = (
    request: Request<RequestOptions>,
    response: Response<DefaultResponseLocals>,
    next: MiddlewareNext
) => MiddlewarePromise | any;
