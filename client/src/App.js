import Upload from "./contracts/Upload.json";
import deploymentConfig from "./contracts/deployment.json";
import { useCallback, useEffect, useState } from "react";
import { ethers } from "ethers";
import FileUpload from "./components/FileUpload";
import Display from "./components/Display";
import Modal from "./components/Modal";
import "./App.css";

const CONTRACT_ADDRESS =
  process.env.REACT_APP_CONTRACT_ADDRESS || deploymentConfig?.contractAddress || "";
const EXPECTED_CHAIN_ID =
  process.env.REACT_APP_CHAIN_ID || String(deploymentConfig?.chainId || "1337");

function App() {
  const [account, setAccount] = useState("");
  const [contract, setContract] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [status, setStatus] = useState("");

  // Hàm khởi tạo signer và smart contract theo địa chỉ ví cụ thể
  const setupAccountAndContract = useCallback(async (targetAccount) => {
    try {
      if (!window.ethereum || !targetAccount) {
        setAccount("");
        setContract(null);
        return;
      }

      const activeContractAddress = CONTRACT_ADDRESS.trim();
      if (!activeContractAddress || !ethers.utils.isAddress(activeContractAddress)) {
        setStatus("Chưa tìm thấy Smart Contract. Vui lòng kiểm tra lại cấu hình hợp đồng.");
        setAccount(targetAccount);
        setContract(null);
        return;
      }

      const web3Provider = new ethers.providers.Web3Provider(window.ethereum, "any");

      let currentChainId = "";
      try {
        const network = await web3Provider.getNetwork();
        currentChainId = String(network.chainId);
      } catch {
        const hexChainId = await window.ethereum.request({ method: "eth_chainId" });
        currentChainId = String(parseInt(hexChainId, 16));
      }

      // Kiểm tra Chain ID có đúng với mạng yêu cầu không
      if (String(currentChainId) !== String(EXPECTED_CHAIN_ID)) {
        setAccount(targetAccount);
        setContract(null);
        setStatus(
          `Sai mạng kết nối. Vui lòng chuyển MetaMask sang mạng Localhost (Chain ID: ${EXPECTED_CHAIN_ID}, RPC: http://127.0.0.1:8545).`
        );
        return;
      }

      // Khởi tạo signer và contract gắn chặt với tài khoản mới
      const signer = web3Provider.getSigner(targetAccount);
      const verifiedAddress = await signer.getAddress();
      const uploadContract = new ethers.Contract(activeContractAddress, Upload.abi, signer);

      setAccount(verifiedAddress);
      setContract(uploadContract);
      setStatus("");
    } catch (error) {
      console.error("Lỗi khởi tạo tài khoản/contract:", error);
      setStatus(error?.message || "Lỗi khởi tạo kết nối ví.");
    }
  }, []);

  // Kết nối MetaMask chủ động khi người dùng bấm nút
  const connectWallet = useCallback(async () => {
    try {
      if (!window.ethereum) {
        setStatus("Chưa cài đặt tiện ích MetaMask. Vui lòng cài đặt MetaMask trên trình duyệt để tiếp tục.");
        return;
      }

      const activeContractAddress = CONTRACT_ADDRESS.trim();
      if (!activeContractAddress || !ethers.utils.isAddress(activeContractAddress)) {
        setStatus("Chưa tìm thấy Smart Contract. Vui lòng chạy lệnh: npm run deploy:local");
        return;
      }

      // Yêu cầu quyền truy cập tài khoản từ MetaMask
      const accounts = await window.ethereum.request({
        method: "eth_requestAccounts",
      });

      if (!accounts || accounts.length === 0) {
        setStatus("Không có tài khoản nào được kết nối từ MetaMask.");
        return;
      }

      await setupAccountAndContract(accounts[0]);
    } catch (error) {
      console.error("Lỗi kết nối MetaMask:", error);
      setStatus(error?.message || "Không thể kết nối ví MetaMask.");
    }
  }, [setupAccountAndContract]);

  // Lắng nghe sự kiện chuyển tài khoản (accountsChanged) và chuyển mạng (chainChanged)
  useEffect(() => {
    if (!window.ethereum) return;

    let isMounted = true;

    // Kiểm tra kết nối tài khoản đã được cấp quyền trước đó khi tải trang
    window.ethereum
      .request({ method: "eth_accounts" })
      .then(async (accounts) => {
        if (!isMounted) return;
        if (accounts && accounts.length > 0) {
          await setupAccountAndContract(accounts[0]);
        }
      })
      .catch((error) => console.error("Lỗi kiểm tra kết nối ví ban đầu:", error));

    // Xử lý khi người dùng đổi tài khoản trong MetaMask
    const handleAccountsChanged = async (accounts) => {
      if (!isMounted) return;
      if (!accounts || accounts.length === 0) {
        // Người dùng đã ngắt kết nối hoặc khóa ví
        setAccount("");
        setContract(null);
        setStatus("Ví MetaMask đã ngắt kết nối. Vui lòng nhấn 'Kết nối ví MetaMask' để tiếp tục.");
      } else {
        // Cập nhật ngay lập tức sang tài khoản mới và tạo lại signer + contract
        await setupAccountAndContract(accounts[0]);
      }
    };

    // Xử lý khi người dùng đổi mạng (Chain ID)
    const handleChainChanged = async () => {
      if (!isMounted) return;
      try {
        const accounts = await window.ethereum.request({ method: "eth_accounts" });
        if (!isMounted) return;
        if (accounts && accounts.length > 0) {
          await setupAccountAndContract(accounts[0]);
        } else {
          setAccount("");
          setContract(null);
        }
      } catch (err) {
        console.error("Lỗi xử lý sự kiện đổi mạng:", err);
      }
    };

    // Đăng ký event listeners
    window.ethereum.on("accountsChanged", handleAccountsChanged);
    window.ethereum.on("chainChanged", handleChainChanged);

    // Hủy đăng ký listener khi unmount để tránh rò rỉ bộ nhớ hoặc gọi trùng lặp
    return () => {
      isMounted = false;
      if (window.ethereum && window.ethereum.removeListener) {
        window.ethereum.removeListener("accountsChanged", handleAccountsChanged);
        window.ethereum.removeListener("chainChanged", handleChainChanged);
      }
    };
  }, [setupAccountAndContract]);

  return (
    <>
      {!modalOpen && account && (
        <button className="share" onClick={() => setModalOpen(true)}>
          Chia sẻ quyền
        </button>
      )}

      {modalOpen && (
        <Modal
          key={`modal-${account}`}
          setModalOpen={setModalOpen}
          contract={contract}
          account={account}
        />
      )}

      <div className="App">
        <h1 style={{ color: "white" }}>Hệ Thống Lưu Trữ &amp; Chia Sẻ Tệp Phi Tập Trung 🔐</h1>

        <div className="bg"></div>
        <div className="bg bg2"></div>
        <div className="bg bg3"></div>

        <p style={{ color: "white" }}>
          Địa chỉ ví: {account ? account : "Chưa kết nối"}
        </p>

        {status && (
          <p role="alert" className="status">
            {status}
          </p>
        )}

        {!account && (
          <button className="connect" onClick={connectWallet}>
            Kết nối ví MetaMask
          </button>
        )}

        {account && contract && (
          <>
            <FileUpload key={`upload-${account}`} account={account} contract={contract} />
            <Display key={`display-${account}`} contract={contract} account={account} />
          </>
        )}
      </div>
    </>
  );
}

export default App;
