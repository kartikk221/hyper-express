import { MiddlewareNext, Response, Router, Server, Websocket } from '../../types/index';

// @ts-expect-error strict_middleware must be boolean
new Server({ strict_middleware: 'yes' });

const router = new Router();
// @ts-expect-error scoped handlers must be functions
router.set_error_handler('invalid');

// @ts-expect-error max_lifetime must be numeric
router.ws('/socket', { max_lifetime: 'forever' }, () => {});
// @ts-expect-error only documented WebSocket message lifetime modes are accepted
router.ws('/socket', { message_type: 'ArrayBufferCopied' }, () => {});

declare const websocket: Websocket;
// @ts-expect-error native send statuses are numeric, not boolean
const sent: boolean = websocket.send('message');

declare const response: Response;
// @ts-expect-error response bodies must be uWebSockets.js recognized string data
response.send({ value: 'invalid' });
// @ts-expect-error native drain callbacks must return a boolean
response.drain(() => {});

declare const next: MiddlewareNext;
// @ts-expect-error middleware errors must be Error objects
next('invalid');

void sent;
