import { useEffect, useState } from "react";
import "./Display.css";

const Display = ({ contract, account }) => {
  const [data, setData] = useState([]);
  const [address, setAddress] = useState("");
  const [loading, setLoading] = useState(false);

  // Xóa danh sách tệp cũ khi tài khoản ví thay đổi
  useEffect(() => {
    setData([]);
  }, [account]);

  const getData = async () => {
    const targetAddress = address.trim() || account;
    if (!targetAddress || !contract) return;

    try {
      setLoading(true);
      const dataArray = await contract.display(targetAddress);

      if (!dataArray || dataArray.length === 0) {
        setData([]);
        alert("Không có tệp nào để hiển thị.");
        return;
      }

      setData(dataArray.map((item, index) => ({ url: item, index })));
    } catch (error) {
      console.error("Không thể lấy danh sách tệp:", error);
      setData([]);
      alert("Bạn không có quyền truy cập vào danh sách tệp của địa chỉ ví này.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="image-list">
        {data.map(({ url, index }) => (
          <a
            key={`${url}-${index}`}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="file-item"
          >
            📄 Mở tệp {index + 1}
          </a>
        ))}
      </div>

      <input
        type="text"
        placeholder="Nhập địa chỉ ví Ethereum (để trống nếu xem tệp của bạn)"
        className="address"
        aria-label="Địa chỉ Ethereum"
        value={address}
        onChange={(event) => setAddress(event.target.value)}
      />

      <button className="center button" onClick={getData} disabled={loading}>
        {loading ? "Đang tải dữ liệu..." : "Xem danh sách tệp"}
      </button>
    </>
  );
};

export default Display;
