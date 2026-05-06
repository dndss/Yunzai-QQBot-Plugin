let sharp
async function getSharp () {
  if (!sharp) {
    try {
      sharp = (await import("sharp")).default
    } catch {
      sharp = null
    }
  }
  return sharp
}

/** 压缩图片 buffer，返回压缩后的 buffer（若无需压缩则原样返回） */
export async function compressImage (buffer, maxBytes, logCb) {
  const s = await getSharp()
  if (!s || !maxBytes) return buffer
  if (buffer.length <= maxBytes) return buffer

  let quality = 105, output
  const size = maxBytes
  do {
    quality -= 10
    output = await s(buffer).jpeg({ quality }).toBuffer()
    if (logCb) logCb("debug", `图片压缩完成 ${quality}%(${(output.length / 1024).toFixed(2)}KB)`)
  } while (output.length > size && quality > 10)

  return output
}
