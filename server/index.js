const fs = require("fs");
const http = require("http");
const path = require("path");
const crypto = require("crypto");

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator === -1) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnv(path.join(__dirname, "..", ".env"));

const PORT = Number(process.env.PORT || 4000);
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "http://localhost:3000";
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const UPLOAD_DIR = path.join(__dirname, "uploads");

// Đảm bảo thư mục lưu trữ tệp cục bộ tồn tại
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(body);
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;

    req.on("data", (chunk) => {
      total += chunk.length;
      if (total > MAX_FILE_BYTES * 1.4) {
        reject(Object.assign(new Error("Dung lượng yêu cầu quá lớn"), { code: "LIMIT" }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  // CORS Preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    return res.end();
  }

  // Kiểm tra trạng thái máy chủ
  if (req.method === "GET" && req.url === "/api/health") {
    return sendJson(res, 200, { ok: true, dichVu: "decentrashare-api", trangThai: "hoat-dong" });
  }

  // Tải tệp đã lưu qua IPFS cục bộ
  if (req.method === "GET" && req.url && req.url.startsWith("/ipfs/")) {
    const rawCid = req.url.slice("/ipfs/".length).split("?")[0].replace(/[^a-zA-Z0-9_-]/g, "");
    const filePath = path.join(UPLOAD_DIR, rawCid);
    const metaPath = path.join(UPLOAD_DIR, `${rawCid}.meta.json`);

    if (!fs.existsSync(filePath)) {
      return sendJson(res, 404, { error: "Không tìm thấy tệp IPFS yêu cầu." });
    }

    let mimeType = "application/octet-stream";
    let fileName = rawCid;
    if (fs.existsSync(metaPath)) {
      try {
        const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
        if (meta.mimeType) mimeType = meta.mimeType;
        if (meta.fileName) fileName = meta.fileName;
      } catch (e) {}
    }

    const stat = fs.statSync(filePath);
    res.writeHead(200, {
      "Content-Type": mimeType,
      "Content-Length": stat.size,
      "Content-Disposition": `inline; filename="${encodeURIComponent(fileName)}"`,
      "Access-Control-Allow-Origin": "*",
    });

    return fs.createReadStream(filePath).pipe(res);
  }

  // Đường dẫn tải lên tệp
  if (req.method !== "POST" || req.url !== "/api/upload") {
    return sendJson(res, 404, { error: "Đường dẫn không tồn tại." });
  }

  try {
    const rawBody = await readRequestBody(req);
    const payload = JSON.parse(rawBody);
    const { fileName, mimeType, data } = payload;

    if (!fileName || !data) {
      return sendJson(res, 400, { error: "Vui lòng cung cấp đầy đủ fileName và data." });
    }

    const fileBuffer = Buffer.from(data, "base64");
    if (fileBuffer.length === 0) {
      return sendJson(res, 400, { error: "Tệp tải lên bị rỗng." });
    }
    if (fileBuffer.length > MAX_FILE_BYTES) {
      return sendJson(res, 413, { error: "Dung lượng tệp vượt quá giới hạn cho phép (20 MB)." });
    }

    const apiKey = process.env.PINATA_API_KEY;
    const secretApiKey = process.env.PINATA_SECRET_API_KEY;
    const hasPinata = apiKey && secretApiKey && apiKey !== "your_pinata_api_key" && secretApiKey !== "your_pinata_secret_api_key";

    // 1. Nếu có cấu hình Pinata Cloud thực tế thì đẩy lên Pinata
    if (hasPinata) {
      try {
        const form = new FormData();
        form.append("file", new Blob([fileBuffer], { type: mimeType || "application/octet-stream" }), fileName);

        const pinataResponse = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
          method: "POST",
          headers: {
            pinata_api_key: apiKey,
            pinata_secret_api_key: secretApiKey,
          },
          body: form,
        });

        if (pinataResponse.ok) {
          const result = await pinataResponse.json();
          const cid = result?.IpfsHash;
          if (cid) {
            console.log(`[Pinata IPFS] Đã tải tệp lên thành công: ${fileName} -> CID: ${cid}`);
            return sendJson(res, 200, {
              cid,
              ipfsUrl: `https://gateway.pinata.cloud/ipfs/${cid}`,
            });
          }
        } else {
          console.warn("[Pinata IPFS] Không kết nối được Pinata, chuyển sang lưu trữ cục bộ.");
        }
      } catch (err) {
        console.warn("[Pinata IPFS] Lỗi kết nối Pinata, chuyển sang lưu trữ cục bộ:", err.message);
      }
    }

    // 2. Chế độ lưu trữ IPFS Cục bộ (hoạt động ngay cả khi không có Pinata API key)
    const hash = crypto.createHash("sha256").update(fileBuffer).digest("hex");
    const cid = `bafy${hash.slice(0, 46)}`;
    const filePath = path.join(UPLOAD_DIR, cid);
    const metaPath = path.join(UPLOAD_DIR, `${cid}.meta.json`);

    fs.writeFileSync(filePath, fileBuffer);
    fs.writeFileSync(
      metaPath,
      JSON.stringify(
        {
          fileName,
          mimeType: mimeType || "application/octet-stream",
          size: fileBuffer.length,
          thoiGianTao: new Date().toISOString(),
        },
        null,
        2
      )
    );

    const protocol = req.socket.encrypted ? "https" : "http";
    const host = req.headers.host || `localhost:${PORT}`;
    const ipfsUrl = `${protocol}://${host}/ipfs/${cid}`;

    console.log(`[Lưu trữ cục bộ] Đã lưu tệp: ${fileName} -> CID: ${cid}`);

    return sendJson(res, 200, {
      cid,
      ipfsUrl,
    });
  } catch (error) {
    console.error("Lỗi xử lý tải lên:", error);
    const status = error.code === "LIMIT" ? 413 : 500;
    return sendJson(res, status, {
      error: status === 413 ? "Yêu cầu vượt quá giới hạn 20 MB." : "Lỗi máy chủ không xác định.",
    });
  }
});

server.listen(PORT, () => {
  console.log(`Máy chủ DecentraShare API đang chạy tại http://localhost:${PORT}`);
});
