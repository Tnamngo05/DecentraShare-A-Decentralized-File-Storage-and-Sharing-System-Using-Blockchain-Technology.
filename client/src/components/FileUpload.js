import { useEffect, useState } from "react";
import axios from "axios";
import "./FileUpload.css";

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || "http://localhost:4000";

function fileToBase64(selectedFile) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      const commaIndex = result.indexOf(",");
      resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result);
    };
    reader.onerror = () => reject(reader.error || new Error("Không thể đọc tệp tin."));
    reader.readAsDataURL(selectedFile);
  });
}

const FileUpload = ({ contract, account }) => {
  const [file, setFile] = useState(null);
  const [fileName, setFileName] = useState("Chưa có tệp nào được chọn");
  const [uploading, setUploading] = useState(false);

  // Khi tài khoản thay đổi, reset lựa chọn tệp
  useEffect(() => {
    setFile(null);
    setFileName("Chưa có tệp nào được chọn");
  }, [account]);

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!file || !contract || !account) return;

    try {
      setUploading(true);
      const data = await fileToBase64(file);

      const response = await axios.post(`${API_BASE_URL}/api/upload`, {
        fileName: file.name,
        mimeType: file.type || "application/octet-stream",
        data,
      });

      const ipfsUrl = response.data?.ipfsUrl;
      if (!ipfsUrl) throw new Error("Dịch vụ tải lên không trả về liên kết IPFS.");

      const transaction = await contract.add(ipfsUrl);
      await transaction.wait();

      alert("Tải tệp lên thành công và đã lưu thông tin vào Smart Contract!");
      setFile(null);
      setFileName("Chưa có tệp nào được chọn");
    } catch (error) {
      console.error("Lỗi tải tệp:", error);
      alert(
        error?.response?.data?.error ||
          error?.message ||
          "Không thể tải tệp lên. Vui lòng kiểm tra lại kết nối và xác nhận trên MetaMask."
      );
    } finally {
      setUploading(false);
    }
  };

  const retrieveFile = (event) => {
    const selectedFile = event.target.files?.[0];
    if (!selectedFile) return;

    if (selectedFile.size > 20 * 1024 * 1024) {
      alert("Vui lòng chọn tệp có dung lượng nhỏ hơn 20 MB.");
      event.target.value = "";
      return;
    }

    setFile(selectedFile);
    setFileName(selectedFile.name);
    event.target.value = "";
  };

  return (
    <div className="top">
      <form className="form" onSubmit={handleSubmit}>
        <label htmlFor="file-upload" className="choose">
          Chọn tệp
        </label>

        <input
          disabled={!account || uploading}
          type="file"
          id="file-upload"
          name="data"
          onChange={retrieveFile}
        />

        <span className="textArea">Tệp đã chọn: {fileName}</span>

        <button type="submit" className="upload" disabled={!file || uploading}>
          {uploading ? "Đang tải lên..." : "Tải tệp lên"}
        </button>
      </form>
    </div>
  );
};

export default FileUpload;
