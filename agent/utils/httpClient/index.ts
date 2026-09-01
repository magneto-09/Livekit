import type { AxiosError, AxiosRequestConfig, AxiosResponse } from "axios"
import { axiosInstance } from "./axiosGlobalConfig.js"
import type {
  httpClientcallApiArgs,
  httpClientInterface,
} from "./httpInterface.js"

export const httpClient: httpClientInterface = {
  callAPI: async ({
    url,
    method = "GET",
    query,
    data,
    headers,
  }: httpClientcallApiArgs): Promise<any> => {
    try {
      const config: AxiosRequestConfig = {
        url,
        method,
        params: query,
        data,
        headers: { ...headers },
      }
      if (data && typeof data === "object") {
        ;(config.headers as Record<string, string>)["Content-Type"] =
          "application/json"
      }

      const fetchedData: AxiosResponse = await axiosInstance(config)
      return fetchedData?.data
    } catch (error) {
      const err = error as AxiosError
      console.log(err)
    }
  },
}
