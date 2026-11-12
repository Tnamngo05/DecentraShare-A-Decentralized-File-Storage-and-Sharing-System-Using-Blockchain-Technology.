import { useEffect, useState, useCallback } from "react";
import "./Modal.css";

const Modal = ({ setModalOpen, contract, account }) => {
  const [address, setAddress] = useState("");
  const [accessList, setAccessList] = useState([]);
  const [sharing, setSharing] = useState(false);
  const [revoking, setRevoking] = useState("");

  const loadAccessList = useCallback(async () => {
    if (!contract) return;

    try {
      const records = await contract.shareAccess();
      setAccessList(
        records
          .map((record) => ({ user: record.user, access: record.access }))
          .filter((record) => record.user && record.user !== "0x0000000000000000000000000000000000000000")
      );
    } catch (error) {
      console.error("Không thể tải danh sách quyền truy cập:", error);
    }
  }, [contract]);

  useEffect(() => {
    loadAccessList();
    setAddress("");
  }, [loadAccessList, account]);

  const handleShare = async () => {
    if (!address.trim() || !contract) return;

    try {
      setSharing(true);
      const transaction = await contract.allow(address.trim());
      await transaction.wait();
      setAddress("");
      await loadAccessList();
      alert("Đã cấp quyền truy cập thành công!");
    } catch (error) {
      console.error("Lỗi cấp quyền:", error);
      alert("Không thể cấp quyền truy cập. Vui lòng kiểm tra lại địa chỉ ví và xác nhận giao dịch MetaMask.");
    } finally {
      setSharing(false);
    }
  };

  const handleRevoke = async (user) => {
    try {
      setRevoking(user);
      const transaction = await contract.disallow(user);
      await transaction.wait();
      await loadAccessList();
      alert("Đã thu hồi quyền truy cập thành công!");
    } catch (error) {
      console.error("Lỗi thu hồi quyền:", error);
      alert("Không thể thu hồi quyền truy cập. Vui lòng kiểm tra lại và xác nhận trên MetaMask.");
    } finally {
      setRevoking("");
    }
  };

  return (
    <div className="modalBackground">
      <div className="modalContainer">
        <div className="title">Chia Sẻ Quyền Truy Cập</div>

        <div className="body">
          <input
            type="text"
            className="address"
            placeholder="Nhập địa chỉ ví Ethereum cần chia sẻ (0x...)"
            value={address}
            onChange={(event) => setAddress(event.target.value)}
          />
        </div>

        <div className="accessList" aria-label="Danh sách người có quyền truy cập">
          <strong>Danh sách địa chỉ được cấp quyền:</strong>
          {accessList.length === 0 && <p>Chưa có địa chỉ nào được chia sẻ quyền.</p>}
          {accessList.map((record) => (
            <div className="accessRow" key={record.user}>
              <span>{record.user}</span>
              <button
                type="button"
                onClick={() => handleRevoke(record.user)}
                disabled={!record.access || revoking === record.user}
              >
                {revoking === record.user
                  ? "Đang thu hồi..."
                  : record.access
                  ? "Thu hồi quyền"
                  : "Đã thu hồi"}
              </button>
            </div>
          ))}
        </div>

        <div className="footer">
          <button
            onClick={() => setModalOpen(false)}
            id="cancelBtn"
            disabled={sharing || Boolean(revoking)}
          >
            Đóng
          </button>
          <button
            onClick={handleShare}
            disabled={sharing || Boolean(revoking) || !address.trim()}
          >
            {sharing ? "Đang cấp quyền..." : "Cấp quyền truy cập"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Modal;
