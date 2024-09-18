import { MiddlewareNext } from './MiddlewareNext';
import { Request, DefaultRequestLocals, RequestParams } from '../http/Request';
import { Response } from '../http/Response';

export type MiddlewarePromise = Promise<Error | any>;
export type MiddlewareHandler<RouteOptions extends { Locals? : DefaultRequestLocals, Body? : any, Params? : RequestParams, Response? : any} = {Locals : DefaultRequestLocals}> = (
    request: Request<RouteOptions>,
    response: Response<RouteOptions>,
    next: MiddlewareNext
) => MiddlewarePromise | any;
