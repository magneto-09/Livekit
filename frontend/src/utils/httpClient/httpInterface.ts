export type ALLOWED_HTTP_METHODS = "GET" | "POST" | "PUT" | "PATCH" | "DELETE"

export interface httpClientcallApiArgs {
  url: string
  method?: ALLOWED_HTTP_METHODS
  query?: Record<string, any> // params
  data?: Record<string, any> | Blob // payload
  headers?: Record<string, string>
}

export interface httpClientInterface {
  callAPI: ({ url, method, query, data }: httpClientcallApiArgs) => Promise<any>
}
