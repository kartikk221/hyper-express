import { Readable } from 'stream';
import {
    MiddlewareNext,
    MultipartField,
    Request,
    Response,
    Router,
    Server,
    WebsocketSendStatus,
} from '../../types/index';

const server = new Server({
    strict_middleware: true,
    streaming: {
        readable: { highWaterMark: 1024 },
        writable: { highWaterMark: 1024 },
    },
});
const router = new Router();

router
    .set_error_handler(async (request, response, error) => {
        response.status(500).send(error.message);
    })
    .set_not_found_handler((request, response) => response.status(404).send());

router.ws(
    '/socket',
    {
        message_type: 'ArrayBuffer',
        close_on_backpressure_limit: true,
        max_lifetime: 30,
        send_pings_automatically: true,
    },
    (websocket) => {
        const status: WebsocketSendStatus = websocket.send(new Uint8Array([1, 2, 3]), true);
        const port: number = websocket.remote_port;
        websocket.atomic(async () => {
            await Promise.resolve();
            websocket.ping();
        });
        websocket.on('dropped', (message, is_binary) => void [message, is_binary, status]);
        websocket.on('subscription', (topic, new_count, old_count) =>
            void [topic, new_count, old_count, port]
        );
        websocket.on('error', (error) => void error.message);
    }
);

declare const request: Request;
declare const response: Response;
declare const next: MiddlewareNext;
declare const field: MultipartField;

const accepted: boolean = next();
const rejected: boolean = next(new Error('stop'));
const remote_port: number = request.port;
const proxy_port: number = request.proxy_port;
const streamed: Promise<Response> = response.stream(Readable.from(['body']));

response
    .header('x-one', 'one')
    .setHeader('x-two', 'two')
    .writeHeaders({ 'x-three': 'three' })
    .removeHeader('x-one')
    .begin_write();
response.send(new DataView(new ArrayBuffer(8)));
response.removeCookie('session', { path: '/admin', httpOnly: true });

const multipart_write: Promise<void> = field.write('/tmp/upload');
void [accepted, rejected, remote_port, proxy_port, streamed, multipart_write];

const descriptor = server.get_descriptor();
server.add_child_app_descriptor(descriptor).remove_child_app_descriptor(descriptor);
server.set_error_handler((req, res, error) => res.status(500).send(error.message));
server.set_not_found_handler((req, res) => res.status(404).send());
server.force_close();
