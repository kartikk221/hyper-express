import uWebSockets, { 
  TemplatedApp, 
  AppOptions 
} from "uWebSockets.js";


type BSEOptions = {};
const convertBSEOptionsToUWSOptions = (BSEOptions: BSEOptions): AppOptions => { return null as unknown as AppOptions };


const createApp = (BSEOptions: BSEOptions) => {
  const AppOptions = convertBSEOptionsToUWSOptions(BSEOptions);
  const TemplatedApp = uWebSockets.App(AppOptions);

  
};

type Req = {};
type Res = {};

type BSEContext<BSEContextState> = {
  req: Req;
  res: Res;
  set: (key: string, value: any) => void; // sys settings
  get: (key: string) => any; // sys settings
  state: BSEContextState;
};

enum API_MODE {
  PROXY = "proxy",
  SECURITY = "security",
  ERROR_HANDLER = "error_handler",
  LOGGER = "logger",
  VALIDATOR = "validator",
  TRANSFORMER = "transformer",
}

enum API_BOUND {
  INBOUND = "inbound",
  OUTBOUND = "outbound",
}

type InboundOutboundCallback<BSEContextState> = (BSEContext: BSEContext<BSEContextState>) => void;

type UseAPI<BSEContextState> = { 
  apiMode: API_MODE, 
  apiBound: API_BOUND,
  callback: InboundOutboundCallback<BSEContextState>,
};
const buildUseAPI = () => {};

enum HTTP_METHODS {
  GET = 'get',
  HEAD = 'head',
  POST = 'post',
  PUT = 'put',
  DELETE = 'delete',
  CONNECT = 'connect',
  OPTIONS = 'options',
  TRACE = 'trace',
  PATCH = 'patch',
}

type RouteHandler = (BSEContext: BSEContext<Record<string, any>>) => void;

type Route = {
  method: HTTP_METHODS,
  route: string,
  handlers: RouteHandler[],
};

type AttachRoutesAPI = {
  rootRoute: string;
  subRoutes: Record<string, Route[]>;
};
const buildAttachRoutesAPI = () => {};





