import axios from "axios"

export const axiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  timeout: 5 * 60 * 1000,
})
