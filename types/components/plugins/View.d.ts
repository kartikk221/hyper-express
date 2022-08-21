export interface ViewOptions {
    defaultEngine : string;
    root: string,
    // To Enable EJS Cache
    settings: {
        'view cache':  boolean;
    },
    cache: boolean,
    engines: {
        [key: string]: Function;
    },
}

export interface RenderOptions {

}

export class View {
    constructor(name: string, options: ViewOptions)

    /**
     * 
     * @param renderOptions {RenderOptions}
     * @param callback 
     */
    render(renderOptions: RenderOptions, callback: (err: unknown, html: string) => any): boolean | void 

    /* View Getters */
    get path(): string;

    get root(): string;
}