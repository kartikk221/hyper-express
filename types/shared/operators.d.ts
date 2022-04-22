export function wrap_object(original: object, target: object): void;

export type PathKeyItem = [key: string, index: number];
export function parse_path_parameters(pattern: string): PathKeyItem[];

export function array_buffer_to_string(array_buffer: ArrayBuffer, encoding?: string): string;

export function async_wait(delay: number): Promise<any>;

export function merge_relative_paths(base_path: string, new_path: string): string;