import axios from "axios"

export const axiosInstance = axios.create({
  baseURL: process.env.BACKEND_URL,
  timeout: 5 * 60 * 1000,
})
