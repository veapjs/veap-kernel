export type Token<T = any> = string | symbol | (new (...args: any[]) => T);
