import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

type ShowToast = (type: string, message: string) => void;

const toastSource = readFileSync(path.resolve(__dirname, "../../public/toast.js"), "utf8");

beforeAll(() => {
  window.eval(toastSource);
});

beforeEach(() => {
  vi.useFakeTimers();
  document.querySelectorAll(".otoast").forEach((el) => el.remove());
});

const showToast = () => (window as unknown as { showToast: ShowToast }).showToast;
const toasts = () => Array.from(document.querySelectorAll<HTMLElement>(".otoast"));

describe("Outlined toast", () => {
  it("tipe yang tidak dikenal tidak pernah tampil sebagai success", () => {
    showToast()("sukses-palsu", "Pesan A");
    expect(toasts()[0]!.classList.contains("otoast-success")).toBe(false);
    expect(toasts()[0]!.classList.contains("otoast-warning")).toBe(true);
    vi.runAllTimers();
  });

  it("warning selalu diawali emoji ⚠️", () => {
    showToast()("warning", "Harap isi semua kolom");
    expect(toasts()[0]!.querySelector(".otoast-msg")?.textContent).toBe("⚠️ Harap isi semua kolom");
    vi.runAllTimers();
  });

  it("pesan yang sama tidak ditumpuk (anti-duplikat)", () => {
    showToast()("error", "Login gagal");
    showToast()("error", "Login gagal");
    expect(toasts()).toHaveLength(1);
    vi.runAllTimers();
  });

  it("toast hilang setelah 3 detik", () => {
    showToast()("success", "Login berhasil");
    vi.advanceTimersByTime(2900);
    expect(toasts()).toHaveLength(1);
    vi.advanceTimersByTime(400);
    expect(toasts()).toHaveLength(0);
  });
});
