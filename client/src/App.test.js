import { render, screen, act, waitFor } from "@testing-library/react";
import App from "./App";

describe("DecentraShare App", () => {
  afterEach(() => {
    delete window.ethereum;
  });

  test("khởi chạy ứng dụng DecentraShare thành công khi chưa có MetaMask", () => {
    delete window.ethereum;
    render(<App />);

    expect(
      screen.getByRole("heading", { name: /Hệ Thống Lưu Trữ & Chia Sẻ Tệp Phi Tập Trung/i })
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Kết nối ví MetaMask/i })).toBeInTheDocument();
    expect(screen.getByText(/Địa chỉ ví: Chưa kết nối/i)).toBeInTheDocument();
  });

  test("tự động cập nhật địa chỉ ví khi sự kiện accountsChanged được kích hoạt", async () => {
    const listeners = {};
    const mockEthereum = {
      request: jest.fn().mockImplementation(({ method }) => {
        if (method === "eth_accounts") {
          return Promise.resolve(["0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"]);
        }
        if (method === "eth_chainId") {
          return Promise.resolve("0x539");
        }
        return Promise.resolve("0x539");
      }),
      on: jest.fn().mockImplementation((event, callback) => {
        listeners[event] = callback;
      }),
      removeListener: jest.fn().mockImplementation((event) => {
        delete listeners[event];
      }),
    };

    window.ethereum = mockEthereum;

    render(<App />);

    // Kiểm tra tài khoản ban đầu
    await waitFor(() => {
      expect(
        screen.getByText(/0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266/i)
      ).toBeInTheDocument();
    });

    // Kích hoạt sự kiện accountsChanged sang Account 2
    await act(async () => {
      if (listeners["accountsChanged"]) {
        await listeners["accountsChanged"](["0x3023aD4236ccb0a36a8D83Acd4E331B1F3a3F305"]);
      }
    });

    // Địa chỉ ví phải cập nhật sang Account 2 ngay lập tức
    await waitFor(() => {
      expect(
        screen.getByText(/0x3023aD4236ccb0a36a8D83Acd4E331B1F3a3F305/i)
      ).toBeInTheDocument();
    });

    // Kích hoạt ngắt kết nối (accounts rỗng)
    await act(async () => {
      if (listeners["accountsChanged"]) {
        await listeners["accountsChanged"]([]);
      }
    });

    // Hiển thị trạng thái chưa kết nối
    await waitFor(() => {
      expect(screen.getByText(/Địa chỉ ví: Chưa kết nối/i)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Kết nối ví MetaMask/i })).toBeInTheDocument();
    });
  });
});
