import { createWriteStream } from "node:fs"
import { mkdir, rm } from "node:fs/promises"
import path from "node:path"
import { Transform, Readable } from "node:stream"
import { pipeline } from "node:stream/promises"
import { ulid } from "ulid"

export const FILE_MAX_BYTES = 200 * 1024 * 1024
const FILE_CACHE_DIR = path.resolve("temp/QQBot/file-upload")

export class FileTooLargeError extends Error {
  constructor (size, maxBytes = FILE_MAX_BYTES) {
    super(`文件过大，最大支持 ${Math.floor(maxBytes / 1024 / 1024)}MB`)
    this.name = "FileTooLargeError"
    this.code = "FILE_TOO_LARGE"
    this.size = size
    this.maxBytes = maxBytes
  }
}

function getContentLength (response) {
  const value = Number(response.headers.get("content-length"))
  return Number.isSafeInteger(value) && value >= 0 ? value : undefined
}

function sanitizeFileName (name) {
  const value = String(name || "")
    .split(/[/\\]/)
    .pop()
    ?.replace(/[\u0000-\u001f<>:"/\\|?*]/g, "_")
    .replace(/[. ]+$/g, "")
    .trim()
    .slice(0, 180)
  return value || "file"
}

function getUrlFileName (url) {
  try {
    return sanitizeFileName(decodeURIComponent(new URL(url).pathname))
  } catch {
    return "file"
  }
}

async function getDeclaredSize (url) {
  try {
    const response = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
    })
    if (!response.ok) return
    return getContentLength(response)
  } catch {
    return
  }
}

export async function downloadRemoteFile (
  url,
  preferredName,
  {
    maxBytes = FILE_MAX_BYTES,
    cacheDir = FILE_CACHE_DIR,
  } = {},
) {
  const declaredSize = await getDeclaredSize(url)
  if (declaredSize > maxBytes) throw new FileTooLargeError(declaredSize, maxBytes)

  const controller = new AbortController()
  const response = await fetch(url, {
    redirect: "follow",
    signal: controller.signal,
  })
  if (!response.ok)
    throw new Error(`下载文件失败：HTTP ${response.status} ${response.statusText}`)
  if (!response.body) throw new Error("下载文件失败：响应内容为空")

  const responseSize = getContentLength(response)
  if (responseSize > maxBytes) {
    controller.abort()
    throw new FileTooLargeError(responseSize, maxBytes)
  }

  await mkdir(cacheDir, { recursive: true })
  const fileName = sanitizeFileName(preferredName || getUrlFileName(response.url || url))
  const filePath = path.resolve(cacheDir, `${ulid()}-${fileName}`)
  let downloadedBytes = 0
  const sizeLimiter = new Transform({
    transform (chunk, encoding, callback) {
      downloadedBytes += chunk.length
      if (downloadedBytes > maxBytes) {
        callback(new FileTooLargeError(downloadedBytes, maxBytes))
        return
      }
      callback(null, chunk)
    },
  })

  try {
    await pipeline(
      Readable.fromWeb(response.body),
      sizeLimiter,
      createWriteStream(filePath, { flags: "wx" }),
    )
    return {
      filePath,
      fileName,
      size: downloadedBytes,
    }
  } catch (error) {
    await rm(filePath, { force: true }).catch(() => {})
    throw error
  }
}

function getRemoteUrl (data) {
  if (typeof data?.url === "string" && /^https?:\/\//i.test(data.url)) return data.url
  if (typeof data?.file === "string" && /^https?:\/\//i.test(data.file)) return data.file
}

export async function cacheRemoteFileMessage (message, options) {
  const source = Array.isArray(message) ? message : [message]
  const prepared = source.map(segment => {
    if (segment?.type !== "file") return segment
    return { ...segment, data: { ...segment.data } }
  })
  const cachedFiles = []

  try {
    for (const segment of prepared) {
      if (segment?.type !== "file") continue
      const url = getRemoteUrl(segment.data)
      if (!url) continue

      const cached = await downloadRemoteFile(url, segment.data.name, options)
      cachedFiles.push(cached.filePath)
      segment.data.file = cached.filePath
      segment.data.name ||= cached.fileName
      delete segment.data.url
    }
    return {
      message: Array.isArray(message) ? prepared : prepared[0],
      cachedFiles,
    }
  } catch (error) {
    await cleanupCachedFiles(cachedFiles)
    throw error
  }
}

export async function cleanupCachedFiles (filePaths) {
  await Promise.all(
    filePaths.map(filePath => rm(filePath, { force: true }).catch(() => {})),
  )
}
